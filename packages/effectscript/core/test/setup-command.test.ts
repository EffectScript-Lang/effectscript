import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 60_000 })

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const temp = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-setup-cmd-")))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/** A HOME with Claude Code and Codex, and a PATH with fake `nvim` and `code` that log their argv. */
const machine = () => {
  const home = temp()
  const bin = path.join(home, "bin")
  fs.mkdirSync(bin)
  fs.mkdirSync(path.join(home, ".claude"))
  fs.mkdirSync(path.join(home, ".codex"))
  for (const tool of ["nvim", "code"]) {
    fs.writeFileSync(path.join(bin, tool), `#!/bin/sh\necho "$@" >> "${home}/${tool}.log"\n`, { mode: 0o755 })
  }
  return { home, bin }
}

const setup = (args: ReadonlyArray<string>, m: { home: string; bin: string }, cwd = temp()) =>
  spawnSync(process.execPath, [efx, "setup", ...args], {
    cwd,
    encoding: "utf8",
    env: { EFFECTSCRIPT_DEV: "1", HOME: m.home, PATH: `${m.bin}:/usr/bin:/bin` },
    input: ""
  })

const snapshot = (dir: string): Array<string> => (fs.readdirSync(dir, { recursive: true }) as Array<string>).sort()

describe("efx setup (Plan 15 Task 3, ADR-0052)", () => {
  it("lists what it would do with --dry-run, and writes nothing", () => {
    const m = machine()
    const before = snapshot(m.home)
    const result = setup(["--dry-run", "--only", "claude,codex,neovim,vscode"], m)
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/Install the EffectScript skill/)
    expect(result.stdout).toMatch(/Configure Neovim/)
    expect(result.stdout).toMatch(/extension in VS Code/)
    expect(snapshot(m.home)).toEqual(before)
  })

  it("only lists without a terminal, unless --yes", () => {
    const m = machine()
    const result = setup(["--only", "claude"], m)
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/--yes/)
    expect(fs.existsSync(path.join(m.home, ".claude/skills/effectscript"))).toBe(false)
  })

  it("applies everything with --yes, and a second run changes nothing", () => {
    const m = machine()
    const result = setup(["--yes", "--only", "claude,codex,neovim", "--vsix", "/nonexistent.vsix"], m)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(fs.readFileSync(path.join(m.home, ".claude/skills/effectscript/SKILL.md"), "utf8")).toContain(
      "name: effectscript"
    )
    expect(fs.realpathSync(path.join(m.home, ".codex/skills/effectscript"))).toBe(
      path.join(m.home, ".agents/skills/effectscript")
    )
    const plugin = fs.readFileSync(path.join(m.home, ".config/nvim/plugin/effectscript.lua"), "utf8")
    expect(plugin).toContain("\"lsp\"")
    const again = setup(["--yes", "--only", "claude,codex,neovim"], m)
    expect(again.stdout).not.toMatch(/^✓/m)
    expect(again.stdout).toMatch(/already/)
  })

  it("installs the skill into the project with --project", () => {
    const m = machine()
    const project = temp()
    expect(setup(["--yes", "--project"], m, project).status).toBe(0)
    for (const dir of [".claude/skills/effectscript", ".agents/skills/effectscript"]) {
      expect(fs.readFileSync(path.join(project, dir, "SKILL.md"), "utf8")).toContain("name: effectscript")
    }
    expect(fs.existsSync(path.join(m.home, ".agents"))).toBe(false)
  })

  it("says so when there is nothing to set up", () => {
    const m = machine()
    // this HOME and PATH have no Gemini CLI
    const result = setup(["--yes", "--only", "gemini"], m)
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/Nothing to set up/)
  })
})

describe("efx setup review fixes (Plan 15 final review)", () => {
  it("--project keeps a project's own skill of the same name (I7)", () => {
    const m = machine()
    const project = temp()
    const theirs = path.join(project, ".claude/skills/effectscript")
    fs.mkdirSync(theirs, { recursive: true })
    fs.writeFileSync(path.join(theirs, "SKILL.md"), "---\nname: team-rules\n---\n")
    const result = setup(["--yes", "--project"], m, project)
    expect(result.status).toBe(0)
    expect(fs.readFileSync(path.join(theirs, "SKILL.md"), "utf8")).toContain("team-rules")
    expect(result.stdout).toMatch(/isn't the EffectScript skill/)
  })
})

describe("the language server command in editor configs (review I9, I11)", async () => {
  const { lspCommand, windowsCommandLine } = await import("effectscript/cli/setup")

  it("prefers the efx on PATH when it is this efx", () => {
    expect(
      lspCommand({
        self: "/opt/efx/1.0/bin/efx",
        standalone: true,
        onPath: "/usr/local/bin/efx",
        realpath: () => "/opt/efx/1.0/bin/efx"
      })
    )
      .toEqual(["efx", "lsp"])
    expect(lspCommand({ self: "/opt/efx/1.0/bin/efx", standalone: true, onPath: undefined, realpath: (p) => p }))
      .toEqual(["/opt/efx/1.0/bin/efx", "lsp"])
    expect(
      lspCommand({
        self: "/p/node_modules/effectscript/bin/efx.js",
        standalone: false,
        node: "/n/node",
        onPath: "/p/node_modules/.bin/efx",
        realpath: () => "/p/node_modules/effectscript/bin/efx.js"
      })
    )
      .toEqual(["efx", "lsp"])
    expect(
      lspCommand({
        self: "/p/node_modules/effectscript/bin/efx.js",
        standalone: false,
        node: "/n/node",
        onPath: "/other/efx",
        realpath: (p) => p
      })
    )
      .toEqual(["/n/node", "/p/node_modules/effectscript/bin/efx.js", "lsp"])
  })

  it("quotes Windows command lines for paths with spaces", () => {
    expect(
      windowsCommandLine("C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd", [
        "--install-extension",
        "C:\\a b\\x.vsix"
      ])
    )
      .toBe("\"C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd\" \"--install-extension\" \"C:\\a b\\x.vsix\"")
  })
})
