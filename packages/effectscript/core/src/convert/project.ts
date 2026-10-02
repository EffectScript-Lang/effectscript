/**
 * `efx convert` on a project (spec §7.5): read the files, plan, and with `--write` apply the plan
 * on a new branch, verify it, and revert converted files newest first until it verifies.
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { languageBin, runCheck } from "../cli/check.ts"
import { lineColumn } from "../compiler/diagnostics.ts"
import { packageInfo } from "../project.ts"
import { aiPass, findAgent } from "./ai.ts"
import { type ConversionPlan, planConversion } from "./plan.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface ConvertCommandOptions {
  readonly paths: ReadonlyArray<string>
  readonly write: boolean
  readonly explain: boolean
  readonly force: boolean
  readonly verify: boolean
  /** The test command (default: `npm test` when package.json has a test script). */
  readonly test: string | undefined
  /** After the mechanical pass, let a local coding agent convert what was left (ADR-0052). */
  readonly ai?: boolean | undefined
  readonly agent?: string | undefined
  /** Seconds the agent gets per file. */
  readonly timeout?: number | undefined
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Output {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
}

const branch = "effectscript/convert"
const readable = /\.(tsx?|efx|mts|cts|jsx?|mjs|cjs)$/

const gitIn = (cwd: string, args: ReadonlyArray<string>) => spawnSync("git", args, { cwd, encoding: "utf8" })

/** Project files (relative, posix): git's view when available, otherwise a directory walk. */
const listFiles = (cwd: string, isGit: boolean): Array<string> => {
  if (isGit) {
    const listed = gitIn(cwd, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).stdout
    return listed.split("\0").filter((f) => f !== "" && fs.existsSync(path.join(cwd, f)))
  }
  const found: Array<string> = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(cwd, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const rel = dir === "" ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else found.push(rel)
    }
  }
  walk("")
  return found
}

const report = (
  plan: ConversionPlan,
  files: ReadonlyMap<string, string>,
  options: ConvertCommandOptions,
  io: Output
) => {
  for (const rename of plan.renames) {
    io.out(`${rename.from} → ${rename.to}`)
    if (!options.explain) continue
    const source = files.get(rename.from)!
    for (const note of rename.notes) {
      const { column, line } = lineColumn(source, note.start)
      io.out(`  ${rename.from}:${line}:${column}: ${note.message}`)
    }
  }
  for (const edit of plan.edits) io.out(`${edit.file}: imports updated`)
  if (options.explain) { for (const skip of plan.skipped) io.out(`${skip.file}: stays TypeScript (${skip.reason})`) }
  io.out(`${plan.renames.length} file(s) to convert, ${plan.skipped.length} left as TypeScript`)
}

/** Writes a plan over the original files (`files` holds the originals). */
const apply = (cwd: string, plan: ConversionPlan) => {
  for (const rename of plan.renames) {
    fs.writeFileSync(path.join(cwd, rename.to), rename.code)
    fs.rmSync(path.join(cwd, rename.from))
  }
  for (const edit of plan.edits) fs.writeFileSync(path.join(cwd, edit.file), edit.code)
}

/** Undoes `apply`. */
const restore = (cwd: string, plan: ConversionPlan, files: ReadonlyMap<string, string>) => {
  for (const rename of plan.renames) {
    fs.rmSync(path.join(cwd, rename.to), { force: true })
    fs.writeFileSync(path.join(cwd, rename.from), files.get(rename.from)!)
  }
  for (const edit of plan.edits) fs.writeFileSync(path.join(cwd, edit.file), files.get(edit.file)!)
}

interface Step {
  readonly name: string
  readonly run: () => { readonly ok: boolean; readonly output: string }
}

/**
 * The verification steps that apply to this project (ADR-0033): `efx check` when there is a
 * tsconfig.json and `@effectscript/language` resolves, and the test command. They run quietly.
 */
