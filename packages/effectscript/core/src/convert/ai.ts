/**
 * `efx convert --ai` (spec §7.5 step 4, ADR-0052): after the mechanical pass, the user's own
 * coding agent converts what was left as TypeScript, one file at a time. An edit is kept only if
 * the file still compiles and the project still verifies. Edits outside the file are undone, and
 * nothing that existed before is ever deleted. Nothing leaves the machine except through the agent
 * the user runs.
 *
 * @since 4.0.0
 */
import { spawn, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { skillFiles, writeSkill } from "../cli/skill.ts"
import { toTypeScript } from "../compiler/compile.ts"

/**
 * A coding agent that can edit files non-interactively.
 *
 * @since 4.0.0
 * @category models
 */
export interface Agent {
  readonly id: "claude" | "codex" | "gemini" | "opencode"
  readonly command: string
  /** Its arguments for a prompt, given the directory that holds the skill. */
  readonly args: (prompt: string, skill: string) => ReadonlyArray<string>
}

/**
 * The supported agents, in the order `--ai` picks them. Each may edit files in the project, and
 * gets read access to the skill's directory (review I1, I2).
 *
 * @since 4.0.0
 * @category convert
 */
export const agents: ReadonlyArray<Agent> = [
  {
    id: "claude",
    command: "claude",
    args: (p, skill) => ["-p", p, "--permission-mode", "acceptEdits", "--add-dir", skill]
  },
  { id: "codex", command: "codex", args: (p) => ["exec", "--sandbox", "workspace-write", p] },
  {
    id: "gemini",
    command: "gemini",
    args: (p, skill) => ["--approval-mode", "auto_edit", "--include-directories", skill, "-p", p]
  },
  { id: "opencode", command: "opencode", args: (p) => ["run", p] }
]

const onPath = (command: string): boolean =>
  (process.env.PATH ?? "").split(path.delimiter).some((dir) =>
    dir !== "" &&
    [command, `${command}.exe`, `${command}.cmd`].some((name) => {
      try {
        fs.accessSync(path.join(dir, name), fs.constants.X_OK)
        return true
      } catch {
        return false
      }
    })
  )

/**
 * The agent to use: the one named, or the first one on PATH.
 *
 * @since 4.0.0
 * @category convert
 */
export const findAgent = (choice: string | undefined): Agent | undefined =>
  choice !== undefined
    ? agents.find((a) => a.id === choice && onPath(a.command))
    : agents.find((a) => onPath(a.command))

/** `git ls-files -z` with these flags. Throws when git fails: a partial list is never used (review C2). */
const gitFiles = (cwd: string, flags: ReadonlyArray<string>): Array<string> => {
  const result = spawnSync("git", ["ls-files", "-z", ...flags], { cwd, encoding: "utf8", maxBuffer: 1 << 30 })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.error?.message ?? result.stderr}`)
  }
  return result.stdout.split("\0").filter((f) => f !== "")
}

interface Snapshot {
  /** The content of every file git sees (tracked, and untracked but not ignored). */
  readonly contents: ReadonlyMap<string, Buffer>
  /** Every path that exists, ignored ones included: none of these is ever deleted (review C1). */
  readonly paths: ReadonlySet<string>
}

const snapshot = (cwd: string): Snapshot => {
  const contents = new Map<string, Buffer>()
  for (const file of gitFiles(cwd, ["-co", "--exclude-standard"])) {
    try {
      contents.set(file, fs.readFileSync(path.join(cwd, file)))
    } catch {
      // listed but gone (deleted in the working tree)
    }
  }
  const paths = new Set(
    [...gitFiles(cwd, ["-c"]), ...gitFiles(cwd, ["-o"])].filter((f) => fs.existsSync(path.join(cwd, f)))
  )
  return { contents, paths }
}

/**
 * Undoes the agent's edits outside `keep`: first the files git saw (so `.gitignore` is back before
 * anything is listed again), then the paths that didn't exist before. Nothing that existed before
 * is deleted.
 */
const restoreOthers = (cwd: string, before: Snapshot, keep: string) => {
  for (const [file, content] of before.contents) {
    if (file === keep) continue
    const full = path.join(cwd, file)
    let now: Buffer | undefined
    try {
      now = fs.readFileSync(full)
    } catch {
      now = undefined
    }
    if (now === undefined || !now.equals(content)) {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content)
    }
  }
  for (const file of [...gitFiles(cwd, ["-c"]), ...gitFiles(cwd, ["-o"])]) {
    if (file !== keep && !before.paths.has(file)) fs.rmSync(path.join(cwd, file), { force: true })
  }
}

/** How much of an agent's output is kept, from the end: enough to say why it failed. */
const outputLimit = 4096

/**
 * Runs the agent in its own process group, so a timeout, or its end, stops everything it started
 * (review I3). Resolves with its exit code, or `"timeout"`, and the end of what it printed.
 */
const runAgent = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  timeoutSeconds: number
): Promise<{ readonly outcome: number | "timeout" | Error; readonly output: string }> =>
  new Promise((resolve) => {
    let output = ""
    const keep = (chunk: string) => {
      output = (output + chunk).slice(-outputLimit)
    }
    const windows = process.platform === "win32"
    // Windows: npm installs agents as .cmd shims, which need a shell, with every part quoted, and
    // a single-line prompt (review I11)
    const child = windows
      ? spawn(
        [command, ...args].map((part) => `"${part.replace(/\n/g, " ").replace(/"/g, "\\\"")}"`).join(" "),
        { cwd, stdio: ["ignore", "pipe", "pipe"], shell: true }
      )
      : spawn(command, [...args], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout?.on("data", keep)
    child.stderr?.on("data", keep)
    const stopTree = () => {
      if (child.pid === undefined) return
      if (windows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
      else {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {
          // already gone
        }
      }
    }
    let timedOut = false
    const timer = timeoutSeconds > 0
      ? setTimeout(() => {
        timedOut = true
        stopTree()
      }, timeoutSeconds * 1000)
      : undefined
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ outcome: error, output })
    })
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.on("exit", (code) => {
      clearTimeout(timer)
      // whatever it left running in the background must not edit files after we verify
      stopTree()
      const done = () => {
        // a process that escaped the group may still hold the pipes: let go of them (review I1)
        child.stdout?.destroy()
        child.stderr?.destroy()
        resolve({ outcome: timedOut ? "timeout" : code ?? 1, output })
      }
      // the last output can still be in flight when `exit` fires: wait briefly for `close`
      const grace = setTimeout(done, 1000)
      child.once("close", () => {
        clearTimeout(grace)
        done()
      })
    })
  })

