/**
 * `efx convert --ai` (spec §7.5 step 4, ADR-0052): after the mechanical pass, the user's own
 * coding agent converts what was left as TypeScript, one file at a time. An edit is kept only if
 * the file still compiles and the project still verifies. Edits outside the file are undone.
 * Nothing leaves the machine except through the agent the user runs.
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
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
  readonly args: (prompt: string) => ReadonlyArray<string>
}

/**
 * The supported agents, in the order `--ai` picks them.
 *
 * @since 4.0.0
 * @category convert
 */
export const agents: ReadonlyArray<Agent> = [
  { id: "claude", command: "claude", args: (p) => ["-p", p, "--permission-mode", "acceptEdits"] },
  { id: "codex", command: "codex", args: (p) => ["exec", "--full-auto", p] },
  { id: "gemini", command: "gemini", args: (p) => ["-p", p, "--yolo"] },
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

/** Every file git sees (tracked and untracked, not ignored), with its content. */
const snapshot = (cwd: string): Map<string, Buffer> => {
  const listed = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd, encoding: "utf8" }).stdout
  const files = new Map<string, Buffer>()
  for (const file of listed.split("\0")) {
    if (file === "") continue
    try {
      files.set(file, fs.readFileSync(path.join(cwd, file)))
    } catch {
      // listed but gone (deleted in the working tree)
    }
  }
  return files
}

/** Puts every file except `keep` back as it was in `before`. */
const restoreOthers = (cwd: string, before: ReadonlyMap<string, Buffer>, keep: string) => {
  const after = snapshot(cwd)
  for (const [file, content] of before) {
    if (file === keep) continue
    const now = after.get(file)
    if (now === undefined || !now.equals(content)) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
      fs.writeFileSync(path.join(cwd, file), content)
    }
  }
  for (const file of after.keys()) {
    if (file !== keep && !before.has(file)) fs.rmSync(path.join(cwd, file), { force: true })
  }
}

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
    "The mechanical converter left these parts as TypeScript:",
    ...target.notes.map((note) => `- ${note}`),
    `Edit only ${target.file}. Keep its behaviour and its exports exactly the same.`,
    "Don't run commands; the converter verifies the project after your edit and reverts it if it fails."
  ].join("\n")

/**
 * Runs the agent on each target and keeps each edit only when it compiles and `verify` passes
 * (`verify` returns a failure description, or `undefined`).
 *
 * @since 4.0.0
 * @category convert
 */
export const aiPass = (
  cwd: string,
  targets: ReadonlyArray<AiTarget>,
  agent: Agent,
  verify: (() => string | undefined) | undefined,
  timeoutSeconds: number,
  io: { readonly out: (line: string) => void; readonly err: (line: string) => void }
): { readonly kept: number; readonly reverted: number } => {
  const skill = fs.mkdtempSync(path.join(os.tmpdir(), "efx-ai-skill-"))
  let kept = 0
  let reverted = 0
  try {
    writeSkill(skill, skillFiles())
    for (const target of targets) {
      const full = path.join(cwd, target.file)
      const before = snapshot(cwd)
      const original = fs.readFileSync(full)
      io.out(`AI pass: ${agent.command} on ${target.file} (${target.notes.length} part(s) left as TypeScript)`)
      const run = spawnSync(agent.command, [...agent.args(prompt(target, skill))], {
        cwd,
        encoding: "utf8",
        timeout: timeoutSeconds * 1000,
        killSignal: "SIGKILL",
        stdio: ["ignore", "pipe", "pipe"]
      })
      restoreOthers(cwd, before, target.file)
      const timedOut = run.error !== undefined && (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT"
      const edited = fs.readFileSync(full)
      let problem: string | undefined = timedOut
        ? `${agent.command} timed out after ${timeoutSeconds}s`
        : run.error !== undefined
        ? run.error.message
        : run.status !== 0
        ? `${agent.command} exited with ${run.status}`
        : edited.equals(original)
        ? "no change"
        : undefined
      if (problem === undefined) {
        const errors = toTypeScript(edited.toString("utf8"), { filename: target.file }).diagnostics
          .filter((d) => d.severity === "error")
        if (errors.length > 0) problem = `it doesn't compile: ${errors[0]!.code} ${errors[0]!.message}`
      }
      if (problem === undefined && verify !== undefined) problem = verify()
      if (problem === undefined) {
        kept++
        io.out(`kept the AI edit of ${target.file}`)
        continue
      }
      fs.writeFileSync(full, original)
      if (problem !== "no change") {
        reverted++
        io.out(`reverted the AI edit of ${target.file}: ${problem.split("\n")[0]}`)
      }
    }
  } finally {
    fs.rmSync(skill, { recursive: true, force: true })
  }
  return { kept, reverted }
}
