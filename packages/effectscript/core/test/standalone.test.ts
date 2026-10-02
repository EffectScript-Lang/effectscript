import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { lspSession } from "./utils/lspScript.ts"

const root = path.join(import.meta.dirname, "..")
const examples = path.join(root, "../examples")
const hasBun = spawnSync("bun", ["--version"]).status === 0
const target = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-standalone-"))
const outdir = path.join(work, "bin")
const binary = path.join(outdir, `efx-${target}${process.platform === "win32" ? ".exe" : ""}`)
const env = { ...process.env, XDG_CACHE_HOME: path.join(work, "cache") }
const script = (args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [path.join(root, "scripts/standalone.ts"), ...args], { cwd: root, encoding: "utf8" })
const efx = (args: ReadonlyArray<string>, cwd: string) => spawnSync(binary, args, { cwd, encoding: "utf8", env })
const lone = (name: string, code: string) => {
  const dir = fs.mkdtempSync(path.join(work, "lone-"))
  fs.writeFileSync(path.join(dir, name), code)
  return dir
}

beforeAll(() => {
  if (!hasBun) return
  const result = script(["build", "--outdir", outdir])
  if (result.status !== 0) throw new Error(`build failed:\n${result.stdout}${result.stderr}`)
}, 180_000)

afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

describe.skipIf(!hasBun)("the standalone binary (Plan 10 Task 3, ADR-0037)", () => {
  it("prints its version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    const result = efx(["--version"], work)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(pkg.version)
  })

  it("compiles a file with efx print", () => {
    const dir = lone("app.efx", "effect hello() { return 1 }\n")
    const result = efx(["print", "app.efx"], dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Effect.fn(\"hello\")(function*() { return 1 })")
  })

  it("runs a project whose workspace packages export .ts sources", () => {
    const result = efx(["run", "src/main.efx"], examples)
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe("Hello, Ada!\nHello, Grace!\nNo user 3\n")
    expect(result.status).toBe(0)
  })

  it("runs a lone file, passing arguments through", () => {
    const dir = lone("app.efx", "const n: number = 1 + 1\nconsole.log(n, process.argv.slice(2).join(\" \"))\n")
    const result = efx(["run", "app.efx", "--port", "3000"], dir)
    expect(result.stdout).toBe("2 --port 3000\n")
    expect(result.status).toBe(0)
  })

  it("passes a failing program's exit code and signals through", () => {
    expect(efx(["run", "app.efx"], lone("app.efx", "process.exitCode = 3\n")).status).toBe(3)
    const killed = efx(["run", "app.efx"], lone("app.efx", "process.kill(process.pid, \"SIGTERM\")\n"))
    expect(killed.status).toBe(143)
  })

  it("asks for effectscript with --runtime node in a project without it", () => {
    const result = efx(["run", "--runtime", "node", "app.efx"], lone("app.efx", "console.log(1)\n"))
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/npm i -D effectscript/)
  })

  it("runs on Node with --runtime node when the project has effectscript (review I1)", () => {
    const result = efx(["run", "--runtime", "node", "src/main.efx"], examples)
    // Node may warn that stripTypeScriptTypes is experimental, as with the npm CLI
    expect(result.stderr).not.toMatch(/Error|Cannot find/)
    expect(result.stdout).toBe("Hello, Ada!\nHello, Grace!\nNo user 3\n")
    expect(result.status).toBe(0)
  })

  it("builds with the project's TypeScript (review I2)", () => {
    const dir = fs.mkdtempSync(path.join(work, "build-"))
    fs.mkdirSync(path.join(dir, "src"))
    fs.mkdirSync(path.join(dir, "node_modules"))
    fs.symlinkSync(path.join(root, "node_modules/typescript"), path.join(dir, "node_modules/typescript"))
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "built", type: "module" }))
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, module: "NodeNext", rootDir: "src", outDir: "dist", types: [] },
        include: ["src"]
      })
    )
    fs.writeFileSync(path.join(dir, "src/a.efx"), "export const n: number = 1\n")
    const result = efx(["build"], dir)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(fs.readFileSync(path.join(dir, "dist/a.js"), "utf8")).toContain("export const n = 1")
  })

  it("doesn't leak its re-run settings into the program (review I3)", () => {
    const code =
      "console.log(process.env.BUN_BE_BUN ?? \"unset\", process.env.EFFECTSCRIPT_MAIN_RUNTIME ?? \"unset\")\n"
    const result = efx(["run", "app.efx"], lone("app.efx", code))
    expect(result.stdout).toBe("unset unset\n")
  })

  it("runs when the cache directory can't be written", () => {
    const readonly = fs.mkdtempSync(path.join(work, "readonly-"))
    fs.chmodSync(readonly, 0o500)
    try {
      const result = spawnSync(binary, ["run", "app.efx"], {
        cwd: lone("app.efx", "console.log(\"ran\")\n"),
        encoding: "utf8",
        env: { ...process.env, XDG_CACHE_HOME: readonly }
      })
      expect(result.stderr).toBe("")
      expect(result.stdout).toBe("ran\n")
    } finally {
      fs.chmodSync(readonly, 0o700)
    }
  })

  it("serves LSP with its own TypeScript in a project without node_modules (ADR-0040)", async () => {
    const text = "const n: number = 1\nexport effect f() {\n  return n\n}\n"
    const dir = lone("a.efx", text)
    const session = await lspSession(binary, ["lsp", "--stdio"], {
      dir,
      file: "a.efx",
      text,
      offset: text.indexOf("n\n}"),
      env
    })
    expect(session.stderr).not.toMatch(/Error/)
    expect(session.replies.get(1).result.capabilities.hoverProvider).toBeTruthy()
    expect(JSON.stringify(session.replies.get(2).result.contents)).toContain("const n: number")
    expect(session.logs.join("\n")).toMatch(/TypeScript 6\.\d+\.\d+, bundled with the language server/)
  })

  it("packages archives with matching checksums", () => {
    const result = script(["package", "--outdir", outdir])
    expect(result.status, result.stderr).toBe(0)
    const archive = `efx-${target}.${process.platform === "win32" ? "zip" : "tar.gz"}`
    const sums = fs.readFileSync(path.join(outdir, "SHASUMS256.txt"), "utf8")
    const hash = createHash("sha256").update(fs.readFileSync(path.join(outdir, archive))).digest("hex")
    expect(sums).toContain(`${hash}  ${archive}\n`)
    if (process.platform !== "win32") {
      const listed = spawnSync("tar", ["-tzf", path.join(outdir, archive)], { encoding: "utf8" }).stdout
      expect(listed.trim()).toBe("efx")
    }
  })
})
