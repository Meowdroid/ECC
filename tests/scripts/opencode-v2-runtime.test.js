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

  const port = 41967
  const server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  })
  let serverLog = ""
  server.stdout.on("data", (d) => { serverLog += d.toString() })
  server.stderr.on("data", (d) => { serverLog += d.toString() })

  try {
    let tools = ""
    let last = ""
    for (let i = 0; i < 30; i += 1) {
      await sleep(1000)
      const password = (serverLog.match(/server password\s+(\S+)/) || [])[1]
      if (!password) continue
      const auth = Buffer.from("opencode:" + password).toString("base64")
      try {
        const response = await fetch("http://127.0.0.1:" + port + "/experimental/tool/ids", {
          headers: { Authorization: "Basic " + auth },
        })
        last = await response.text()
        if (response.ok && last.includes("changed-files")) {
          tools = last
          break
        }
      } catch (error) {
        last = String(error)
      }
      if (server.exitCode !== null) break
    }
    assert.ok(tools, "OpenCode server did not expose ECC tools. server=\n" + serverLog + "\napi=\n" + last)
    assert.ok(tools.includes("changed-files"), "changed-files tool missing")
    assert.ok(tools.includes("dependency-analyzer"), "dependency-analyzer tool missing")
  } finally {
    if (server.exitCode === null) server.kill()
  }

  console.log("OpenCode v2 runtime smoke passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
