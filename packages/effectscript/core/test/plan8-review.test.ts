import { planConversion } from "effectscript/convert/plan"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const effectFile = (name: string) =>
  `import { Effect } from "effect"\nexport const ${name} = Effect.fn("${name}")(function*() {\n  return 1\n})\n`
const dirs: Array<string> = []
const gitRepo = (files: Record<string, string>, config: Array<string> = []) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-review8-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  const g = (...args: Array<string>) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" })
  g("init", "-q", "-b", "main")
  for (const c of config) g("config", ...c.split(" "))
  g("add", "-A")
  g("commit", "-qm", "init")
  return dir
}
const efxIn = (dir: string, args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [efx, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })
const exists = (dir: string, file: string) => fs.existsSync(path.join(dir, file))

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("Plan 8 final review", () => {
  it("I1 reverts only the file that breaks verification", () => {
    const dir = gitRepo({
      "package.json": "{ \"type\": \"module\" }\n",
      "src/a.ts": effectFile("a"),
      "src/b.ts": effectFile("b"),
      "src/c.ts": effectFile("c"),
      "src/d.ts": effectFile("d"),
      "check.cjs": "process.exit(require('fs').existsSync('src/a.efx') ? 1 : 0)\n"
    })
    const result = efxIn(dir, ["convert", "--write", "--test", "node check.cjs"])
    expect(result.status).toBe(0)
    expect(exists(dir, "src/a.ts")).toBe(true)
    for (const f of ["b", "c", "d"]) expect(exists(dir, `src/${f}.efx`)).toBe(true)
    expect(result.stdout.match(/reverted/g)).toHaveLength(1)
  })

  it("I2 refuses a project that doesn't verify before converting, and leaves no branch", () => {
    const dir = gitRepo({
      "package.json":
        "{ \"type\": \"module\", \"scripts\": { \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\" } }\n",
      "src/a.ts": effectFile("a")
    })
    const result = efxIn(dir, ["convert", "--write"])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/doesn't verify before converting/)
    expect(spawnSync("git", ["branch", "--list", "effectscript/convert"], { cwd: dir, encoding: "utf8" }).stdout).toBe(
      ""
    )
    expect(exists(dir, "src/a.ts")).toBe(true)
  })

  it("I3 sees untracked files even when git hides them", () => {
    const dir = gitRepo({ "package.json": "{}\n", "src/a.ts": effectFile("a") }, ["status.showUntrackedFiles no"])
    fs.writeFileSync(path.join(dir, "src/new.ts"), effectFile("n"))
    const result = efxIn(dir, ["convert", "--write", "--no-verify"])
    expect(result.status).toBe(1)
    expect(exists(dir, "src/new.ts")).toBe(true)
  })

  it("I4 never overwrites an existing .efx or lets two files share a name", () => {
    const plan = planConversion(
      new Map([
        ["src/a.ts", effectFile("a")],
        ["src/a.efx", "export const handwritten = 1\n"],
        ["src/b.ts", effectFile("b")],
        ["src/b.tsx", effectFile("b2")]
      ]),
      {}
    )
    expect(plan.renames.map((r) => r.from)).toEqual([])
    expect(plan.skipped.map((s) => s.file)).toEqual(expect.arrayContaining(["src/a.ts", "src/b.ts", "src/b.tsx"]))
  })

  it("I5 passes arguments after the file to the program", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-review8-"))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "args.ts"), "console.log(JSON.stringify(process.argv.slice(2)))\n")
    const result = efxIn(dir, ["run", "args.ts", "--port", "3000", "-v"])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("[\"--port\",\"3000\",\"-v\"]")
  })

  it("M rewrites a '..' specifier", () => {
    const plan = planConversion(
      new Map([["src/index.ts", effectFile("i")], ["src/sub/use.ts", "import { i } from \"..\"\n"]]),
      {}
    )
    expect(plan.edits[0]!.code).toBe("import { i } from \"../index.efx\"\n")
  })

  it("M init doesn't claim a malformed tsconfig is set up", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-review8-"))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, "tsconfig.json"), "{ \"compilerOptions\": { ")
    fs.writeFileSync(path.join(dir, "package.json"), "{ not json")
    const result = efxIn(dir, ["init"])
    expect(result.stdout).not.toContain("already set up")
    expect(result.stdout + result.stderr).toMatch(/tsconfig\.json isn't valid/)
    expect(result.stdout + result.stderr).toMatch(/package\.json isn't valid/)
  })
})
