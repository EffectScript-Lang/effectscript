/**
 * `efx setup` actions (spec §7.5, ADR-0052): what to write for each detected editor and agent.
 * Every action can run twice, changes nothing the second time, and keeps configuration the user
 * wrote.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { parse as parseToml } from "smol-toml"
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
  /** The EffectScript `.vsix`, when one is at hand (the standalone binary carries it). Called only
   * when an extension is actually installed, so listing never unpacks anything (review I12). */
  readonly vsix: () => string | undefined
  /** How editors start the language server, for example `["efx", "lsp"]`. */
  readonly lsp: ReadonlyArray<string>
  readonly exec: (
    command: string,
    args: ReadonlyArray<string>
  ) => { readonly status: number | null; readonly stdout: string; readonly stderr: string }
  /** The Marketplace version of the `.vsix` this `efx` carries: an older installed one is upgraded. */
  readonly extensionVersion?: string | undefined
  /** `fs.symlinkSync` by default; replaceable to test the copy fallback. */
  readonly symlink?: ((target: string, link: string) => void) | undefined
}

const marker = "efx setup"
const extensionId = "effectscript.effectscript-vscode"

const isOurSkill = isEffectScriptSkill

/** Whether `dir` holds exactly these files: none differs, and none a previous version wrote is left. */
const sameFiles = (dir: string, files: PlanOptions["skill"]): boolean => {
  const same = files.every(([file, content]) => {
    try {
      return fs.readFileSync(path.join(dir, file), "utf8") === content
    } catch {
      return false
    }
  })
  if (!same) return false
  try {
    const written: unknown = JSON.parse(fs.readFileSync(path.join(dir, ".efx-skill.json"), "utf8")).files
    const expected = new Set(files.map(([file]) => file))
    return !Array.isArray(written) || written.every((file) => expected.has(String(file)))
  } catch {
    return true
  }
}

