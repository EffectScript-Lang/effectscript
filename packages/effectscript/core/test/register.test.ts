import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

// Spawned processes run the sources, never a stale dist/ (review I10).
process.env.EFFECTSCRIPT_DEV = "1"

const packages = path.resolve(import.meta.dirname, "../../..")
const register = path.resolve(import.meta.dirname, "../src/register.ts")

const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-register-"))
  fs.mkdirSync(path.join(dir, "node_modules"))
  fs.symlinkSync(path.join(packages, "effect"), path.join(dir, "node_modules/effect"))
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "app", type: "module" }))
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

  it("derives service keys from the package, like efx build (review I5)", () => {
    const service = (label: string) =>
      `export service Database {\n  effect name(): string\n  layer = { name: effect () => "${label}" }\n}\n`
    const dir = project({
      "a.efx": service("A"),
      "b.efx": service("B"),
      "main.ts":
        "import { Effect, Layer } from \"effect\"\nimport * as A from \"./a.efx\"\nimport * as B from \"./b.efx\"\n" +
        "const program = Effect.gen(function*() {\n  const a = yield* A.Database\n  const b = yield* B.Database\n  return `${yield* a.name()} ${yield* b.name()}`\n})\n" +
        "console.log(Effect.runSync(program.pipe(Effect.provide(Layer.mergeAll(A.Database.layer, B.Database.layer)))))\n"
    })
    dirs.push(dir)
    const result = run(dir, "main.ts")
    expect(result.stderr).not.toMatch(/Error/)
    expect(result.stdout.trim()).toBe("A B")
  }, 120_000)

  it("stack traces point at .efx lines (review I6)", () => {
    const dir = project({
      "three.efx":
        "export effect one(): number {\n  return 1\n}\n\nexport function explode(): never {\n  throw new Error(\"boom\")\n}\n",
      "main.ts":
        "import { explode } from \"./three.efx\"\ntry {\n  explode()\n} catch (e) {\n  console.log((e as Error).stack!.split(\"\\n\")[1])\n}\n"
    })
    dirs.push(dir)
    const result = run(dir, "main.ts")
    expect(result.stdout).toContain("three.efx:6:9)")
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

  it("prints no Node warning about stripTypeScriptTypes, and keeps other warnings (Plan 18 Task 1)", () => {
    const dir = project({
      "app.efx": "effect main() {\n  return await succeed(42)\n}\nconsole.log(Effect.runSync(main()))\n",
      "warn.efx": "process.emitWarning(\"mine\", \"DeprecationWarning\")\nconsole.log(\"ok\")\n"
    })
    dirs.push(dir)
    const quiet = run(dir, "app.efx")
    expect(quiet.stderr).toBe("")
    expect(quiet.stdout).toBe("42\n")
    const own = run(dir, "warn.efx")
    expect(own.stdout).toBe("ok\n")
    expect(own.stderr).toContain("DeprecationWarning: mine")
  })

  it("leaves Node's own warning errors alone (Plan 21)", () => {
    const dir = project({
      "app.efx":
        "effect main() {\n  return await succeed(1)\n}\nconsole.log(Effect.runSync(main()))\ntry {\n  process.emitWarning(42 as never)\n} catch (e) {\n  console.log((e as { code?: string }).code)\n}\n"
    })
    dirs.push(dir)
    const result = run(dir, "app.efx")
    expect(result.stdout).toBe("1\nERR_INVALID_ARG_TYPE\n")
  })
})
