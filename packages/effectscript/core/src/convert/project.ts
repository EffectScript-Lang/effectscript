/**
 * `efx convert` on a project (spec §7.5): read the files, plan, and with `--write` apply the plan
 * on a new branch, verify it, and revert converted files newest first until it verifies.
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { check } from "../cli/check.ts"
import { lineColumn } from "../compiler/diagnostics.ts"
import { packageInfo } from "../project.ts"
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

/** The verification steps that apply to this project: `efx check` (with a tsconfig) and tests. */
const verifier = (cwd: string, options: ConvertCommandOptions, io: Output): (() => boolean) | undefined => {
  const steps: Array<() => boolean> = []
  if (fs.existsSync(path.join(cwd, "tsconfig.json"))) steps.push(() => check(["-p", "tsconfig.json"]) === 0)
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
    steps.push(() => spawnSync(test, { cwd, shell: true, stdio: "ignore" }).status === 0)
  }
  if (steps.length === 0) {
    io.out("Nothing to verify with: no tsconfig.json and no test command (pass --test)")
    return undefined
  }
  return () => steps.every((step) => step())
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
  if (options.write && !options.force && gitIn(cwd, ["status", "--porcelain"]).stdout.trim() !== "") {
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
  let plan = planConversion(files, planOptions)
  report(plan, files, options, io)
  if (!options.write) {
    io.out("Dry run: rerun with --write to convert on a new branch")
    return 0
  }
  if (plan.renames.length === 0) return 0
  const switched = gitIn(cwd, ["switch", "-c", branch])
  if (switched.status !== 0) {
    io.err(`efx convert couldn't create the branch ${branch}: ${switched.stderr.trim()}`)
    return 1
  }
  apply(cwd, plan)
  const verify = options.verify ? verifier(cwd, options, io) : undefined
  if (verify !== undefined && !verify()) {
    // revert converted files newest first, down to the last green state
    const kept = plan.renames.map((r) => r.from)
    while (kept.length > 0) {
      const reverted = kept.pop()!
      restore(cwd, plan, files)
      plan = planConversion(files, { ...planOptions, only: new Set(kept) })
      apply(cwd, plan)
      io.out(`reverted ${reverted}: the project didn't verify with it converted`)
      if (verify()) break
    }
    if (kept.length === 0 && !verify()) {
      io.err("efx convert: the project doesn't verify even without conversions; nothing was converted")
      return 1
    }
  }
  io.out(`Converted ${plan.renames.length} file(s) on branch ${branch}: review with git status and git diff`)
  return 0
}
