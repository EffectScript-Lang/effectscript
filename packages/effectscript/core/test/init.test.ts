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

describe("efx init (Plan 8 Task 5)", { timeout: 30_000 }, () => {
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
    expect(result.stdout).toContain("npm i -D effectscript @effectscript/language typescript@6")
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
    expect(config).toContain("import { effectscript } from \"effectscript/blume\"")
    expect(config).toContain("title: \"bank\"")
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
    expect(init(dir).stdout).toContain("blume")
  })
})
