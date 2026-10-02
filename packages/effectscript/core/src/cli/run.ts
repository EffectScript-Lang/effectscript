/**
 * `efx run [--runtime node|bun] <file> [args…]`: run a `.efx`/`.ts` entry on Node with
 * `effectscript/register` (ADR-0021), or on Bun with the EffectScript preload (ADR-0034).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const sibling = (name: string): string =>
  fileURLToPath(new URL(`../${name}.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url))

/**
 * Whether `bun` is on PATH.
 *
 * @since 4.0.0
 * @category cli
 */
export const hasBun = (): boolean => spawnSync("bun", ["--version"]).status === 0

/**
 * The runtime `efx run` uses (ADR-0034): Bun when it is installed and the project can run `main`
 * on it (`@effect/platform-bun` resolves), Node otherwise.
 *
 * @since 4.0.0
 * @category cli
 */
export const defaultRuntime = (cwd: string): "node" | "bun" =>
  hasBun() && installedInProject(cwd, "@effect/platform-bun") ? "bun" : "node"

/**
 * Whether `name` is installed in a `node_modules` of `cwd` or a parent. Unlike `require.resolve`,
 * it ignores `NODE_PATH` (package managers set it for scripts).
 *
 * @since 4.0.0
 * @category cli
 */
export const installedInProject = (cwd: string, name: string): boolean => {
  for (let dir = path.resolve(cwd);; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules", name, "package.json"))) return true
    if (path.dirname(dir) === dir) return false
  }
}

/**
 * @since 4.0.0
 * @category cli
 */
export const run = (args: ReadonlyArray<string>, runtime?: "node" | "bun"): number => {
  const [file, ...rest] = args
  if (file === undefined) {
    process.stderr.write("usage: efx run [--runtime node|bun] <file> [args…]\n")
    return 1
  }
  // the project is the entry file's, not the working directory's
  const bun = (runtime ?? defaultRuntime(path.dirname(path.resolve(file)))) === "bun"
  const result = bun
    ? spawnSync("bun", ["--preload", sibling("bun-preload"), path.resolve(file), ...rest], { stdio: "inherit" })
    : spawnSync(process.execPath, ["--import", sibling("register"), file, ...rest], { stdio: "inherit" })
  if (result.error !== undefined) {
    process.stderr.write(
      bun
        ? `efx run --runtime bun needs Bun on your PATH (https://bun.sh): ${result.error.message}\n`
        : `efx run: ${result.error.message}\n`
    )
    return 1
  }
  // a child killed by a signal exits like a shell would report it: 128 + the signal number
  if (result.signal !== null) return 128 + (os.constants.signals[result.signal] ?? 0)
  return result.status ?? 1
}
