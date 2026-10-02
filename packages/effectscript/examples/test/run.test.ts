import { spawnSync } from "node:child_process"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.join(import.meta.dirname, "..")
const efx = path.join(root, "../core/bin/efx.js")
const hasBun = spawnSync("bun", ["--version"]).status === 0
const expected = ["Hello, Ada!", "Hello, Grace!", "No user 3"]

describe("the examples run", () => {
  it("on Node: efx run src/main.efx", () => {
    const result = spawnSync(process.execPath, [efx, "run", "--runtime", "node", "src/main.efx"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
    })
    expect(result.stdout.trim().split("\n")).toEqual(expected)
  }, 60_000)

  it.skipIf(!hasBun)("on Bun: bun ./src/main.efx and bun test", () => {
    expect(spawnSync("bun", ["./src/main.efx"], { cwd: root, encoding: "utf8" }).stdout.trim().split("\n")).toEqual(
      expected
    )
    expect(spawnSync("bun", ["test", "test-bun"], { cwd: root, encoding: "utf8" }).status).toBe(0)
  }, 60_000)
})
