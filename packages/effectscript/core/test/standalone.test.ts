import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

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
