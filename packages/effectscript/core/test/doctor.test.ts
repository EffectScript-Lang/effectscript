import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const doctor = (dir: string) =>
  spawnSync(process.execPath, [efx, "doctor"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("efx doctor (Plan 8 Task 6)", () => {
  it("reports a configured project as ready", () => {
    // inside this package, so typescript, effect and @effectscript/language resolve
    const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../.efx-doctor-"))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "package.json"), "{ \"name\": \"app\" }\n")
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      "{ \"compilerOptions\": { \"plugins\": [{ \"name\": \"@effectscript/language\" }] } }\n"
    )
    const result = doctor(dir)
    expect(result.stdout).toMatch(/ok\s+Node/)
    expect(result.stdout).toMatch(/ok\s+TypeScript 6/)
    expect(result.stdout).toMatch(/ok\s+tsconfig\.json plugin/)
    expect(result.status).toBe(0)
  })

  it("lists what is missing, with fixes, and exits 1", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-doctor-"))
    dirs.push(dir)
    const result = doctor(dir)
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(/missing\s+package\.json/)
    expect(result.stdout).toContain("efx init")
  })
})
