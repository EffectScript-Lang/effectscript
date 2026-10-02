import type { Detected } from "effectscript/setup/detect"
import { type Action, plan } from "effectscript/setup/plan"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const dirs: Array<string> = []
const temp = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-setup-")))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const skill: ReadonlyArray<readonly [string, string]> = [
  ["SKILL.md", "---\nname: effectscript\ndescription: test\n---\n"],
  ["references/syntax.md", "# syntax\n"]
]

/** A fake VS Code-family CLI that keeps its installed extensions in a file. */
const fakeCode = (dir: string) => {
  const cli = path.join(dir, "code")
  fs.writeFileSync(
    cli,
    `#!/bin/sh\nlist="${dir}/extensions.txt"\ntouch "$list"\ncase "$1" in\n  --list-extensions) cat "$list" ;;\n  --install-extension) echo "effectscript.effectscript-vscode" >> "$list" ;;\nesac\n`,
    { mode: 0o755 }
  )
  return cli
}

const setup = (home: string, found: ReadonlyArray<Detected>, extra: Partial<Parameters<typeof plan>[1]> = {}) =>
  plan(found, {
    home,
    skill,
    vsix: "/tmp/effectscript.vsix",
    lsp: ["efx", "lsp"],
    exec: (command, args) => spawnSync(command, [...args], { encoding: "utf8" }),
    ...extra
  })

const run = (actions: ReadonlyArray<Action>) => actions.map((a) => [a.id, a.apply().status] as const)

const agents = (home: string): Array<Detected> => [
  { kind: "agent", id: "claude", name: "Claude Code", skillsDir: path.join(home, ".claude/skills"), evidence: "" },
  { kind: "agent", id: "codex", name: "Codex", skillsDir: path.join(home, ".codex/skills"), evidence: "" }
]

describe("efx setup actions (Plan 15 Task 2, ADR-0052)", () => {
  it("installs the skill once and links it into every agent; a second run changes nothing", () => {
    const home = temp()
    const actions = setup(home, agents(home))
    expect(actions.map((a) => a.id)).toEqual(["skill", "skill:claude", "skill:codex"])
    expect(run(actions)).toEqual([["skill", "done"], ["skill:claude", "done"], ["skill:codex", "done"]])
    const shared = path.join(home, ".agents/skills/effectscript")
    expect(fs.readFileSync(path.join(shared, "references/syntax.md"), "utf8")).toBe("# syntax\n")
    expect(fs.realpathSync(path.join(home, ".claude/skills/effectscript"))).toBe(shared)
    expect(run(setup(home, agents(home)))).toEqual([["skill", "skipped"], ["skill:claude", "skipped"], [
      "skill:codex",
      "skipped"
    ]])
  })

  it("keeps an agent's own skill of the same name", () => {
    const home = temp()
    const theirs = path.join(home, ".claude/skills/effectscript")
    fs.mkdirSync(theirs, { recursive: true })
    fs.writeFileSync(path.join(theirs, "SKILL.md"), "---\nname: mine\n---\n")
    const actions = setup(home, agents(home))
    const claude = actions.find((a) => a.id === "skill:claude")!
    actions[0]!.apply()
    const outcome = claude.apply()
    expect(outcome.status).toBe("skipped")
    expect(outcome.detail).toMatch(/isn't the EffectScript skill/)
    expect(fs.readFileSync(path.join(theirs, "SKILL.md"), "utf8")).toContain("mine")
  })

  it("copies when links can't be made (Windows without developer mode)", () => {
    const home = temp()
    const actions = setup(home, agents(home), {
      symlink: () => {
        throw Object.assign(new Error("EPERM"), { code: "EPERM" })
      }
    })
    expect(run(actions).map(([, s]) => s)).toEqual(["done", "done", "done"])
    const claude = path.join(home, ".claude/skills/effectscript")
    expect(fs.lstatSync(claude).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(path.join(claude, "SKILL.md"), "utf8")).toContain("name: effectscript")
  })

  it("installs the extension through each VS Code-family CLI, once", () => {
    const home = temp()
    const code = fakeCode(home)
    const found: Array<Detected> = [{ kind: "editor", id: "vscode", name: "VS Code", cli: code, evidence: code }]
    expect(run(setup(home, found))).toEqual([["vscode", "done"]])
    expect(run(setup(home, found))).toEqual([["vscode", "skipped"]])
    const noVsix = setup(home, found, { vsix: undefined })[0]!
    expect(noVsix.apply().status).toBe("skipped")
  })

  it("adds a Neovim plugin file, and keeps one the user wrote", () => {
    const home = temp()
    const nvim: Array<Detected> = [{
      kind: "editor",
      id: "neovim",
      name: "Neovim",
      cli: "nvim",
      configDir: path.join(home, ".config/nvim"),
      evidence: ""
    }]
    expect(run(setup(home, nvim))).toEqual([["neovim", "done"]])
    const file = path.join(home, ".config/nvim/plugin/effectscript.lua")
    const text = fs.readFileSync(file, "utf8")
    expect(text).toContain("vim.lsp.enable(\"efx\")")
    expect(text).toContain("cwd = config.root_dir")
    expect(run(setup(home, nvim))).toEqual([["neovim", "skipped"]])
    fs.writeFileSync(file, "-- my own\n")
    const outcome = setup(home, nvim)[0]!.apply()
    expect(outcome.status).toBe("skipped")
    expect(fs.readFileSync(file, "utf8")).toBe("-- my own\n")
  })

  it("appends the Helix language and its queries, once, and keeps a user's own entry", () => {
    const home = temp()
    const config = path.join(home, ".config/helix")
    fs.mkdirSync(config, { recursive: true })
    fs.writeFileSync(path.join(config, "languages.toml"), "[[language]]\nname = \"rust\"\nauto-format = true\n")
    const helix: Array<Detected> = [{
      kind: "editor",
      id: "helix",
      name: "Helix",
      cli: "hx",
      configDir: config,
      evidence: ""
    }]
    expect(run(setup(home, helix))).toEqual([["helix", "done"]])
    const toml = fs.readFileSync(path.join(config, "languages.toml"), "utf8")
    expect(toml.startsWith("[[language]]\nname = \"rust\"\nauto-format = true\n")).toBe(true)
    expect(toml).toContain("name = \"effectscript\"")
    expect(fs.readFileSync(path.join(config, "runtime/queries/effectscript/highlights.scm"), "utf8")).toBe(
      "; inherits: typescript\n"
    )
    expect(run(setup(home, helix))).toEqual([["helix", "skipped"]])
  })

  it("explains Zed and JetBrains instead of writing", () => {
    const home = temp()
    const found: Array<Detected> = [
      { kind: "editor", id: "zed", name: "Zed", cli: "zed", evidence: "" },
      { kind: "editor", id: "jetbrains", name: "JetBrains IDEs", evidence: "WebStorm.app" }
    ]
    const outcomes = setup(home, found).map((a) => a.apply())
    expect(outcomes.map((o) => o.status)).toEqual(["manual", "manual"])
    expect(outcomes[1]!.detail).toMatch(/LSP4IJ/)
    expect(fs.readdirSync(home)).toEqual([])
  })
})
