import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-init-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), content)
  return dir
}
const init = (dir: string) =>
  spawnSync(process.execPath, [efx, "init"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8")

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("efx init (Plan 8 Task 5)", { timeout: 120_000 }, () => {
  it("adds the TS plugin and scripts, keeping comments and existing scripts", () => {
    const dir = project({
      "tsconfig.json": "{\n  // strictness first\n  \"compilerOptions\": {\n    \"strict\": true // always\n  }\n}\n",
      "package.json": "{\n  \"name\": \"app\",\n  \"scripts\": {\n    \"check\": \"tsc\"\n  }\n}\n"
    })
    const result = init(dir)
    expect(result.status).toBe(0)
    const tsconfig = read(dir, "tsconfig.json")
    expect(tsconfig).toContain("// strictness first")
    expect(tsconfig).toContain("// always")
    expect(tsconfig).toContain("\"plugins\": [{ \"name\": \"@effectscript/language\" }]")
    const pkg = JSON.parse(read(dir, "package.json"))
    expect(pkg.scripts.check).toBe("tsc")
    expect(pkg.scripts["build:efx"]).toBe("efx build")
    expect(result.stdout).toContain(`npm i -D effectscript@${version} @effectscript/language@${version} typescript@6`)
    expect(result.stdout).toContain("efx convert")
  })

  it("adds to an existing plugins array", () => {
    const dir = project({
      "tsconfig.json":
        "{\n  \"compilerOptions\": {\n    \"plugins\": [{ \"name\": \"@effect/language-service\" }]\n  }\n}\n",
      "package.json": "{ \"name\": \"app\" }\n"
    })
    init(dir)
    const plugins = JSON.parse(read(dir, "tsconfig.json")).compilerOptions.plugins
    expect(plugins).toEqual([{ name: "@effect/language-service" }, { name: "@effectscript/language" }])
  })

  it("is idempotent", () => {
    const dir = project({ "tsconfig.json": "{}\n", "package.json": "{ \"name\": \"app\" }\n" })
    init(dir)
    const once = [read(dir, "tsconfig.json"), read(dir, "package.json")]
    const again = init(dir)
    expect([read(dir, "tsconfig.json"), read(dir, "package.json")]).toEqual(once)
    expect(again.stdout).toContain("already")
  })

  it("sets up Blume in docs/ without overwriting anything", () => {
    const dir = project({
      "tsconfig.json": "{}\n",
      "package.json":
        "{\n  \"name\": \"bank\",\n  \"description\": \"A bank.\",\n  \"scripts\": {\n    \"docs\": \"mine\"\n  }\n}\n",
      ".gitignore": "node_modules/\ndocs/dist/\n"
    })
    expect(init(dir).status).toBe(0)
    const config = read(dir, "docs/blume.config.ts")
    expect(config).toContain("import { effectscript, frontmatter, markdown, theme } from \"effectscript/blume\"")
    expect(config).toContain("  theme,\n  markdown,\n  frontmatter,\n  integrations: [effectscript()]")
    expect(config).toContain("title: \"bank\"")
    // the theme's page parts and styles (ADR-0079); Blume reads components.ts statically
    expect(read(dir, "docs/components.ts")).toBe(
      "import { defineComponents } from \"blume\"\n" +
        "import Footer from \"effectscript/blume/components/Footer.astro\"\n" +
        "import PageHeader from \"effectscript/blume/components/PageHeader.astro\"\n\n" +
        "export default defineComponents({ layout: { Footer, PageHeader } })\n"
    )
    expect(read(dir, "docs/theme.css")).toBe("@import \"effectscript/blume/theme.css\";\n")
    expect(init(dir).stdout).toContain("blume@2.1.1")
    expect(config).toContain(
      "content: { root: \".\", exclude: [\"**/_*\", \"**/.*\", \"dist/**\", \"node_modules/**\"] }"
    )
    expect(read(dir, "docs/index.md")).toContain("A bank.")
    const pkg = JSON.parse(read(dir, "package.json"))
    expect(pkg.scripts.docs).toBe("mine")
    expect(pkg.scripts["docs:build"]).toBe("efx docs && cd docs && blume build")
    expect(pkg.scripts["docs:dev"]).toBe("efx docs && cd docs && blume dev")
    expect(read(dir, ".gitignore")).toBe("node_modules/\ndocs/dist/\ndocs/api/\ndocs/.blume/\n")
    fs.writeFileSync(path.join(dir, "docs/blume.config.ts"), "// mine\n")
    expect(init(dir).status).toBe(0)
    expect(read(dir, "docs/blume.config.ts")).toBe("// mine\n")
    fs.writeFileSync(path.join(dir, "docs/theme.css"), "/* mine */\n")
    expect(init(dir).status).toBe(0)
    expect(read(dir, "docs/theme.css")).toBe("/* mine */\n")
    expect(init(dir).stdout).toContain("blume")
  })
})

const packages = path.resolve(import.meta.dirname, "../../..")
const version = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../package.json"), "utf8")).version

/** The project's packages as npm installs them: `effect`'s published build, Node's types, the tools. */
const installed = (dir: string) => {
  const effectDir = path.join(packages, "effect")
  // a fresh checkout has no dist/ yet (as in language/test/adoption.test.ts)
  if (!fs.existsSync(path.join(effectDir, "dist/index.js"))) {
    const built = spawnSync("pnpm", ["exec", "tsc", "-b", "tsconfig.json"], { cwd: effectDir, encoding: "utf8" })
    if (built.status !== 0) throw new Error(`building effect failed:\n${built.stdout}${built.stderr}`)
  }
  const effect = path.join(dir, "node_modules/effect")
  fs.mkdirSync(effect, { recursive: true })
  const pkg = JSON.parse(fs.readFileSync(path.join(effectDir, "package.json"), "utf8"))
  fs.writeFileSync(path.join(effect, "package.json"), JSON.stringify({ ...pkg, exports: pkg.publishConfig.exports }))
  // copied, not linked: a link's real path sits under the workspace package.json, whose exports are src/
  fs.cpSync(path.join(effectDir, "dist"), path.join(effect, "dist"), {
    recursive: true,
    filter: (file) => !file.endsWith(".map")
  })
  const language = path.join(packages, "effectscript/language")
  fs.mkdirSync(path.join(dir, "node_modules/@effectscript"), { recursive: true })
  fs.mkdirSync(path.join(dir, "node_modules/@types"), { recursive: true })
  fs.symlinkSync(language, path.join(dir, "node_modules/@effectscript/language"))
  fs.symlinkSync(
    fs.realpathSync(path.join(language, "node_modules/typescript")),
    path.join(dir, "node_modules/typescript")
  )
  fs.symlinkSync(
    fs.realpathSync(path.join(language, "node_modules/@types/node")),
    path.join(dir, "node_modules/@types/node")
  )
}
const checkIn = (dir: string) =>
  spawnSync(process.execPath, [efx, "check"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })

describe("efx init in a new project (Plan 18 Task 2, ADR-0057)", { timeout: 120_000 }, () => {
  it("writes the strictest tsconfig.json, with the plugin and Node's types, and efx check uses it", () => {
    const dir = project({
      "package.json": "{\n  \"name\": \"app\",\n  \"type\": \"module\"\n}\n",
      "util.efx": "export effect double(n: number) {\n  return n * 2\n}\n",
      // an .efx import, and Node's globals (review C1, I4)
      "app.efx":
        "import { double } from \"./util.efx\"\n\nexport effect main() {\n  return await double(process.argv.length)\n}\n"
    })
    const result = init(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("tsconfig.json: wrote")
    const options = JSON.parse(read(dir, "tsconfig.json")).compilerOptions
    expect(options).toMatchObject({
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      verbatimModuleSyntax: true,
      types: ["node"],
      plugins: [{ name: "@effectscript/language" }]
    })
    installed(dir)
    const clean = checkIn(dir)
    expect(clean.stdout + clean.stderr).toBe("")
    expect(clean.status).toBe(0)
    const build = spawnSync(process.execPath, [efx, "build"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
    })
    expect(build.stderr).toBe("")
    expect(build.status).toBe(0)
    expect(fs.readFileSync(path.join(dir, "dist/app.js"), "utf8")).toContain("./util.js")
    fs.writeFileSync(path.join(dir, "bad.efx"), "export const n: number = \"no\"\n")
    const bad = checkIn(dir)
    expect(bad.stdout + bad.stderr).toMatch(/bad\.efx[:(]1[:,]\d+\)?:? - error TS2322|bad\.efx\(1,\d+\): error TS2322/)
    expect(bad.status).not.toBe(0)
  })

  it("starts a package.json as an ES module when there is none (review I3)", () => {
    const dir = project({})
    const result = init(dir)
    expect(result.status).toBe(0)
    expect(JSON.parse(read(dir, "package.json"))).toMatchObject({ private: true, type: "module" })
    expect(result.stdout).toContain("package.json: wrote")
    expect(result.stdout).toContain("npm i effect @effect/platform-node")
  })

  it("says when package.json isn't an ES module, without changing it", () => {
    const text = "{\n  \"name\": \"app\"\n}\n"
    const dir = project({ "package.json": text, "tsconfig.json": "{}\n" })
    const result = init(dir)
    expect(result.stdout).toContain("\"type\": \"module\"")
    expect(JSON.parse(read(dir, "package.json")).type).toBeUndefined()
  })

  it("names the Effect peers and pins EffectScript's packages to this version", () => {
    const dir = project({ "package.json": "{\n  \"name\": \"app\"\n}\n" })
    const out = init(dir).stdout
    expect(out).toContain("npm i effect @effect/platform-node")
    expect(out).toContain(`effectscript@${version} @effectscript/language@${version} typescript@6`)
  })

  it("never replaces an existing tsconfig.json", () => {
    const text = "{ \"compilerOptions\": { \"strict\": false }, \"include\": [\"lib\"] }\n"
    const dir = project({ "tsconfig.json": text, "package.json": "{\n  \"name\": \"app\"\n}\n" })
    init(dir)
    expect(JSON.parse(read(dir, "tsconfig.json"))).toMatchObject({
      compilerOptions: { strict: false },
      include: ["lib"]
    })
  })

  it("pins @effectscript/language in the install hints (efx lsp, check, doctor)", async () => {
    const dir = project({ "package.json": "{\n  \"name\": \"app\"\n}\n" })
    // efx check falls back to efx's own language package, which the workspace always has
    const lsp = spawnSync(process.execPath, [efx, "lsp"], {
      cwd: dir,
      encoding: "utf8",
      input: "",
      env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
    })
    expect(lsp.stderr).toContain(`npm i -D @effectscript/language@${version} typescript@6`)
    const { languageInstall } = await import("effectscript/cli/project")
    expect(languageInstall).toBe(`npm i -D @effectscript/language@${version} typescript@6`)
  })
})
