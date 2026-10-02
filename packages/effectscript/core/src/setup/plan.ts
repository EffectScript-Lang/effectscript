/**
 * `efx setup` actions (spec §7.5, ADR-0052): what to write for each detected editor and agent.
 * Every action can run twice, changes nothing the second time, and keeps configuration the user
 * wrote.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { isEffectScriptSkill, writeSkill } from "../cli/skill.ts"
import type { Detected } from "./detect.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface Outcome {
  readonly status: "done" | "skipped" | "manual" | "failed"
  readonly detail: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Action {
  readonly id: string
  readonly description: string
  readonly apply: () => Outcome
}

/**
 * @since 4.0.0
 * @category models
 */
export interface PlanOptions {
  readonly home: string
  /** The skill's files, `[relative path, content]` (ADR-0051). */
  readonly skill: ReadonlyArray<readonly [string, string]>
  /** The EffectScript `.vsix`, when one is at hand (the standalone binary carries it). */
  readonly vsix: string | undefined
  /** How editors start the language server, for example `["efx", "lsp"]`. */
  readonly lsp: ReadonlyArray<string>
  readonly exec: (
    command: string,
    args: ReadonlyArray<string>
  ) => { readonly status: number | null; readonly stdout: string; readonly stderr: string }
  /** `fs.symlinkSync` by default; replaceable to test the copy fallback. */
  readonly symlink?: ((target: string, link: string) => void) | undefined
}

const marker = "efx setup"
const extensionId = "effectscript.effectscript-vscode"

const isOurSkill = isEffectScriptSkill

const sameFiles = (dir: string, files: PlanOptions["skill"]): boolean =>
  files.every(([file, content]) => {
    try {
      return fs.readFileSync(path.join(dir, file), "utf8") === content
    } catch {
      return false
    }
  })

const attempt = (f: () => Outcome): Outcome => {
  try {
    return f()
  } catch (error) {
    return { status: "failed", detail: (error as Error).message }
  }
}

/** The skill, once in `~/.agents/skills/effectscript`, linked from each agent's skills directory. */
const skillActions = (agents: ReadonlyArray<Detected>, options: PlanOptions): Array<Action> => {
  if (agents.length === 0) return []
  const shared = path.join(options.home, ".agents", "skills", "effectscript")
  const symlink = options.symlink ?? ((target: string, link: string) => fs.symlinkSync(target, link, "dir"))
  return [
    {
      id: "skill",
      description: `Install the EffectScript skill in ${shared}`,
      apply: () =>
        attempt(() => {
          if (fs.existsSync(shared) && !isOurSkill(shared)) {
            return { status: "skipped", detail: `${shared} exists and isn't the EffectScript skill` }
          }
          if (sameFiles(shared, options.skill) && fs.readdirSync(shared).length > 0) {
            return { status: "skipped", detail: "already installed" }
          }
          writeSkill(shared, options.skill)
          return { status: "done", detail: shared }
        })
    },
    ...agents.map((agent): Action => {
      const link = path.join(agent.skillsDir!, "effectscript")
      return {
        id: `skill:${agent.id}`,
        description: `Give ${agent.name} the skill (${link})`,
        apply: () =>
          attempt(() => {
            const stat = fs.lstatSync(link, { throwIfNoEntry: false })
            if (stat?.isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(shared)) {
              return { status: "skipped", detail: "already linked" }
            }
            if (stat !== undefined && !isOurSkill(link)) {
              return { status: "skipped", detail: `${link} exists and isn't the EffectScript skill` }
            }
            if (stat !== undefined && !stat.isSymbolicLink()) {
              // an earlier copy of ours: update it in place, keeping anything the user added
              if (sameFiles(link, options.skill)) return { status: "skipped", detail: "already installed" }
              writeSkill(link, options.skill)
              return { status: "done", detail: `${link} (updated copy)` }
            }
            if (stat?.isSymbolicLink() === true) fs.unlinkSync(link)
            fs.mkdirSync(agent.skillsDir!, { recursive: true })
            try {
              symlink(shared, link)
              return { status: "done", detail: `${link} → ${shared}` }
            } catch {
              // no links (Windows without developer mode): a copy
              writeSkill(link, options.skill)
              return { status: "done", detail: `${link} (a copy)` }
            }
          })
      }
    })
  ]
}

const vscodeAction = (editor: Detected, options: PlanOptions): Action => ({
  id: editor.id,
  description: `Install the EffectScript extension in ${editor.name}`,
  apply: () =>
    attempt(() => {
      const listed = options.exec(editor.cli!, ["--list-extensions"])
      if (listed.stdout.split(/\r?\n/).some((line) => line.trim().toLowerCase() === extensionId)) {
        return { status: "skipped", detail: "already installed" }
      }
      if (options.vsix === undefined) {
        return {
          status: "skipped",
          detail: "no .vsix at hand: the standalone efx carries one, or pass --vsix <file>"
        }
      }
      const installed = options.exec(editor.cli!, ["--install-extension", options.vsix])
      return installed.status === 0
        ? { status: "done", detail: `${editor.cli} --install-extension` }
        : { status: "failed", detail: `${installed.stdout}${installed.stderr}`.trim() }
    })
})

