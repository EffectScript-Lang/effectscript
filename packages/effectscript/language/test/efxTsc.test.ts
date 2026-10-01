import { spawnSync } from "node:child_process"
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
})
