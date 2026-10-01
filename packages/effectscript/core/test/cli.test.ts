import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const packages = path.resolve(import.meta.dirname, "../../..")
const efx = path.resolve(import.meta.dirname, "../bin/efx.js")

const files: Record<string, string> = {
  "src/view.efx":
    "export const h = (tag: string, _props: unknown, ...children: Array<string>): string =>\n  `<${tag}>${children.join(\"\")}</${tag}>`\n\nexport const view = (name: string) => <b>{name}</b>\n",
  "src/users.efx":
    "import { view } from \"./view.efx\"\n\nexport effect greet(name: string): string {\n  return view(name)\n}\n",
  "src/index.ts":
    "import { Effect } from \"effect\"\nimport { greet } from \"./users.efx\"\n\nexport const demo = (): string => Effect.runSync(greet(\"ada\"))\n",
  "src/main.ts": "import { demo } from \"./index.ts\"\n\nconsole.log(demo())\n",
  "src/jsx.d.ts": "declare namespace JSX {\n  interface IntrinsicElements {\n    [name: string]: unknown\n  }\n}\n",
  "package.json": JSON.stringify({ name: "efx-build-fixture", type: "module" }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ES2022",
      lib: ["ESNext", "DOM", "DOM.Iterable"],
      module: "NodeNext",
      moduleResolution: "NodeNext",
      allowImportingTsExtensions: true,
      jsx: "react",
      jsxFactory: "h",
      declaration: true,
      rootDir: "src",
      outDir: "dist",
      skipLibCheck: true,
      types: ["node"]
    },
    include: ["src"]
  })
}

describe("efx build / run (ADR-0022)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-build-"))
  fs.mkdirSync(path.join(dir, "src"))
  fs.mkdirSync(path.join(dir, "node_modules/@types"), { recursive: true })
  fs.symlinkSync(path.join(packages, "effect"), path.join(dir, "node_modules/effect"))
  fs.symlinkSync(
    path.join(packages, "effectscript/core/node_modules/@types/node"),
    path.join(dir, "node_modules/@types/node")
  )
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text)
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it("builds .js and .d.ts with imports pointing at real output files", () => {
    const result = spawnSync(process.execPath, [efx, "build", "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" })
    expect(result.stderr + result.stdout).not.toMatch(/error/i)
    expect(result.status).toBe(0)
    const usersJs = fs.readFileSync(path.join(dir, "dist/users.js"), "utf8")
    expect(usersJs).toContain("from \"./view.js\"")
    expect(fs.existsSync(path.join(dir, "dist/users.d.ts"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "dist/view.d.ts"))).toBe(true)
    const staged = fs.readFileSync(path.join(dir, "node_modules/.cache/effectscript/build/users.ts"), "utf8")
    expect(staged).toContain("from \"./view.tsx\"")
    const ran = spawnSync(process.execPath, ["dist/main.js"], { cwd: dir, encoding: "utf8" })
    expect(ran.stdout.trim()).toBe("<b>ada</b>")
  }, 180_000)

  it("efx run executes a .ts entry that imports .efx", () => {
    fs.writeFileSync(
      path.join(dir, "src/plain.efx"),
      "export effect shout(s: string): string {\n  return s.toUpperCase()\n}\n"
    )
    fs.writeFileSync(
      path.join(dir, "src/run.ts"),
      "import { Effect } from \"effect\"\nimport { shout } from \"./plain.efx\"\n\nconsole.log(Effect.runSync(shout(\"hi\")))\n"
    )
    const ran = spawnSync(process.execPath, [efx, "run", "src/run.ts"], { cwd: dir, encoding: "utf8" })
    expect(ran.stdout.trim()).toBe("HI")
  }, 120_000)

  it("build reports compile errors with .efx positions and fails", () => {
    fs.writeFileSync(path.join(dir, "src/broken.efx"), "effect f() {\n  const x = .\n}\n")
    const result = spawnSync(process.execPath, [efx, "build", "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/broken\.efx:2:\d+ - error EFX1001/)
    fs.rmSync(path.join(dir, "src/broken.efx"))
  }, 120_000)
})