/**
 * @since 4.0.0
 * @category models
 */
export interface AiTarget {
  /** Project-relative path of the converted `.efx` file. */
  readonly file: string
  /** The mechanical pass's "stays TypeScript" notes, with line numbers. */
  readonly notes: ReadonlyArray<string>
}

const prompt = (target: AiTarget, skill: string) =>
  [
    `Convert the TypeScript left in ${target.file} to idiomatic EffectScript.`,
    `Follow the EffectScript skill in ${path.join(skill, "SKILL.md")} and its references.`,
    "The mechanical converter left these parts as TypeScript (line numbers are from before the conversion):",
    ...target.notes.map((note) => `- ${note}`),
    `Edit only ${target.file}. Keep its behaviour and its exports exactly the same.`,
    "Don't run commands; the converter verifies the project after your edit and reverts it if it fails."
  ].join("\n")

/** Where the agent can read the skill: inside the git directory, so it stays out of `git status`. */
const skillDirectory = (cwd: string): string => {
  const gitDir = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd, encoding: "utf8" }).stdout.trim()
  return path.join(gitDir, "effectscript-skill")
}

const read = (file: string): Buffer | undefined => {
  try {
    return fs.readFileSync(file)
  } catch {
    return undefined
  }
}

/**
 * Runs the agent on each target and keeps each edit only when it compiles and `verify` passes
 * (`verify` returns a failure description, or `undefined`).
 *
 * @since 4.0.0
 * @category convert
 */
export const aiPass = async (
  cwd: string,
  targets: ReadonlyArray<AiTarget>,
  agent: Agent,
  verify: (() => string | undefined) | undefined,
  timeoutSeconds: number,
  io: { readonly out: (line: string) => void; readonly err: (line: string) => void }
): Promise<{ readonly kept: number; readonly reverted: number }> => {
  const skill = skillDirectory(cwd)
  let kept = 0
  let reverted = 0
  try {
    writeSkill(skill, skillFiles())
    for (const target of targets) {
      const full = path.join(cwd, target.file)
      const before = snapshot(cwd)
      const original = fs.readFileSync(full)
      const args = agent.args(prompt(target, skill), skill)
      io.out(`AI pass: ${agent.command} ${args.filter((a) => !a.includes("\n")).join(" ")} (${target.file})`)
      const { outcome, output } = await runAgent(agent.command, args, cwd, timeoutSeconds)
      restoreOthers(cwd, before, target.file)
      const edited = read(full)
      let problem: string | undefined = outcome === "timeout"
        ? `${agent.command} timed out after ${timeoutSeconds}s`
        : outcome instanceof Error
        ? outcome.message
        : outcome !== 0
        ? `${agent.command} exited with ${outcome}`
        : edited === undefined
        ? `${agent.command} removed the file`
        : edited.equals(original)
        ? "no change"
        : undefined
      if (problem === undefined) {
        const errors = toTypeScript(edited!.toString("utf8"), { filename: target.file }).diagnostics
          .filter((d) => d.severity === "error")
        if (errors.length > 0) problem = `it doesn't compile: ${errors[0]!.code} ${errors[0]!.message}`
      }
      if (problem === undefined && verify !== undefined) problem = verify()
      if (problem === undefined) {
        kept++
        io.out(`kept the AI edit of ${target.file}`)
        continue
      }
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, original)
      if (problem !== "no change") {
        reverted++
        io.out(`reverted the AI edit of ${target.file}: ${problem.split("\n")[0]}`)
        // when the agent itself failed, its last words usually say why (a quota, a login, a flag)
        if (outcome !== 0) {
          const last = output.trim().split(/\r?\n/).slice(-10)
          if (last.length > 0 && last[0] !== "") {
            io.out(`  ${agent.command} said:`)
            for (const line of last) io.out(`    ${line}`)
          }
        }
      }
    }
  } catch (error) {
    io.err(`efx convert --ai stopped: ${(error as Error).message}`)
  } finally {
    fs.rmSync(skill, { recursive: true, force: true })
  }
  return { kept, reverted }
}
