/**
 * The corpus's projects (ADR-0302): pinned in `corpus.json`, cloned without history outside the
 * repository, in `$EFFECTSCRIPT_CORPUS` (by default `~/.cache/effectscript/corpus`).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

/**
 * @since 4.0.0
 * @category models
 */
export interface Project {
  readonly name: string
  readonly url: string
  readonly branch: string
  readonly commit: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Manifest {
  readonly projects: ReadonlyArray<Project>
  readonly exclude: Record<string, { readonly globs: ReadonlyArray<string>; readonly reason: string }>
}

/**
 * Where the clones live.
 *
 * @since 4.0.0
 * @category projects
 */
export const cacheDir = (): string =>
  process.env.EFFECTSCRIPT_CORPUS ?? path.join(os.homedir(), ".cache", "effectscript", "corpus")

const git = (cwd: string | undefined, ...args: Array<string>): string => {
  const result = spawnSync("git", cwd === undefined ? args : ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28
  })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

const fetchAndCheckout = (dir: string, url: string, ref: string): string => {
  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(dir, { recursive: true })
    git(dir, "init", "-q")
    git(dir, "remote", "add", "origin", url)
  }
  git(dir, "fetch", "-q", "--depth", "1", "origin", ref)
  git(dir, "checkout", "-q", "--force", "FETCH_HEAD")
  return git(dir, "rev-parse", "HEAD")
}

/**
 * The project's clone at its pinned commit, fetched (without history) when it isn't there yet.
 *
 * @since 4.0.0
 * @category projects
 */
export const checkout = (project: Project): string => {
  const dir = path.join(cacheDir(), project.name)
  const head = fs.existsSync(path.join(dir, ".git")) ? git(dir, "rev-parse", "HEAD") : undefined
  if (head !== project.commit) fetchAndCheckout(dir, project.url, project.commit)
  return dir
}

/**
 * Moves the project to the tip of its branch, and returns the new commit.
 *
 * @since 4.0.0
 * @category projects
 */
export const update = (project: Project): string =>
  fetchAndCheckout(path.join(cacheDir(), project.name), project.url, project.branch)
