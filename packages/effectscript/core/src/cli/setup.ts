/**
 * `efx setup` (spec §7.5, ADR-0052): wires EffectScript into the editors and coding agents on this
 * machine, asking before each write. `--yes` applies everything, `--dry-run` only lists, and
 * without a terminal nothing is written unless `--yes` is given.
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { detect, type Detected, type SetupEnv } from "../setup/detect.ts"
import { type Action, plan } from "../setup/plan.ts"
import { cacheDir, standalone, unpackFiles } from "./host.ts"
import { skillFiles, writeSkill } from "./skill.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface SetupOptions {
  readonly cwd: string
  readonly home: string
  readonly yes: boolean
  readonly dryRun: boolean
  /** Install the skill into this project instead of the machine. */
  readonly project: boolean
  /** Restrict to these detection ids (`claude`, `neovim`, `vscode`, …). */
  readonly only: ReadonlyArray<string> | undefined
  readonly vsix: string | undefined
}

/** The real machine, for `detect`. */
const machine = (home: string): SetupEnv => ({
  home,
  platform: process.platform,
  path: (process.env.PATH ?? "").split(path.delimiter).filter((p) => p !== ""),
  vars: process.env,
  exists: (file) => fs.existsSync(file),
  entries: (dir) => {
    try {
      return fs.readdirSync(dir)
    } catch {
      return []
    }
  }
})

/** How editors start the language server: this binary, or this package's `bin/efx.js` on Node. */
const lspCommand = (): Array<string> =>
  standalone() !== undefined
    ? [process.execPath, "lsp"]
    : [process.execPath, fileURLToPath(new URL("../../bin/efx.js", import.meta.url)), "lsp"]

/** The `.vsix` to install: `--vsix`, or the one the standalone binary carries (unpacked once). */
const vsixPath = (options: SetupOptions): string | undefined => {
  if (options.vsix !== undefined) return path.resolve(options.cwd, options.vsix)
  const host = standalone()
  if (host?.vsix === undefined) return undefined
  const dir = unpackFiles(path.join(cacheDir(process.env, process.platform, options.home), `vscode-${host.version}`), [
    ["effectscript.vsix", host.vsix]
  ])
  return path.join(dir, "effectscript.vsix")
}

const projectActions = (options: SetupOptions): Array<Action> =>
  [".claude/skills/effectscript", ".agents/skills/effectscript"].map((dir) => ({
    id: `project:${dir}`,
    description: `Install the EffectScript skill in ${dir}`,
    apply: () => {
      writeSkill(path.join(options.cwd, dir), skillFiles())
      return { status: "done", detail: path.join(options.cwd, dir) }
    }
  }))

const symbol = { done: "✓", skipped: "·", manual: "→", failed: "✗" } as const

/**
 * Runs `efx setup`. Returns the exit code.
 *
 * @since 4.0.0
 * @category setup
 */
export const setup = async (
  options: SetupOptions,
  out: (line: string) => void,
  err: (line: string) => void
): Promise<number> => {
  const found: ReadonlyArray<Detected> = options.project
    ? []
    : detect(machine(options.home)).filter((d) => options.only === undefined || options.only.includes(d.id))
  const actions = options.project ? projectActions(options) : plan(found, {
    home: options.home,
    skill: skillFiles(),
    vsix: vsixPath(options),
    lsp: lspCommand(),
    exec: (command, args) => {
      const result = spawnSync(command, [...args], { encoding: "utf8", shell: process.platform === "win32" })
      return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
    }
  })
  if (actions.length === 0) {
    out("Nothing to set up: no supported editor or coding agent was found (efx doctor lists what is supported)")
    return 0
  }
  if (!options.project) {
    out(`Found: ${found.map((d) => d.name).join(", ")}`)
  }
  const interactive = process.stdin.isTTY === true && !options.yes
  if (options.dryRun || (!interactive && !options.yes)) {
    for (const action of actions) out(`  ${action.description}`)
    out(
      options.dryRun
        ? "Dry run: nothing was written"
        : "Rerun with --yes to apply these (or run efx setup in a terminal)"
    )
    return 0
  }
  const prompt = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
  let failed = false
  try {
    for (const action of actions) {
      if (prompt !== undefined) {
        const answer = (await prompt.question(`${action.description}? [Y/n] `)).trim().toLowerCase()
        if (answer !== "" && answer !== "y" && answer !== "yes") {
          out(`${symbol.skipped} ${action.description}: not now`)
          continue
        }
      }
      const outcome = action.apply()
      const line = `${symbol[outcome.status]} ${action.description}${
        outcome.detail === "" ? "" : `: ${outcome.detail}`
      }`
      if (outcome.status === "failed") {
        failed = true
        err(line)
      } else {
        out(line)
      }
    }
  } finally {
    prompt?.close()
  }
  return failed ? 1 : 0
}

/**
 * @since 4.0.0
 * @category setup
 */
export const defaultHome = (): string => os.homedir()
