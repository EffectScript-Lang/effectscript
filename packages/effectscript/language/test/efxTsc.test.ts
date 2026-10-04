import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

// Spawned processes run the sources, never a stale dist/ (review I10).
process.env.EFFECTSCRIPT_DEV = "1"

const packageDir = path.resolve(import.meta.dirname, "..")

describe("efx-tsc (ADR-0019)", () => {
  it("reports type errors at their .efx and .ts positions, with tsc's exit code", () => {
    const fixture = path.join(import.meta.dirname, "fixtures/check")
    const result = spawnSync(process.execPath, [path.join(packageDir, "bin/efx-tsc.js"), "-p", "tsconfig.json"], {
      cwd: fixture,
      encoding: "utf8"
    })
    const errors = result.stdout.split("\n").filter((line) => line.includes("error TS"))
    expect(errors.map((line) => line.slice(0, line.indexOf(":", line.indexOf(")"))))).toEqual([
      "src/bad.efx(2,9)",
      "src/use.ts(3,29)"
    ])
    expect(result.status).toBe(2)
  }, 120_000)

  const run = (fixture: string) =>
    spawnSync(process.execPath, [path.join(packageDir, "bin/efx-tsc.js"), "-p", "tsconfig.json"], {
      cwd: path.join(import.meta.dirname, "fixtures", fixture),
      encoding: "utf8"
    })

  it("reports EffectScript compiler errors too (review I1)", () => {
    const result = run("check-efx")
    expect(result.stdout).toContain("src/unused.efx(1,1): error EFX2003: This effect is created but never used")
    expect(result.status).toBe(2)
  }, 120_000)

  it("reports errors in generated code at a source anchor instead of dropping them (review I1)", () => {
    // outside the repository, so `effect` can't be found by walking up to a node_modules
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-check-missing-"))
    fs.cpSync(path.join(import.meta.dirname, "fixtures/check-missing"), dir, { recursive: true })
    const result = spawnSync(process.execPath, [path.join(packageDir, "bin/efx-tsc.js"), "-p", "tsconfig.json"], {
      cwd: dir,
      encoding: "utf8"
    })
    fs.rmSync(dir, { recursive: true, force: true })
    expect(result.stdout).toMatch(/src\/plain\.efx\(1,1\): error TS2307: Cannot find module 'effect\/Effect'/)
    expect(result.status).toBe(2)
  }, 120_000)
})