const verifier = (cwd: string, options: ConvertCommandOptions, io: Output): (() => string | undefined) | undefined => {
  const steps: Array<Step> = []
  if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
    if (languageBin(cwd, false) === undefined) {
      io.out("Skipping efx check: @effectscript/language isn't installed in this project")
    } else {
      steps.push({
        name: "efx check",
        run: () => {
          const result = runCheck(["-p", "tsconfig.json"], true)
          return { ok: result.status === 0, output: result.output }
        }
      })
    }
  }
  let test = options.test
  if (test === undefined) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"))
      if (typeof pkg.scripts?.test === "string") test = "npm test"
    } catch {
      // no package.json: no test command
    }
  }
  if (test !== undefined) {
    const command = test
    steps.push({
      name: command,
      run: () => {
        const result = spawnSync(command, { cwd, shell: true, encoding: "utf8" })
        return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` }
      }
    })
  }
  if (steps.length === 0) {
    io.out("Nothing to verify with: no tsconfig.json and no test command (pass --test)")
    return undefined
  }
  // the name and output of the first failing step, or `undefined` when all pass
  return () => {
    for (const step of steps) {
      const result = step.run()
      if (!result.ok) return `${step.name} failed:\n${result.output.trimEnd()}`
    }
    return undefined
  }
}

/**
 * Runs `efx convert` in `cwd` and returns the exit code.
 *
 * @since 4.0.0
 * @category convert
 */
export const convertProject = (cwd: string, options: ConvertCommandOptions, io: Output): number => {
  const isGit = gitIn(cwd, ["rev-parse", "--is-inside-work-tree"]).stdout.trim() === "true"
  if (options.write && !isGit) {
    io.err("efx convert --write needs a git repository: it works on a new branch, so nothing is lost")
    return 1
  }
  // every untracked file counts, whatever the user's status.showUntrackedFiles (ADR-0033)
  if (
    options.write && !options.force &&
    gitIn(cwd, ["status", "--porcelain", "--untracked-files=all"]).stdout.trim() !== ""
  ) {
    io.err("efx convert --write needs a clean working tree: commit or stash your uncommitted changes (or pass --force)")
    return 1
  }
  const files = new Map<string, string>()
  for (const file of listFiles(cwd, isGit)) {
    if (readable.test(file)) files.set(file, fs.readFileSync(path.join(cwd, file), "utf8"))
  }
  const { packageName, packageRoot } = packageInfo(path.join(cwd, "package.json"))
  const planOptions = {
    paths: options.paths,
    packageName,
    packageRoot: packageRoot === undefined ? undefined : path.relative(cwd, packageRoot)
  }
  const full = planConversion(files, planOptions)
  report(full, files, options, io)
  if (!options.write) {
    io.out(
      options.ai === true
        ? "--ai needs --write: rerun with --write --ai"
        : "Dry run: rerun with --write to convert on a new branch"
    )
    return 0
  }
  if (full.renames.length === 0) return 0
  const verify = options.verify ? verifier(cwd, options, io) : undefined
  // a red project can't tell which conversion broke it: refuse before touching anything
  const baseline = verify?.()
  if (baseline !== undefined) {
    io.err(`efx convert: the project doesn't verify before converting, so nothing was changed\n${baseline}`)
    return 1
  }
  const original = gitIn(cwd, ["branch", "--show-current"]).stdout.trim()
  const switched = gitIn(cwd, ["switch", "-c", branch])
  if (switched.status !== 0) {
    io.err(`efx convert couldn't create the branch ${branch}: ${switched.stderr.trim()}`)
    return 1
  }
  let plan = full
  apply(cwd, plan)
  if (verify !== undefined && verify() !== undefined) {
    // bisect: groups that verify are kept, files that fail alone are reverted (ADR-0033)
    const kept: Array<string> = []
    const tryAdd = (group: ReadonlyArray<string>): void => {
      if (group.length === 0) return
      restore(cwd, plan, files)
      plan = planConversion(files, { ...planOptions, only: new Set([...kept, ...group]) })
      apply(cwd, plan)
      if (verify() === undefined) {
        kept.push(...group)
        return
      }
      if (group.length === 1) {
        io.out(`reverted ${group[0]}: the project didn't verify with it converted`)
        return
      }
      const middle = group.length >> 1
      tryAdd(group.slice(0, middle))
      tryAdd(group.slice(middle))
    }
    const all = full.renames.map((r) => r.from)
    const middle = all.length >> 1
    tryAdd(all.slice(0, middle))
    tryAdd(all.slice(middle))
    restore(cwd, plan, files)
    plan = planConversion(files, { ...planOptions, only: new Set(kept) })
    apply(cwd, plan)
  }
  if (plan.renames.length === 0) {
    // nothing converted: leave the user where they were
    gitIn(cwd, ["switch", original])
    gitIn(cwd, ["branch", "-D", branch])
    io.out("Nothing could be converted while keeping the project green")
    return 0
  }
  if (options.ai === true) {
    const agent = findAgent(options.agent)
    const targets = plan.renames.filter((r) => r.notes.length > 0).map((r) => ({
      file: r.to,
      notes: r.notes.map((note) => `line ${lineColumn(files.get(r.from)!, note.start).line}: ${note.message}`)
    }))
    if (agent === undefined) {
      io.err(
        `efx convert --ai: no coding agent found on PATH${
          options.agent === undefined ? " (claude, codex, gemini, opencode)" : ` (${options.agent})`
        }; the mechanical conversion stands`
      )
    } else if (targets.length === 0) {
      io.out("AI pass: nothing was left as TypeScript")
    } else {
      const { kept, reverted } = aiPass(cwd, targets, agent, verify, options.timeout ?? 300, io)
      io.out(`AI pass: kept ${kept} edit(s), reverted ${reverted}`)
    }
  }
  io.out(`Converted ${plan.renames.length} file(s) on branch ${branch}: review with git status and git diff`)
  return 0
}
