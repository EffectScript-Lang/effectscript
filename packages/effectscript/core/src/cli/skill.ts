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

/** Whether `dir` holds an EffectScript skill, so replacing it loses nothing of the user's. */
const isOurs = (dir: string): boolean => {
  try {
    return /^name:\s*effectscript\s*$/m.test(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"))
  } catch {
    return false
  }
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
  const target = options.dir !== undefined
    ? path.resolve(options.cwd, options.dir)
    : path.join(options.global ? options.home : options.cwd, ".claude", "skills", "effectscript")
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0 && !isOurs(target) && !options.force) {
    err(`${target} exists and isn't the EffectScript skill: pass --force to replace it`)
    return 1
  }
  fs.rmSync(target, { recursive: true, force: true })
  for (const [file, content] of skillFiles()) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true })
    fs.writeFileSync(path.join(target, file), content)
  }
  out(`Installed the EffectScript skill in ${target}`)
  return 0
}
