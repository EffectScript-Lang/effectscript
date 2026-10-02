import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.join(import.meta.dirname, "..")

// ADR-0032: the checked-in `src/cli/*.ts` are `pnpm codegen` output of the `.efx` command modules
describe("dogfooded CLI codegen", () => {
  it("has command modules", () => {
    expect(fs.readdirSync(path.join(root, "src/cli")).filter((f) => f.endsWith(".efx")).length).toBeGreaterThan(0)
  })

  it("the generated TypeScript is up to date (run pnpm codegen)", () => {
    const result = spawnSync(process.execPath, ["scripts/compile-cli.ts", "--check"], { cwd: root, encoding: "utf8" })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  }, 60_000)
})
