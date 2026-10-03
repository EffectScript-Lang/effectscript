import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 90_000 })

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
// tests run concurrently: clean up once, when all are done
afterAll(() => {
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
  fs.writeFileSync(path.join(dir, "run.sh"), "#!/bin/sh\necho ok\n", { mode: 0o755 })
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
  ungitignore) : > .gitignore; printf '// improved\\n' >> src/a.efx ;;
  rmfirst) git rm -q "$(git ls-files | grep '^bulk/' | head -1)"; printf '// improved\\n' >> src/a.efx ;;
  child) (sleep 2; printf '// late\\n' >> src/a.efx) & sleep 30 ;;
  rename) mv src/a.efx src/a.ts ;;
  fail) printf '// partial\\n' >> src/a.efx; exit 1 ;;
  orphan) node -e "require('child_process').spawn('sleep', ['8'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }).unref()"; echo "gave up" >&2; exit 1 ;;
  noisy) node -e "process.stdout.write('x'.repeat(300000))"; printf '\\033[31mreal error\\033[0m\\n' >&2; exit 1 ;;
  chmod) chmod -x run.sh; printf '// improved\\n' >> src/a.efx ;;
  quota) echo "working on src/a.efx"; echo "Error: usage limit reached, try again at 5pm" >&2; exit 1 ;;
esac
`,
    { mode: 0o755 }
  )
  // codex refuses the removed --full-auto flag, as codex-cli 0.160 does (review I1)
  fs.writeFileSync(
    path.join(bin, "codex"),
    `#!/bin/sh
case " $* " in *" --full-auto "*) echo "unexpected argument '--full-auto'" >&2; exit 2 ;; esac
printf '// codex\\n' >> src/a.efx
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
  it("shows the end of the agent's output when it fails (Plan 20 Task 2)", () => {
    const p = setupProject()
    const result = convert(p, "quota")
    expect(result.stdout).toMatch(/reverted|no change/)
    expect(result.stdout + result.stderr).toContain("usage limit reached, try again at 5pm")
    expect(result.stdout + result.stderr).toContain("working on src/a.efx")
  })

  it("doesn't wait for a process the agent left holding its output (Plan 20 review I1)", () => {
    const p = setupProject()
    const started = Date.now()
    const result = convert(p, "orphan")
    expect(result.stdout + result.stderr).toContain("gave up")
    expect(Date.now() - started).toBeLessThan(6000)
  })

  it("keeps the end of each stream, without terminal control characters (Plan 21)", () => {
    const p = setupProject()
    const out = convert(p, "noisy")
    const text = out.stdout + out.stderr
    expect(text).toContain("real error")
    expect(text).not.toContain("\u001b")
  })

  it("restores the mode of a file the agent changed (Plan 21)", () => {
    const p = setupProject()
    convert(p, "chmod")
    expect(fs.statSync(path.join(p.dir, "run.sh")).mode & 0o111).not.toBe(0)
  })

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

  it("never deletes files git ignored, even when the agent edits .gitignore (review C1)", () => {
    const p = setupProject()
    fs.writeFileSync(path.join(p.dir, ".gitignore"), ".env\nlocal-db/\n")
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "ignore"], { cwd: p.dir })
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", ".gitignore"], { cwd: p.dir })
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "gitignore"], { cwd: p.dir })
    fs.writeFileSync(path.join(p.dir, ".env"), "SECRET=1\n")
    fs.mkdirSync(path.join(p.dir, "local-db"))
    fs.writeFileSync(path.join(p.dir, "local-db/app.sqlite"), "db")
    expect(convert(p, "ungitignore").status).toBe(0)
    expect(read(p, ".env")).toBe("SECRET=1\n")
    expect(read(p, "local-db/app.sqlite")).toBe("db")
    expect(read(p, ".gitignore")).toBe(".env\nlocal-db/\n")
  })

  it("keeps every file in a repository with over a megabyte of paths (review C2)", () => {
    const p = setupProject()
    const bulk = path.join(p.dir, "bulk")
    fs.mkdirSync(bulk)
    const names = Array.from({ length: 16_000 }, (_, i) => `file-${String(i).padStart(6, "0")}-${"x".repeat(60)}.txt`)
    for (const name of names) fs.writeFileSync(path.join(bulk, name), "")
    spawnSync("git", ["add", "-A"], { cwd: p.dir })
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "bulk"], { cwd: p.dir })
    expect(convert(p, "rmfirst").status).toBe(0)
    expect(fs.readdirSync(bulk).length).toBe(names.length)
  })

  it("stops the agent's whole process tree on timeout (review I3)", async () => {
    const p = setupProject()
    convert(p, "child", ["--timeout", "1"])
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    expect(read(p, "src/a.efx")).not.toContain("late")
  })

  it("restores the file when the agent deletes or renames it (review I4)", () => {
    const p = setupProject()
    const result = convert(p, "rename")
    expect(result.status, result.stderr).toBe(0)
    expect(read(p, "src/a.efx")).toContain("export effect one()")
    expect(fs.existsSync(path.join(p.dir, "src/a.ts"))).toBe(false)
  })

  it("runs codex with its current sandbox flag (review I1), and lets claude read the skill (review I2)", () => {
    const p = setupProject()
    const result = convert(p, "improve", ["--agent", "codex"])
    expect(result.status).toBe(0)
    expect(read(p, "src/a.efx")).toContain("// codex")
    const q = setupProject()
    convert(q, "improve")
    const args = fs.readFileSync(path.join(q.bin, "prompt.txt"), "utf8").split("\n")
    const skillDir = args[args.indexOf("--add-dir") + 1]!
    expect(args.join("\n")).toContain(path.join(skillDir, "SKILL.md"))
  })

  it("says so when no coding agent is installed", () => {
    const p = setupProject()
    fs.rmSync(path.join(p.bin, "claude"))
    fs.rmSync(path.join(p.bin, "codex"))
    const result = spawnSync(process.execPath, [efx, "convert", "--write", "--ai", "--test", "true"], {
      cwd: p.dir,
      encoding: "utf8",
      env: { ...process.env, EFFECTSCRIPT_DEV: "1", PATH: `${p.bin}:/usr/bin:/bin` }
    })
    expect(result.stderr).toMatch(/no coding agent/)
    expect(read(p, "src/a.efx")).toContain("export effect one()")
  })
})
