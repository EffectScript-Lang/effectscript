import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

// every test starts several efx processes
vi.setConfig({ testTimeout: 60_000 })

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const source = path.join(import.meta.dirname, "../skills/effectscript")
const dirs: Array<string> = []
const temp = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-skill-")))
  dirs.push(dir)
  return dir
}
const run = (args: ReadonlyArray<string>, cwd: string, home = temp()) =>
  spawnSync(process.execPath, [efx, "skill", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1", HOME: home }
  })
/** Relative path → content, for a directory tree. */
export const tree = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name !== ".efx-skill.json") out[path.relative(dir, full)] = fs.readFileSync(full, "utf8")
    }
  }
  walk(dir)
  return out
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("efx skill (Plan 14 Task 3, ADR-0051)", () => {
  it("installs the skill into the project's .claude/skills", () => {
    const project = temp()
    const result = run([], project)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(tree(path.join(project, ".claude/skills/effectscript"))).toEqual(tree(source))
    expect(result.stdout).toContain(".claude/skills/effectscript")
  })

  it("installs user-wide with --global, and anywhere with --dir", () => {
    const home = temp()
    expect(run(["--global"], temp(), home).status).toBe(0)
    expect(tree(path.join(home, ".claude/skills/effectscript"))).toEqual(tree(source))
    const dir = path.join(temp(), "agents/effectscript")
    expect(run(["--dir", dir], temp()).status).toBe(0)
    expect(tree(dir)).toEqual(tree(source))
  })

  it("updates its own install: removes files it installed that are gone, keeps files the user added (review I3)", () => {
    const project = temp()
    run([], project)
    const dir = path.join(project, ".claude/skills/effectscript")
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".efx-skill.json"), "utf8"))
    fs.writeFileSync(path.join(dir, "references/old.md"), "old\n")
    fs.writeFileSync(
      path.join(dir, ".efx-skill.json"),
      JSON.stringify({ files: [...manifest.files, "references/old.md"] })
    )
    fs.writeFileSync(path.join(dir, "NOTES.md"), "mine\n")
    expect(run([], project).status).toBe(0)
    expect(fs.existsSync(path.join(dir, "references/old.md"))).toBe(false)
    expect(fs.readFileSync(path.join(dir, "NOTES.md"), "utf8")).toBe("mine\n")
  })

  it("never deletes what it didn't install, even with --force (review I3)", () => {
    const project = temp()
    const skills = path.join(project, ".claude/skills")
    fs.mkdirSync(path.join(skills, "other"), { recursive: true })
    fs.writeFileSync(path.join(skills, "other/SKILL.md"), "---\nname: other\n---\n")
    fs.writeFileSync(path.join(skills, "SKILL.md"), "---\nname: something-else\n---\n")
    expect(run(["--dir", skills, "--force"], project).status).toBe(0)
    expect(fs.readFileSync(path.join(skills, "other/SKILL.md"), "utf8")).toContain("name: other")
  })

  it("refuses the project, home, their ancestors and git repositories as targets (review I3)", () => {
    const project = temp()
    fs.mkdirSync(path.join(project, ".git"))
    fs.writeFileSync(path.join(project, "keep.txt"), "x\n")
    for (const dir of [".", "..", project]) {
      const result = run(["--dir", dir, "--force"], project)
      expect(result.status, dir).toBe(1)
      expect(result.stderr).toMatch(/won't install the skill into/)
    }
    expect(fs.readFileSync(path.join(project, "keep.txt"), "utf8")).toBe("x\n")
  })

  it("refuses to replace a directory that isn't the EffectScript skill, unless --force", () => {
    const project = temp()
    const target = path.join(project, ".claude/skills/effectscript")
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, "SKILL.md"), "---\nname: something-else\n---\n")
    const refused = run([], project)
    expect(refused.status).toBe(1)
    expect(refused.stderr).toMatch(/--force/)
    expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("something-else")
    expect(run(["--force"], project).status).toBe(0)
    expect(tree(target)).toEqual(tree(source))
  })
})
