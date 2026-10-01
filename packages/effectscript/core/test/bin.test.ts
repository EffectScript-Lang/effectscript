import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

describe("bin entry points (review I10)", () => {
  it("EFFECTSCRIPT_DEV=1 runs the sources even when a stale dist exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-bin-"))
    try {
      fs.mkdirSync(path.join(dir, "bin"))
      fs.mkdirSync(path.join(dir, "dist/cli"), { recursive: true })
      fs.mkdirSync(path.join(dir, "src/cli"), { recursive: true })
      fs.copyFileSync(path.join(import.meta.dirname, "../bin/efx.js"), path.join(dir, "bin/efx.js"))
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }))
      fs.writeFileSync(path.join(dir, "dist/cli/main.js"), "export const main = () => 42\n")
      fs.writeFileSync(path.join(dir, "src/cli/main.ts"), "export const main = (): number => 7\n")
      const run = (env: Record<string, string>) =>
        spawnSync(process.execPath, [path.join(dir, "bin/efx.js")], { env: { ...process.env, ...env } }).status
      expect(run({ EFFECTSCRIPT_DEV: "1" })).toBe(7)
      expect(run({ EFFECTSCRIPT_DEV: "0" })).toBe(42)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