/** `a` < `b` for plain `x.y.z` versions. */
const older = (a: string, b: string): boolean => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number))
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return (x![i] ?? 0) < (y![i] ?? 0)
  return false
}

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
          if (fs.lstatSync(shared, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
            // probably a checkout of the skill: never write through it (review I6)
            return { status: "skipped", detail: `${shared} is a link; efx setup doesn't write through links` }
          }
          if (fs.existsSync(shared) && !isOurSkill(shared)) {
            return { status: "skipped", detail: `${shared} exists and isn't the EffectScript skill` }
          }
          if (sameFiles(shared, options.skill) && fs.readdirSync(shared).length > 0) {
            return { status: "skipped", detail: "already installed" }
          }
          const upgrade = fs.existsSync(shared) && fs.readdirSync(shared).length > 0
          writeSkill(shared, options.skill)
          return { status: "done", detail: upgrade ? `updated ${shared} to this efx's skill` : shared }
        })
    },
    ...agents.map((agent): Action => {
      const link = path.join(agent.skillsDir!, "effectscript")
      return {
        id: `skill:${agent.id}`,
        description: `Give ${agent.name} the skill (${link})`,
        apply: () =>
          attempt(() => {
            if (!isOurSkill(shared)) {
              // the shared skill was skipped or declined: a link to it would dangle (review I5)
              return { status: "skipped", detail: `the shared EffectScript skill isn't installed in ${shared}` }
            }
            const stat = fs.lstatSync(link, { throwIfNoEntry: false })
            if (stat?.isSymbolicLink() && fs.existsSync(link) && fs.realpathSync(link) === fs.realpathSync(shared)) {
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
      const listed = options.exec(editor.cli!, ["--list-extensions", "--show-versions"])
      const installed = listed.stdout.split(/\r?\n/).map((line) => line.trim().toLowerCase())
        .filter((line) => line === extensionId || line.startsWith(`${extensionId}@`))
        .map((line) => line.slice(extensionId.length + 1))
        .pop()
      // after updating efx, its newer extension replaces the installed one (Plan 20 Task 1)
      const upgrade = installed !== undefined && installed !== "" && options.extensionVersion !== undefined &&
        older(installed, options.extensionVersion)
      if (installed !== undefined && !upgrade) return { status: "skipped", detail: "already installed" }
      const vsix = options.vsix()
      if (vsix === undefined) {
        return {
          status: "skipped",
          detail: "no .vsix at hand: the standalone efx carries one, or pass --vsix <file>"
        }
      }
      const result = options.exec(editor.cli!, ["--install-extension", vsix, ...(upgrade ? ["--force"] : [])])
      return result.status === 0
        ? {
          status: "done",
          detail: upgrade
            ? `upgraded ${installed} → ${options.extensionVersion}`
            : `${editor.cli} --install-extension`
        }
        : { status: "failed", detail: `${result.stdout}${result.stderr}`.trim() }
    })
})

const lua = (value: string) => JSON.stringify(value)

const neovimAction = (editor: Detected, options: PlanOptions): Action => {
  const file = path.join(editor.configDir!, "plugin", "effectscript.lua")
  const text = [
    `-- EffectScript: .efx files and the efx language server (written by ${marker}; delete to opt out)`,
    "-- vim.lsp.config and vim.lsp.enable arrived in Neovim 0.11",
    "if vim.fn.has(\"nvim-0.11\") == 0 then",
    "  return",
    "end",
    "vim.filetype.add({ extension = { efx = \"effectscript\" } })",
    "vim.lsp.config(\"efx\", {",
    "  -- start in the project root, so efx lsp finds the project's @effectscript/language",
    "  cmd = function(dispatchers, config)",
    `    return vim.lsp.rpc.start({ ${
      options.lsp.map(lua).join(", ")
    } }, dispatchers, { cwd = (config or {}).root_dir })`,
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

const begin = `# >>> EffectScript (written by ${marker}; delete this block to opt out)`
const finish = `# <<< EffectScript (${marker})`

/** Whether a parsed `languages.toml` already has the user's own EffectScript setup. */
const userOwned = (config: Record<string, unknown>): string | undefined => {
  const servers = config["language-server"] as Record<string, unknown> | undefined
  if (servers !== undefined && "efx" in servers) return "it defines a language server named efx"
  const languages = (config.language ?? []) as Array<Record<string, unknown>>
  for (const language of languages) {
    if (language.name === "effectscript") return "it defines an effectscript language"
    if (Array.isArray(language["file-types"]) && language["file-types"].includes("efx")) {
      return `its language ${String(language.name)} handles .efx files`
    }
  }
  return undefined
}

const helixAction = (editor: Detected, options: PlanOptions): Action => {
  const toml = path.join(editor.configDir!, "languages.toml")
  const block = [
    begin,
    "[language-server.effectscript-lsp]",
    `command = ${JSON.stringify(options.lsp[0])}`,
    `args = [${options.lsp.slice(1).map((a) => JSON.stringify(a)).join(", ")}]`,
    "",
    "[[language]]",
    "name = \"effectscript\"",
    "scope = \"source.efx\"",
    "file-types = [\"efx\"]",
    "roots = [\"tsconfig.json\", \"package.json\"]",
    "language-servers = [\"effectscript-lsp\"]",
    "grammar = \"typescript\"",
    finish
  ].join("\n")
  const queries = path.join(editor.configDir!, "runtime", "queries", "effectscript")
  return {
    id: "helix",
    description: `Configure Helix (${toml})`,
    apply: () =>
      attempt(() => {
        const current = fs.existsSync(toml) ? fs.readFileSync(toml, "utf8") : ""
        const start = current.indexOf(begin)
        const stop = current.indexOf(finish)
        const ours = start !== -1 && stop > start
        // the user's config without our block, which must parse on its own (review I8)
        const theirs = ours ? current.slice(0, start) + current.slice(stop + finish.length) : current
        let parsed: Record<string, unknown>
        try {
          parsed = parseToml(theirs) as Record<string, unknown>
        } catch {
          return { status: "skipped", detail: `${toml} doesn't parse; efx setup leaves it alone` }
        }
        const owned = userOwned(parsed)
        if (owned !== undefined) return { status: "skipped", detail: `${toml}: ${owned}` }
        const next = ours
          ? current.slice(0, start) + block + current.slice(stop + finish.length)
          : `${current}${current === "" || current.endsWith("\n") ? "" : "\n"}${current === "" ? "" : "\n"}${block}\n`
        parseToml(next)
        const missing = ["highlights", "textobjects", "indents", "locals", "injections"]
          .filter((q) => !fs.existsSync(path.join(queries, `${q}.scm`)))
        if (next === current && missing.length === 0) return { status: "skipped", detail: "already set up" }
        if (next !== current) {
          fs.mkdirSync(editor.configDir!, { recursive: true })
          const temp = `${toml}.${process.pid}.tmp`
          fs.writeFileSync(temp, next)
          fs.renameSync(temp, toml)
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
            "install the EffectScript extension (Zed → Extensions → EffectScript): it highlights .efx with the " +
              `EffectScript grammar and starts \`${command}\``
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
