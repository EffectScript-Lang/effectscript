import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { createHarness } from "./utils/harness.ts"

// Spawned processes run the sources, never a stale dist/ (review I10).
process.env.EFFECTSCRIPT_DEV = "1"

const require = createRequire(import.meta.url)
const languageDir = path.resolve(import.meta.dirname, "..")
const packages = path.resolve(languageDir, "../..")
const efx = path.join(packages, "effectscript/core/bin/efx.js")
const tsc = require.resolve("typescript/lib/tsc.js")
const fixture = path.join(import.meta.dirname, "fixtures/adoption")
const expected = "Ada (1), missing 2"

const link = (dir: string, name: string, target: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, "node_modules", name)), { recursive: true })
  fs.symlinkSync(target, path.join(dir, "node_modules", name))
}
/** `effect` as a consumer gets it from npm: the publish-time `exports` over the built `dist/`. */
const linkPublishedEffect = (dir: string) => {
  const target = path.join(dir, "node_modules/effect")
  fs.mkdirSync(target, { recursive: true })
  const pkg = JSON.parse(fs.readFileSync(path.join(packages, "effect/package.json"), "utf8"))
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ ...pkg, exports: pkg.publishConfig.exports }))
  // a fresh checkout has no dist/ yet: build it as `pnpm build` does (tsc; the pure-call annotations
  // babel adds don't matter here)
  if (!fs.existsSync(path.join(packages, "effect/dist/index.js"))) {
    const built = spawnSync("pnpm", ["exec", "tsc", "-b", "tsconfig.json"], {
      cwd: path.join(packages, "effect"),
      encoding: "utf8"
    })
    if (built.status !== 0) throw new Error(`building effect failed:\n${built.stdout}${built.stderr}`)
  }
  // copied, not linked: a link's real path would sit under the workspace package.json (exports → src)
  fs.cpSync(path.join(packages, "effect/dist"), path.join(target, "dist"), {
    recursive: true,
    filter: (file) => !file.endsWith(".map")
  })
}
const node = (cwd: string, args: Array<string>) => spawnSync(process.execPath, args, { cwd, encoding: "utf8" })

describe("adoption slice, end to end (ADR-0016)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "efx-adoption-"))
  const project = path.join(root, "project")
  fs.cpSync(fixture, project, { recursive: true })
  link(project, "effect", path.join(packages, "effect"))
  link(project, "@types/node", path.join(languageDir, "node_modules/@types/node"))
  link(project, "@effectscript/language", languageDir)
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it("1. efx check passes, and reports an injected error at its .efx position", () => {
    // no --noEmit: efx check must never write files (review I2)
    const ok = node(project, [efx, "check", "-p", "tsconfig.json"])
    expect(ok.stdout + ok.stderr).toBe("")
    expect(ok.status).toBe(0)
    expect(fs.existsSync(path.join(project, "dist"))).toBe(false)
    const users = path.join(project, "src/users.efx")
    const original = fs.readFileSync(users, "utf8")
    fs.writeFileSync(users, `${original}export const broken: number = "x"\n`)
    const failed = node(project, [efx, "check", "-p", "tsconfig.json"])
    fs.writeFileSync(users, original)
    const line = original.split("\n").length
    expect(failed.stdout).toContain(`src/users.efx(${line},14): error TS2322`)
    expect(failed.status).not.toBe(0)
  }, 180_000)

  it("2. runs on Node through effectscript/register", () => {
    expect(node(project, [efx, "run", "src/main.ts"]).stdout.trim()).toBe(expected)
  }, 120_000)

  it("3. builds to .js + .d.ts that run on plain Node", () => {
    const built = node(project, [efx, "build", "-p", "tsconfig.json"])
    expect(built.stderr).toBe("")
    expect(built.status).toBe(0)
    expect(node(project, ["dist/main.js"]).stdout.trim()).toBe(expected)
  }, 180_000)

  it("4. a packed package works for a consumer with no EffectScript tooling", () => {
    const packed = spawnSync("npm", ["pack", "--pack-destination", root], { cwd: project, encoding: "utf8" })
    expect(packed.status).toBe(0)
    const tarball = path.join(root, packed.stdout.trim().split("\n").pop()!)
    const consumer = path.join(root, "consumer")
    const installed = path.join(consumer, "node_modules/effectscript-adoption")
    fs.mkdirSync(installed, { recursive: true })
    expect(spawnSync("tar", ["-xzf", tarball, "-C", installed, "--strip-components=1"]).status).toBe(0)
    expect(fs.readdirSync(path.join(installed, "dist")).some((f) => f.endsWith(".efx"))).toBe(false)
    linkPublishedEffect(consumer)
    link(consumer, "@types/node", path.join(languageDir, "node_modules/@types/node"))
    fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ type: "module" }))
    fs.writeFileSync(
      path.join(consumer, "app.ts"),
      "import { runDemo, User } from \"effectscript-adoption\"\n\nconst user: User = new User({ id: \"9\", name: \"Grace\" })\nconsole.log(`${runDemo()} / ${user.name}`)\n"
    )
    fs.writeFileSync(
      path.join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
          lib: ["ESNext", "DOM", "DOM.Iterable"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          // the published declarations are checked too (review C1)
          skipLibCheck: false,
          types: ["node"]
        },
        include: ["app.ts"]
      })
    )
    const checked = node(consumer, [tsc, "-p", "tsconfig.json"])
    expect(checked.stdout).toBe("")
    expect(checked.status).toBe(0)
    expect(node(consumer, ["app.ts"]).stdout.trim()).toBe(`${expected} / Grace`)
  }, 600_000)

  it("5. converting the compiled module back to EffectScript and recompiling is a fixed point", () => {
    const source = fs.readFileSync(path.join(fixture, "src/users.efx"), "utf8")
    const compiled = toTypeScript(source).code
    const back = toEffectScript(compiled).code
    expect(back).toContain("export error UserNotFound { id: string }")
    expect(back).toContain("export schema User {")
    expect(back).toContain("export effect findUser(id: string): User throws UserNotFound {")
    expect(toTypeScript(back).code).toBe(compiled)
  })

  it("6. editor features work across index.ts and users.efx", () => {
    const users = fs.readFileSync(path.join(fixture, "src/users.efx"), "utf8")
    const index = fs.readFileSync(path.join(fixture, "src/index.ts"), "utf8")
    const { dir, service } = createHarness({ "users.efx": users, "index.ts": index })
    const at = index.indexOf("describeUser(\"1\")")
    const [definition] = service.getDefinitionAtPosition(`${dir}/index.ts`, at)!
    expect(definition!.fileName).toBe(`${dir}/users.efx`)
    expect(users.slice(definition!.textSpan.start).startsWith("describeUser")).toBe(true)
    expect(service.getSemanticDiagnostics(`${dir}/index.ts`)).toEqual([])
    expect(service.getSemanticDiagnostics(`${dir}/users.efx`)).toEqual([])
  })
})
