import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { startTsserver } from "./utils/tsserver.ts"

const packageDir = path.resolve(import.meta.dirname, "..")
const packages = path.resolve(packageDir, "../..")

const a =
  "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\nexport schema User { name: string }\n"
const b = "import { double, User } from \"./a.efx\"\nexport const r = double(2)\nexport const u = new User({ name: \"ada\" })\n"

const lineOffset = (text: string, index: number) => {
  const before = text.slice(0, index).split("\n")
  return { line: before.length, offset: before[before.length - 1]!.length + 1 }
}

describe("TypeScript server plugin (VS Code path, ADR-0019)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-tsserver-"))
  fs.mkdirSync(path.join(dir, "node_modules/@effectscript"), { recursive: true })
  fs.symlinkSync(packageDir, path.join(dir, "node_modules/@effectscript/language"))
  fs.writeFileSync(path.join(dir, "a.efx"), a)
  fs.writeFileSync(path.join(dir, "b.ts"), b)
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
        allowArbitraryExtensions: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        paths: {
          "effect": [path.join(packages, "effect/src/index.ts")],
          "effect/*": [path.join(packages, "effect/src/*/index.ts"), path.join(packages, "effect/src/*.ts")]
        }
      },
      include: ["*.ts", "*.efx"]
    })
  )
  const server = startTsserver({ probeLocation: dir, cwd: dir })
  afterAll(() => {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("serves definition and completion for .efx through the plugin", async () => {
    await server.send("configure", {
      extraFileExtensions: [{ extension: ".efx", isMixedContent: false, scriptKind: 7 }]
    })
    await server.send("open", { file: path.join(dir, "b.ts"), fileContent: b, scriptKindName: "TS" }, false)
    await server.send("open", { file: path.join(dir, "a.efx"), fileContent: a, scriptKindName: "TS" }, false)
    const definition = await server.send("definition", {
      file: path.join(dir, "b.ts"),
      ...lineOffset(b, b.indexOf("double(2)"))
    })
    expect(definition.success).toBe(true)
    expect(definition.body[0].file).toBe(path.join(dir, "a.efx"))
    expect(definition.body[0].start).toEqual(lineOffset(a, a.indexOf("double")))
    const completions = await server.send("completionInfo", {
      file: path.join(dir, "a.efx"),
      ...lineOffset(a, a.indexOf("x * 2"))
    })
    expect(completions.body.entries.map((e: { name: string }) => e.name)).toEqual(expect.arrayContaining(["n", "x"]))
  }, 120_000)
})
