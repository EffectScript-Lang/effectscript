import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 90_000 })

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

// `two` passes span options, so the mechanical pass leaves it as TypeScript, with a note
const source = [
  "import { Effect } from \"effect\"",
  "export const one = Effect.fn(\"one\")(function*() {",
  "  return 1",
  "})",
  "export const two = Effect.fn(\"two\", { attributes: { a: 1 } })(function*() {",
  "  return 2",
  "})",
  ""
].join("\n")

/** A git project, and a PATH whose `claude` acts as FAKE_MODE says and logs its prompt. */
const setupProject = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-ai-")))
  dirs.push(dir)
  fs.mkdirSync(path.join(dir, "src"))
  fs.writeFileSync(path.join(dir, "src/a.ts"), source)
  fs.writeFileSync(path.join(dir, "src/b.ts"), "export const b = 1\n")
  fs.writeFileSync(path.join(dir, "package.json"), "{ \"type\": \"module\" }\n")
  const g = (...args: Array<string>) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" })
  g("init", "-q", "-b", "main")
  g("add", "-A")
  g("commit", "-qm", "init")
  const bin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-ai-bin-")))
  dirs.push(bin)
  fs.writeFileSync(
    path.join(bin, "claude"),
    `#!/bin/sh
printf '%s\\n' "$@" > "${bin}/prompt.txt"
case "$FAKE_MODE" in
  improve) printf '// improved\\n' >> src/a.efx ;;
  break) printf '// BROKEN\\n' >> src/a.efx ;;
  stray) printf '// improved\\n' >> src/a.efx; printf '// stray\\n' >> src/b.ts; echo x > src/new.ts ;;
  hang) sleep 30 ;;
  fail) printf '// partial\\n' >> src/a.efx; exit 1 ;;
esac
`,
    { mode: 0o755 }
  )
  return { dir, bin }
}

const convert = (p: { dir: string; bin: string }, mode: string, extra: ReadonlyArray<string> = []) =>
  spawnSync(
    process.execPath,
    [efx, "convert", "--write", "--ai", "--test", "! grep -q BROKEN src/a.efx", ...extra],
    {
      cwd: p.dir,
      encoding: "utf8",
      env: { ...process.env, EFFECTSCRIPT_DEV: "1", FAKE_MODE: mode, PATH: `${p.bin}:${process.env.PATH}` }
    }
  )

const read = (p: { dir: string }, file: string) => fs.readFileSync(path.join(p.dir, file), "utf8")

describe("efx convert --ai (Plan 15 Task 4, ADR-0052)", () => {
  it("hands the agent the file and its notes, and keeps an edit that verifies", () => {
    const p = setupProject()
    const result = convert(p, "improve")
    expect(result.status, result.stderr).toBe(0)
    expect(read(p, "src/a.efx")).toContain("// improved")
    const prompt = fs.readFileSync(path.join(p.bin, "prompt.txt"), "utf8")
    expect(prompt).toContain("src/a.efx")
    expect(prompt).toContain("stays TypeScript: it passes span options")
    expect(prompt).toMatch(/SKILL\.md/)
    expect(result.stdout).toMatch(/claude/)
    expect(result.stdout).toMatch(/kept the AI edit of src\/a\.efx/)
  })

  it("reverts an edit that breaks verification", () => {
    const p = setupProject()
    const result = convert(p, "break")
    expect(result.status).toBe(0)
    expect(read(p, "src/a.efx")).not.toContain("BROKEN")
    expect(read(p, "src/a.efx")).toContain("export effect one()")
    expect(result.stdout).toMatch(/reverted the AI edit of src\/a\.efx/)
  })

  it("undoes edits outside the file, and keeps the file's", () => {
    const p = setupProject()
    const result = convert(p, "stray")
    expect(result.status).toBe(0)
    expect(read(p, "src/b.ts")).toBe("export const b = 1\n")
    expect(fs.existsSync(path.join(p.dir, "src/new.ts"))).toBe(false)
    expect(read(p, "src/a.efx")).toContain("// improved")
  })

  it("reverts when the agent fails or runs past --timeout", () => {
    const failed = setupProject()
    expect(convert(failed, "fail").status).toBe(0)
    expect(read(failed, "src/a.efx")).not.toContain("partial")
    const slow = setupProject()
    const started = Date.now()
    const result = convert(slow, "hang", ["--timeout", "2"])
    expect(Date.now() - started).toBeLessThan(25_000)
    expect(result.stdout).toMatch(/timed out/)
  })

  it("says so when no coding agent is installed", () => {
    const p = setupProject()
    fs.rmSync(path.join(p.bin, "claude"))
    const result = spawnSync(process.execPath, [efx, "convert", "--write", "--ai", "--test", "true"], {
      cwd: p.dir,
      encoding: "utf8",
      env: { ...process.env, EFFECTSCRIPT_DEV: "1", PATH: `${p.bin}:/usr/bin:/bin` }
    })
    expect(result.stderr).toMatch(/no coding agent/)
    expect(read(p, "src/a.efx")).toContain("export effect one()")
  })
})
