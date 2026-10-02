import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const run = (args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [efx, ...args], { encoding: "utf8", env: { ...process.env, EFFECTSCRIPT_DEV: "1" } })

describe("efx CLI (Plan 8 Task 2)", () => {
  it("prints the version", () => {
    const version = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../package.json"), "utf8")).version
    const result = run(["--version"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(version)
  })

  it("prints help listing the commands", () => {
    const result = run(["--help"])
    expect(result.status).toBe(0)
    for (const name of ["build", "check", "run"]) expect(result.stdout).toContain(name)
  })

  it("shows the help without a command", () => {
    const result = run([])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("SUBCOMMANDS")
  })

  it("rejects an unknown command", () => {
    expect(run(["frobnicate"]).status).toBe(1)
  })

  it("passes a child's exit code through", () => {
    const result = run(["run", path.join(import.meta.dirname, "fixtures/cli-exit.ts")])
    expect(result.status).toBe(3)
  })
})
