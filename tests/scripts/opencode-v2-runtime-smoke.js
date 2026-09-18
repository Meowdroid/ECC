const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const REQUIRED_AGENTS = ["architect", "planner", "code-reviewer", "security-reviewer", "tdd-guide"]
const AGENT_READY_ATTEMPTS = 5
const AGENT_READY_DELAY_MS = 500

function run(args) {
  const r = spawnSync(["opencode", ...args].join(" "), { encoding: "utf8", shell: true })
  assert.strictEqual(r.status, 0, [r.stdout, r.stderr].filter(Boolean).join("\n"))
  return (r.stdout || "") + (r.stderr || "")
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runUntilIncludes(args, requiredValues) {
  let output = ""

  for (let attempt = 0; attempt < AGENT_READY_ATTEMPTS; attempt += 1) {
    output = run(args)
    if (requiredValues.every((value) => output.includes(value))) {
      return output
    }
    if (attempt < AGENT_READY_ATTEMPTS - 1) {
      await sleep(AGENT_READY_DELAY_MS)
    }
  }

  for (const value of requiredValues) {
    assert.ok(output.includes(value), "missing runtime value: " + value)
  }
  return output
}

async function main() {
  const config = run(["debug", "config"])
  assert.match(config, /architect/)
  assert.match(config, /planner/)
  assert.match(config, /code-reviewer/)
  assert.match(config, /security-reviewer/)
  assert.match(config, /tdd-guide/)

  await runUntilIncludes(["debug", "agents"], REQUIRED_AGENTS)

  const state = path.join(os.homedir(), ".config", "opencode", "ecc-install-state.json")
  assert.ok(fs.existsSync(state), "ECC install-state was not created: " + state)

  await runUntilIncludes(["plugin", "list"], ["ecc-universal"])

  console.log("OpenCode v2 runtime smoke passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
