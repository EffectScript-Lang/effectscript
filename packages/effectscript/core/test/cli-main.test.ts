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

describe("efx print (Plan 8 Task 3)", () => {
  const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../.efx-print-"))
  fs.writeFileSync(path.join(dir, "a.efx"), "export effect double(n: number) {\n  return n * 2\n}\n")
  fs.writeFileSync(
    path.join(dir, "b.ts"),
    "import { Effect } from \"effect\"\nexport const double = Effect.fn(\"double\")(function*(n: number) {\n  return n * 2\n})\n"
  )

  it("prints .efx as TypeScript and .ts as EffectScript by default", () => {
    expect(run(["print", path.join(dir, "a.efx")]).stdout).toContain("Effect.fn(\"double\")")
    expect(run(["print", path.join(dir, "b.ts")]).stdout).toBe("export effect double(n: number) {\n  return n * 2\n}\n")
  })

  it("follows --to", () => {
    expect(run(["print", path.join(dir, "b.ts"), "--to", "ts"]).stdout).toContain("Effect.fn(\"double\")")
  })

  it("fails on a missing file", () => {
    expect(run(["print", path.join(dir, "missing.efx")]).status).toBe(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
