import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const effectFile = (name: string) =>
  `import { Effect } from "effect"\nexport const ${name} = Effect.fn("${name}")(function*() {\n  return 1\n})\n`

const dirs: Array<string> = []
const project = (files: Record<string, string>, git = true) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-convert-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  if (git) {
    const g = (...args: Array<string>) =>
      spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" })
    g("init", "-q", "-b", "main")
    g("add", "-A")
    g("commit", "-qm", "init")
  }
  return dir
}
const efxIn = (dir: string, args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [efx, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })
const git = (dir: string, ...args: Array<string>) =>
  spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout.trim()

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("efx convert (Plan 8 Task 4)", () => {
  const files = {
    "package.json": "{ \"type\": \"module\" }\n",
    "src/a.ts": effectFile("a"),
    "src/b.ts": `import { a } from "./a.js"\n${effectFile("b")}`,
    "src/plain.ts": "export const n = 1\n"
  }

  it("says a file doesn't parse, instead of \"nothing to re-sugar\" (Plan 21)", () => {
    const dir = project({
      "src/broken.ts": "import { Effect } from \"effect\"\nexport const f = Effect.fn(\"f\")(function*( {\n",
      "package.json": "{ \"name\": \"app\", \"type\": \"module\" }\n"
    })
    const result = efxIn(dir, ["convert", "--explain"])
    expect(result.stdout + result.stderr).toMatch(
      /src\/broken\.ts: stays TypeScript \(it doesn't parse as TypeScript, at line 3: Unexpected token/
    )
  })

  it("reports without writing by default", () => {
    const dir = project(files)
    const result = efxIn(dir, ["convert"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("src/a.ts → src/a.efx")
    expect(result.stdout).toContain("--write")
    expect(fs.existsSync(path.join(dir, "src/a.ts"))).toBe(true)
  })

  it("refuses a dirty tree and a non-git directory", () => {
    const dirty = project(files)
    fs.writeFileSync(path.join(dirty, "src/new.ts"), "export const x = 1\n")
    const refused = efxIn(dirty, ["convert", "--write"])
    expect(refused.status).toBe(1)
    expect(refused.stderr).toMatch(/uncommitted changes/)
    expect(fs.existsSync(path.join(dirty, "src/a.ts"))).toBe(true)
    const plain = project(files, false)
    expect(efxIn(plain, ["convert", "--write"]).stderr).toMatch(/git repository/)
  })

  it("converts on a new branch and rewrites imports", () => {
    const dir = project(files)
    const result = efxIn(dir, ["convert", "--write", "--no-verify"])
    expect(result.status).toBe(0)
    expect(git(dir, "branch", "--show-current")).toBe("effectscript/convert")
    expect(fs.readFileSync(path.join(dir, "src/a.efx"), "utf8")).toContain("export effect a()")
    expect(fs.existsSync(path.join(dir, "src/a.ts"))).toBe(false)
    expect(fs.readFileSync(path.join(dir, "src/b.efx"), "utf8")).toContain("from \"./a.efx\"")
    expect(fs.existsSync(path.join(dir, "src/plain.ts"))).toBe(true)
  })

  it("reverts the files that break verification, newest first", () => {
    const dir = project({
      ...files,
      "src/z.ts": effectFile("z"),
      // the "test suite" fails while src/z.efx exists
      "check.cjs": "process.exit(require('fs').existsSync('src/z.efx') ? 1 : 0)\n"
    })
    const result = efxIn(dir, ["convert", "--write", "--test", "node check.cjs"])
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/reverted src\/z\.ts/)
    expect(fs.existsSync(path.join(dir, "src/z.ts"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "src/a.efx"))).toBe(true)
  })
})
