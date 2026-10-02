import { spawnSync } from "node:child_process"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const dir = path.join(import.meta.dirname, "doctest-failure")
const vitest = path.join(import.meta.dirname, "../node_modules/vitest/vitest.mjs")

describe("doctests (Plan 12, docs spec §1 criterion 1)", () => {
  it("report a wrong // => with a diff at the example's line in the doc comment", () => {
    const result = spawnSync(process.execPath, [vitest, "run", "--root", dir], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    })
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).toBe(1)
    expect(output).toContain("double: Wrong on purpose")
    expect(output).toMatch(/- 5\s+\+ 4/)
    expect(output).toMatch(/wrong\.efx:7:\d+/)
  }, 60_000)
})
