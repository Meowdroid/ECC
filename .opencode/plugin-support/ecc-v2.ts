import { Plugin } from "@opencode/plugin"
import * as fs from "fs"
import * as path from "path"
import changedFilesTool from "../tools/changed-files.ts"
import dependencyAnalyzerTool from "../tools/dependency-analyzer.ts"
import * as changedFilesStore from "./lib/changed-files-store.ts"

type Registration = { dispose(): Promise<void> | void }
type HookProfile = "minimal" | "standard" | "strict"

function normalizeProfile(value: string | undefined): HookProfile {
  if (value === "minimal" || value === "strict") return value
  return "standard"
}

function getFilePath(input: unknown): string | null {
  if (!input || typeof input !== "object") return null
  const args = input as Record<string, unknown>
  const value = args.filePath ?? args.file_path ?? args.path
  return typeof value === "string" && value.trim() ? value : null
}

function oldToolExecutor(definition: any, directory: string) {
  return async (input: unknown) => {
    const value = await definition.execute(input, {
      directory,
      worktree: directory,
    })
    return { content: typeof value === "string" ? value : JSON.stringify(value) }
  }
}

/**
 * OpenCode v2 adapter.
 *
 * The v1 plugin returned a hook record. OpenCode v2 instead loads a
 * { id, setup } definition and requires hooks/tools to be registered through
 * the context domains.
 */
const ECCV2Plugin = Plugin.define({
  id: "ecc-universal",

  async setup(ctx) {
    const registrations: Registration[] = []
    const directory = ctx.location?.directory ?? process.cwd()
    const profile = normalizeProfile(process.env.ECC_HOOK_PROFILE)
    const disabled = new Set(
      (process.env.ECC_DISABLED_HOOKS || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
    const profileOrder: Record<HookProfile, number> = {
      minimal: 0,
      standard: 1,
      strict: 2,
    }
    const enabled = (id: string, required: HookProfile = "standard") =>
      !disabled.has(id) && profileOrder[profile] >= profileOrder[required]

    changedFilesStore.initStore(directory)
    const pendingWrites = new Map<string, "added" | "modified">()

    registrations.push(
      await ctx.tool.hook("execute.before", (event: any) => {
        if (event.tool !== "write") return
        const filePath = getFilePath(event.input)
        if (!filePath) return
        const absolute = path.isAbsolute(filePath) ? filePath : path.join(directory, filePath)
        pendingWrites.set(filePath, fs.existsSync(absolute) ? "modified" : "added")
      })
    )

    registrations.push(
      await ctx.tool.hook("execute.after", async (event: any) => {
        const filePath = getFilePath(event.input)
        if (event.tool === "edit" && filePath) {
          changedFilesStore.recordChange(filePath, "modified")
        }
        if (event.tool === "write" && filePath) {
          const pending = pendingWrites.get(filePath)
          pendingWrites.delete(filePath)
          if (event.status === "completed" && pending) {
            changedFilesStore.recordChange(filePath, pending)
          }
        }

        if (
          enabled("post:edit:typecheck", "strict") &&
          event.status === "completed" &&
          event.tool === "edit" &&
          filePath?.match(/\.tsx?$/)
        ) {
          // V2 has no legacy $ helper. Keep the hook non-fatal and let the
          // normal project verification workflow own type checking.
          console.info("[ECC] TypeScript file edited; run project typecheck before commit")
        }

        if (
          enabled("post:edit:console-warn") &&
          event.status === "completed" &&
          filePath?.match(/\.(ts|tsx|js|jsx)$/)
        ) {
          try {
            const absolute = path.isAbsolute(filePath) ? filePath : path.join(directory, filePath)
            const source = fs.readFileSync(absolute, "utf8")
            const count = (source.match(/console\.log/g) || []).length
            if (count > 0) {
              console.warn(`[ECC] console.log found in ${filePath} (${count} occurrence${count === 1 ? "" : "s"})`)
            }
          } catch {
            // Best effort only; tool execution must not fail because auditing failed.
          }
        }
      })
    )

    registrations.push(
      await ctx.shell.hook("create.before", (event: any) => {
        event.env.ECC_PLUGIN = "true"
        event.env.ECC_HOOK_PROFILE = profile
        event.env.ECC_DISABLED_HOOKS = process.env.ECC_DISABLED_HOOKS || ""
        event.env.PROJECT_ROOT = directory

        const lockfiles: Record<string, string> = {
          "bun.lockb": "bun",
          "pnpm-lock.yaml": "pnpm",
          "yarn.lock": "yarn",
          "package-lock.json": "npm",
        }
        for (const [lockfile, manager] of Object.entries(lockfiles)) {
          if (fs.existsSync(path.join(directory, lockfile))) {
            event.env.PACKAGE_MANAGER = manager
            break
          }
        }
      })
    )

    registrations.push(
      await ctx.permission.hook("evaluate", (event: any) => {
        if (["read", "glob", "grep", "search", "list"].includes(event.action)) {
          event.effect = "allow"
          event.message = "ECC: read-only operation"
        }
      })
    )

    registrations.push(
      await ctx.session.hook("compaction", (event: any) => {
        const changed = changedFilesStore.getChangedPaths()
        const lines = [
          "# ECC Context (preserve across compaction)",
          "",
          `- Hook profile: ${profile}`,
          "- Preserve current task status, key decisions, modified files, remaining work, and security concerns.",
        ]
        if (changed.length > 0) {
          lines.push("", "## Recently Edited Files")
          for (const item of changed) lines.push(`- ${item.path}`)
        }
        event.system.push({ type: "text", text: lines.join("\n") })
      })
    )

    registrations.push(
      await ctx.tool.transform((editor: any) => {
        editor.add({
          name: "changed-files",
          description: changedFilesTool.description,
          input: {
            type: "object",
            properties: {
              filter: { type: "string", enum: ["all", "added", "modified", "deleted"] },
              format: { type: "string", enum: ["tree", "json"] },
            },
            additionalProperties: false,
          },
          execute: oldToolExecutor(changedFilesTool, directory),
        })
        editor.add({
          name: "dependency-analyzer",
          description: dependencyAnalyzerTool.description,
          input: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["all", "outdated", "security", "unused"] },
              fix: { type: "boolean" },
              depth: { type: "number" },
            },
            additionalProperties: false,
          },
          execute: oldToolExecutor(dependencyAnalyzerTool, directory),
        })
      })
    )

    return async () => {
      for (const registration of registrations.reverse()) {
        await registration.dispose()
      }
      pendingWrites.clear()
      changedFilesStore.clearChanges()
    }
  },
})

export default ECCV2Plugin