const lua = (value: string) => JSON.stringify(value)

const neovimAction = (editor: Detected, options: PlanOptions): Action => {
  const file = path.join(editor.configDir!, "plugin", "effectscript.lua")
  const text = [
    `-- EffectScript: .efx files and the efx language server (written by ${marker}; delete to opt out)`,
    "vim.filetype.add({ extension = { efx = \"effectscript\" } })",
    "vim.lsp.config(\"efx\", {",
    "  -- start in the project root, so efx lsp finds the project's @effectscript/language",
    "  cmd = function(dispatchers, config)",
    `    return vim.lsp.rpc.start({ ${options.lsp.map(lua).join(", ")} }, dispatchers, { cwd = config.root_dir })`,
    "  end,",
    "  filetypes = { \"effectscript\" },",
    "  root_markers = { \"tsconfig.json\", \"package.json\", \".git\" },",
    "})",
    "vim.lsp.enable(\"efx\")",
    "vim.api.nvim_set_hl(0, \"@lsp.typemod.keyword.effect\", { italic = true, default = true })",
    ""
  ].join("\n")
  return {
    id: "neovim",
    description: `Configure Neovim (${file})`,
    apply: () =>
      attempt(() => {
        if (fs.existsSync(file)) {
          const current = fs.readFileSync(file, "utf8")
          if (current === text) return { status: "skipped", detail: "already set up" }
          if (!current.includes(`written by ${marker}`)) {
            return { status: "skipped", detail: `${file} exists and wasn't written by efx setup` }
          }
        }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, text)
        return { status: "done", detail: file }
      })
  }
}

const helixAction = (editor: Detected, options: PlanOptions): Action => {
  const toml = path.join(editor.configDir!, "languages.toml")
  const block = [
    "",
    `# EffectScript (${marker})`,
    "[language-server.efx]",
    `command = ${JSON.stringify(options.lsp[0])}`,
    `args = [${options.lsp.slice(1).map((a) => JSON.stringify(a)).join(", ")}]`,
    "",
    "[[language]]",
    "name = \"effectscript\"",
    "scope = \"source.efx\"",
    "file-types = [\"efx\"]",
    "roots = [\"tsconfig.json\", \"package.json\"]",
    "language-servers = [\"efx\"]",
    "grammar = \"typescript\"",
    ""
  ].join("\n")
  const queries = path.join(editor.configDir!, "runtime", "queries", "effectscript")
  return {
    id: "helix",
    description: `Configure Helix (${toml})`,
    apply: () =>
      attempt(() => {
        const current = fs.existsSync(toml) ? fs.readFileSync(toml, "utf8") : ""
        const hasLanguage = /^\s*name\s*=\s*"effectscript"\s*$/m.test(current)
        const missing = ["highlights", "textobjects", "indents", "locals", "injections"]
          .filter((q) => !fs.existsSync(path.join(queries, `${q}.scm`)))
        if (hasLanguage && missing.length === 0) return { status: "skipped", detail: "already set up" }
        if (!hasLanguage) {
          fs.mkdirSync(editor.configDir!, { recursive: true })
          fs.writeFileSync(toml, `${current}${current === "" || current.endsWith("\n") ? "" : "\n"}${block}`)
        }
        fs.mkdirSync(queries, { recursive: true })
        for (const q of missing) fs.writeFileSync(path.join(queries, `${q}.scm`), "; inherits: typescript\n")
        return { status: "done", detail: toml }
      })
  }
}

const manual = (editor: Detected, detail: string): Action => ({
  id: editor.id,
  description: `${editor.name}: instructions`,
  apply: () => ({ status: "manual", detail })
})

/**
 * The actions for what `detect` found, skill first, then editors in detection order.
 *
 * @since 4.0.0
 * @category setup
 */
export const plan = (found: ReadonlyArray<Detected>, options: PlanOptions): Array<Action> => {
  const actions = skillActions(found.filter((d) => d.kind === "agent" && d.skillsDir !== undefined), options)
  const command = options.lsp.join(" ")
  for (const editor of found.filter((d) => d.kind === "editor")) {
    switch (editor.id) {
      case "vscode":
      case "cursor":
      case "windsurf":
      case "vscodium":
        actions.push(vscodeAction(editor, options))
        break
      case "neovim":
        actions.push(neovimAction(editor, options))
        break
      case "helix":
        actions.push(helixAction(editor, options))
        break
      case "zed":
        actions.push(
          manual(
            editor,
            `Zed needs an EffectScript extension (planned); until then, use \`${command}\` as a language server for *.efx`
          )
        )
        break
      case "jetbrains":
        actions.push(
          manual(editor, `install LSP4IJ, then add a language server running \`${command}\` for *.efx files`)
        )
        break
    }
  }
  return actions
}
