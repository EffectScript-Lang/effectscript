/**
 * `efx skill`: installs the EffectScript agent skill (spec §8, ADR-0051). By default it goes into
 * the project's `.claude/skills/effectscript/`; `--global` uses `~/.claude/skills/effectscript/`
 * and `--dir` any directory. `efx setup` (Plan 10b) adds the other agents' locations.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { standalone } from "./host.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface SkillOptions {
  readonly cwd: string
  readonly home: string
  readonly global: boolean
  readonly dir: string | undefined
  readonly force: boolean
}

/**
 * The skill's files (`[relative path, content]`): embedded in the standalone binary, otherwise
 * read from the package's `skills/effectscript`.
 *
 * @since 4.0.0
 * @category skill
 */
export const skillFiles = (): ReadonlyArray<readonly [string, string]> => {
  const embedded = standalone()?.skill
  if (embedded !== undefined) return embedded
  const root = fileURLToPath(new URL("../../skills/effectscript/", import.meta.url))
  const files: Array<readonly [string, string]> = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push([path.relative(root, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8")])
    }
  }
  walk(root)
  return files
}

/**
 * Whether `dir` holds an EffectScript skill (its `SKILL.md` is ours).
 *
 * @since 4.0.0
 * @category skill
 */
export const isEffectScriptSkill = (dir: string): boolean => {
  try {
    return /^name:\s*effectscript\s*$/m.test(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"))
  } catch {
    return false
  }
}

/** What an install wrote, so the next one removes only its own files (review I3). */
const manifest = ".efx-skill.json"

const installed = (dir: string): ReadonlyArray<string> => {
  try {
    const files: unknown = JSON.parse(fs.readFileSync(path.join(dir, manifest), "utf8")).files
    return Array.isArray(files) ? files.filter((f): f is string => typeof f === "string") : []
  } catch {
    return []
  }
}

/**
 * Writes the skill into `dir`: removes the files a previous install wrote that the new version no
 * longer has, writes the new ones, and records them. Nothing else in `dir` is touched.
 *
 * @since 4.0.0
 * @category skill
 */
export const writeSkill = (dir: string, files: ReadonlyArray<readonly [string, string]>): void => {
  const root = path.resolve(dir)
  const inside = (file: string) => {
    const full = path.resolve(root, file)
    return full.startsWith(`${root}${path.sep}`) ? full : undefined
  }
  const next = new Set(files.map(([file]) => file))
  for (const file of installed(root)) {
    const full = inside(file)
    if (full !== undefined && !next.has(file)) fs.rmSync(full, { force: true })
  }
  for (const [file, content] of files) {
    const full = inside(file)
    if (full === undefined) continue
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  fs.writeFileSync(path.join(root, manifest), `${JSON.stringify({ files: [...next] }, null, 2)}\n`)
}

/** Why `target` must never receive the skill (the project, home, their ancestors, a repository). */
const unsafe = (target: string, options: SkillOptions): string | undefined => {
  const within = (child: string) => child === target || child.startsWith(`${target}${path.sep}`)
  if (within(path.resolve(options.cwd))) return "it is the working directory or one of its parents"
  if (within(path.resolve(options.home))) return "it is the home directory or one of its parents"
  if (fs.existsSync(path.join(target, ".git"))) return "it is a git repository"
  return undefined
}

/**
 * Installs the skill. Returns the exit code.
 *
 * @since 4.0.0
 * @category skill
 */
export const installSkill = (
  options: SkillOptions,
  out: (line: string) => void,
  err: (line: string) => void
): number => {
  if (options.global && options.dir !== undefined) {
    err("efx skill: --global and --dir both choose where to install; pass one")
    return 1
  }
  const target = options.dir !== undefined
    ? path.resolve(options.cwd, options.dir)
    : path.join(options.global ? options.home : options.cwd, ".claude", "skills", "effectscript")
  const why = unsafe(target, options)
  if (why !== undefined) {
    err(`efx won't install the skill into ${target}: ${why}`)
    return 1
  }
  if (fs.existsSync(path.join(target, "SKILL.md")) && !isEffectScriptSkill(target) && !options.force) {
    err(`${target} holds another skill: pass --force to write the EffectScript skill's files there anyway`)
    return 1
  }
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    err(`${target} is a file`)
    return 1
  }
  writeSkill(target, skillFiles())
  out(`Installed the EffectScript skill in ${target}`)
  return 0
}
