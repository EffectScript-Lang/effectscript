import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const packages = path.resolve(import.meta.dirname, "../../..")
const register = path.resolve(import.meta.dirname, "../src/register.ts")

const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-register-"))
  fs.mkdirSync(path.join(dir, "node_modules"))
  fs.symlinkSync(path.join(packages, "effect"), path.join(dir, "node_modules/effect"))
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }))
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text)
  return dir
}

const run = (dir: string, entry: string) =>
  spawnSync(process.execPath, ["--import", register, entry], { cwd: dir, encoding: "utf8" })

describe("effectscript/register (ADR-0021)", () => {
  const dirs: Array<string> = []
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("runs a .ts entry importing .efx, which imports .ts and uses an enum", () => {
    const dir = project({
      "util.ts": "export const exclaim = (s: string): string => `${s}!`\n",
      "lib.efx":
        "import { exclaim } from \"./util.ts\"\nenum Color { Red, Green }\nexport effect greet(name: string): string {\n  const n = await succeed(name.length)\n  return exclaim(`hi ${name} (${n}) ${Color[Color.Green]}`)\n}\n",
      "main.ts":
        "import { Effect } from \"effect\"\nimport { greet } from \"./lib.efx\"\nconsole.log(Effect.runSync(greet(\"ada\")))\n"
    })
    dirs.push(dir)
    const result = run(dir, "main.ts")
    expect(result.stderr).not.toMatch(/Error/)
    expect(result.stdout.trim()).toBe("hi ada (3) Green!")
  }, 120_000)

  it("rejects .efx that compiles to TSX with EFX1101", () => {
    const dir = project({ "view.efx": "export const view = <div />\n", "main.ts": "import \"./view.efx\"\n" })
    dirs.push(dir)
    const result = run(dir, "main.ts")
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EFX1101")
  }, 120_000)

  it("reports compile errors with the file and code", () => {
    const dir = project({ "bad.efx": "effect f() {\n  const x = .\n}\n", "main.ts": "import \"./bad.efx\"\n" })
    dirs.push(dir)
    const result = run(dir, "main.ts")
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/bad\.efx:2:\d+ - error EFX1001/)
  }, 120_000)
})
