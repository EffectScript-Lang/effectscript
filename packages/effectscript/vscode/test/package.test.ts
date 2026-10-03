import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startTsserver } from "../../language/test/utils/tsserver.ts"
import { marketplaceVersion } from "../scripts/marketplace.ts"

const extensionDir = path.resolve(import.meta.dirname, "..")
const packages = path.resolve(extensionDir, "../..")
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "package.json"), "utf8"))
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-vsix-")))
const vsix = path.join(work, `effectscript-${manifest.version}.vsix`)
const unpacked = path.join(work, "unpacked")
// VS Code ^1.95 runs on Electron's Node 20, without require(esm)
const oldNode = ["--no-experimental-require-module"]

beforeAll(() => {
  const result = spawnSync(process.execPath, [path.join(extensionDir, "scripts/package.ts"), "--out", vsix], {
    cwd: extensionDir,
    encoding: "utf8"
  })
  if (result.status !== 0) throw new Error(`packaging failed:\n${result.stdout}${result.stderr}`)
  fs.mkdirSync(unpacked)
  spawnSync("unzip", ["-q", vsix, "-d", unpacked])
}, 180_000)

afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

const inside = (file: string) => path.join(unpacked, "extension", file)

describe("the .vsix (Plan 11 Task 5, ADR-0041)", () => {
  it("holds the bundles, grammars, icons and manifest, and no sources or links", () => {
    const listed = spawnSync("unzip", ["-Z1", vsix], { encoding: "utf8" }).stdout.trim().split("\n")
    expect(listed).toEqual(expect.arrayContaining([
      "extension/package.json",
      "extension/out/extension.cjs",
      "extension/node_modules/@effectscript/language/package.json",
      "extension/node_modules/@effectscript/language/index.js",
      "extension/syntaxes/effectscript.tmLanguage.json",
      "extension/syntaxes/effectscript.injection.tmLanguage.json",
      "extension/language-configuration.json",
      "extension/images/extension-icon-128.png",
      "extension/images/file-efx-dark.svg",
      "extension/images/file-efx-light.svg"
    ]))
    expect(listed.filter((f) => /\.tsx?$/.test(f) || f.includes("/src/"))).toEqual([])
    const packed = JSON.parse(fs.readFileSync(inside("package.json"), "utf8"))
    // the bundled plugin pack is its only dependency
    expect(packed.dependencies).toEqual({ "@effectscript/language": manifest.version })
    expect(packed.devDependencies).toBeUndefined()
    // the Marketplace refuses semver prereleases (ADR-0055)
    expect(packed.version).toBe(marketplaceVersion(manifest.version).version)
    const vsixManifest = fs.readFileSync(path.join(unpacked, "extension.vsixmanifest"), "utf8")
    expect(vsixManifest.includes(`"Microsoft.VisualStudio.Code.PreRelease" Value="true"`)).toBe(
      marketplaceVersion(manifest.version).preRelease
    )
    expect(packed.main).toBe("./out/extension.cjs")
    for (const p of [packed.icon, ...Object.values(packed.contributes.languages[0].icon as object)]) {
      expect(fs.existsSync(inside(p))).toBe(true)
    }
  })

  it("loads its bundles without require(esm)", () => {
    // a stand-in for the `vscode` module, which only VS Code provides
    const stub = path.join(work, "stub")
    fs.mkdirSync(path.join(stub, "node_modules/vscode"), { recursive: true })
    fs.writeFileSync(path.join(stub, "node_modules/vscode/index.js"), "module.exports = {}\n")
    const probe = [
      `const plugin = require(${JSON.stringify(inside("node_modules/@effectscript/language"))})`,
      `const extension = require(${JSON.stringify(inside("out/extension.cjs"))})`,
      "console.log(typeof plugin, typeof extension.activate)"
    ].join(";")
    const result = spawnSync(process.execPath, [...oldNode, "-e", probe], {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: path.join(stub, "node_modules") }
    })
    expect(result.stderr).toBe("")
    expect(result.stdout.trim()).toBe("function function")
  })

  it("serves .efx in tsserver through the bundled plugin", async () => {
    const dir = path.join(work, "project")
    fs.mkdirSync(path.join(dir, "node_modules/@effectscript"), { recursive: true })
    fs.cpSync(inside("node_modules/@effectscript/language"), path.join(dir, "node_modules/@effectscript/language"), {
      recursive: true
    })
    const a = "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\n"
    fs.writeFileSync(path.join(dir, "a.efx"), a)
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
          lib: ["ESNext"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          allowImportingTsExtensions: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
          paths: {
            "effect": [path.join(packages, "effect/src/index.ts")],
            "effect/*": [path.join(packages, "effect/src/*/index.ts"), path.join(packages, "effect/src/*.ts")]
          }
        },
        include: ["*.efx"]
      })
    )
    const server = startTsserver({ probeLocation: dir, cwd: dir, nodeArgs: oldNode })
    try {
      await server.send("configure", {
        extraFileExtensions: [{ extension: ".efx", isMixedContent: false, scriptKind: 7 }]
      })
      await server.send("open", { file: path.join(dir, "a.efx"), fileContent: a, scriptKindName: "TS" }, false)
      const info = await server.send("quickinfo", { file: path.join(dir, "a.efx"), line: 2, offset: 13 })
      expect(info.body.displayString).toBe("await (effect bind)")
      const x = await server.send("quickinfo", { file: path.join(dir, "a.efx"), line: 3, offset: 10 })
      expect(x.body.displayString).toBe("const x: number")
    } finally {
      server.close()
    }
  }, 120_000)
})
