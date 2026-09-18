const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawn, spawnSync } = require("node:child_process")

function run(args) {
  const r = spawnSync("opencode", args, { encoding: "utf8", shell: process.platform === "win32" })
  assert.strictEqual(r.status, 0, [r.stdout, r.stderr].filter(Boolean).join("\n"))
  return (r.stdout || "") + (r.stderr || "")
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const config = run(["debug", "config"])
  assert.match(config, /architect/)
  assert.match(config, /planner/)
  assert.match(config, /code-reviewer/)
  assert.match(config, /security-reviewer/)
  assert.match(config, /tdd-guide/)

  const agents = run(["debug", "agents"])
  for (const name of ["architect", "planner", "code-reviewer", "security-reviewer", "tdd-guide"]) {
    assert.ok(agents.includes(name), "missing runtime agent: " + name)
  }

  const state = path.join(os.homedir(), ".config", "opencode", "ecc-install-state.json")
  assert.ok(fs.existsSync(state), "ECC install-state was not created: " + state)

  const plugins = run(["plugin", "list"])
  assert.ok(plugins.includes("ecc-universal"), "ECC v2 plugin is not active:\n" + plugins)

  console.log("OpenCode v2 runtime smoke passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
