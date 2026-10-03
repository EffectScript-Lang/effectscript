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
    vsix: () => "/tmp/effectscript.vsix",
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
    const noVsix = setup(home, found, { vsix: () => undefined })[0]!
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
    expect(text).toContain("cwd = (config or {}).root_dir")
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
    // Zed has an EffectScript extension now (Plan 19, ADR-0058)
    expect(outcomes[0]!.detail).toMatch(/EffectScript extension/)
    expect(outcomes[0]!.detail).not.toMatch(/planned/)
    expect(fs.readdirSync(home)).toEqual([])
  })
})

describe("efx setup review fixes (Plan 15 final review)", () => {
  it("links an agent only to an installed EffectScript skill (I5)", () => {
    const home = temp()
    const shared = path.join(home, ".agents/skills/effectscript")
    fs.mkdirSync(shared, { recursive: true })
    fs.writeFileSync(path.join(shared, "SKILL.md"), "---\nname: other\n---\n")
    const foreign = setup(home, agents(home)).find((a) => a.id === "skill:claude")!.apply()
    expect(foreign).toMatchObject({ status: "skipped" })
    expect(fs.existsSync(path.join(home, ".claude/skills/effectscript"))).toBe(false)
    const empty = temp()
    // only the agent's action, without the shared skill first
    const missing = setup(empty, agents(empty)).find((a) => a.id === "skill:claude")!.apply()
    expect(missing.status).toBe("skipped")
    expect(missing.detail).toMatch(/isn't installed/)
    expect(fs.existsSync(path.join(empty, ".claude/skills/effectscript"))).toBe(false)
  })

  it("never writes through a shared skill directory that is a link (I6)", () => {
    const home = temp()
    const checkout = path.join(temp(), "skills/effectscript")
    fs.mkdirSync(checkout, { recursive: true })
    fs.writeFileSync(path.join(checkout, "SKILL.md"), "---\nname: effectscript\n---\nmy uncommitted edit\n")
    fs.mkdirSync(path.join(home, ".agents/skills"), { recursive: true })
    fs.symlinkSync(checkout, path.join(home, ".agents/skills/effectscript"))
    const outcome = setup(home, agents(home))[0]!.apply()
    expect(outcome.status).toBe("skipped")
    expect(fs.readFileSync(path.join(checkout, "SKILL.md"), "utf8")).toContain("my uncommitted edit")
  })

  it("keeps a Helix config that already defines the server or the language, and writes valid TOML (I8)", async () => {
    const { parse } = await import("smol-toml")
    for (
      const existing of [
        "[language-server.efx]\ncommand = \"something-else\"\n",
        "[[language]]\nname = 'effectscript' # mine\nscope = \"source.efx\"\n",
        "[[language]]\nname = \"mine\"\nfile-types = [\"efx\"]\n"
      ]
    ) {
      const home = temp()
      const config = path.join(home, ".config/helix")
      fs.mkdirSync(config, { recursive: true })
      fs.writeFileSync(path.join(config, "languages.toml"), existing)
      const helix: Array<Detected> = [{
        kind: "editor",
        id: "helix",
        name: "Helix",
        cli: "hx",
        configDir: config,
        evidence: ""
      }]
      const outcome = setup(home, helix)[0]!.apply()
      expect(outcome.status, existing).toBe("skipped")
      expect(fs.readFileSync(path.join(config, "languages.toml"), "utf8")).toBe(existing)
    }
    const home = temp()
    const config = path.join(home, ".config/helix")
    const helix: Array<Detected> = [{
      kind: "editor",
      id: "helix",
      name: "Helix",
      cli: "hx",
      configDir: config,
      evidence: ""
    }]
    setup(home, helix)[0]!.apply()
    const parsed = parse(fs.readFileSync(path.join(config, "languages.toml"), "utf8")) as any
    expect(parsed["language-server"]["effectscript-lsp"].command).toBe("efx")
  })

  it("rewrites the Helix block it owns when the efx command changes (I9)", () => {
    const home = temp()
    const config = path.join(home, ".config/helix")
    const helix: Array<Detected> = [{
      kind: "editor",
      id: "helix",
      name: "Helix",
      cli: "hx",
      configDir: config,
      evidence: ""
    }]
    setup(home, helix)[0]!.apply()
    const outcome = setup(home, helix, { lsp: ["/opt/efx/bin/efx", "lsp"] })[0]!.apply()
    expect(outcome.status).toBe("done")
    const toml = fs.readFileSync(path.join(config, "languages.toml"), "utf8")
    expect(toml).toContain("/opt/efx/bin/efx")
    expect(toml.match(/efx setup/g)).toHaveLength(2) // one begin and one end marker, not two blocks
  })

  it("writes a Neovim plugin that does nothing on Neovim before 0.11 (I10)", () => {
    const home = temp()
    const nvim: Array<Detected> = [{
      kind: "editor",
      id: "neovim",
      name: "Neovim",
      cli: "nvim",
      configDir: path.join(home, ".config/nvim"),
      evidence: ""
    }]
    setup(home, nvim)[0]!.apply()
    const lua = fs.readFileSync(path.join(home, ".config/nvim/plugin/effectscript.lua"), "utf8")
    expect(lua).toContain("if vim.fn.has(\"nvim-0.11\") == 0 then")
    expect(lua).toContain("(config or {}).root_dir")
  })

  it("resolves the .vsix only when the extension is actually installed (I12)", () => {
    const home = temp()
    let resolved = 0
    const code = fakeCode(home)
    const found: Array<Detected> = [{ kind: "editor", id: "vscode", name: "VS Code", cli: code, evidence: code }]
    const actions = setup(home, found, {
      vsix: () => {
        resolved++
        return "/tmp/effectscript.vsix"
      }
    })
    expect(resolved).toBe(0)
    actions[0]!.apply()
    expect(resolved).toBe(1)
  })
})
