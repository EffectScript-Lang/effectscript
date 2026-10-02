/**
 * `efx run [--runtime node|bun] <file> [args…]`: run a `.efx`/`.ts` entry on Node with
 * `effectscript/register` (ADR-0021), or on Bun with the EffectScript preload (ADR-0034).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { cacheDir, standalone, type StandaloneHost, unpack } from "./host.ts"

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
export const installedInProject = (cwd: string, name: string): boolean => projectWith(cwd, name) !== undefined

/** The nearest directory from `cwd` up whose `node_modules` holds `name`. */
const projectWith = (cwd: string, name: string): string | undefined => {
  for (let dir = path.resolve(cwd);; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules", name, "package.json"))) return dir
    if (path.dirname(dir) === dir) return undefined
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
  const host = standalone()
  if (host !== undefined) return runStandalone(host, file, rest, runtime)
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
  return exitStatus(result)
}

/** A child's exit code; a child killed by a signal exits like a shell reports it: 128 + its number. */
const exitStatus = (result: { readonly status: number | null; readonly signal: NodeJS.Signals | null }): number =>
  result.signal !== null ? 128 + (os.constants.signals[result.signal] ?? 0) : result.status ?? 1

/**
 * `efx run` in the standalone binary (ADR-0037). By default it runs the entry on the binary's own
 * Bun (`BUN_BE_BUN=1`) with the unpacked preload; `main` targets Bun when the project has
 * `@effect/platform-bun`, Node's platform otherwise. `--runtime node` needs Node on PATH and
 * `effectscript` installed in the project, for `effectscript/register`.
 */
const runStandalone = (
  host: StandaloneHost,
  file: string,
  rest: ReadonlyArray<string>,
  runtime: "node" | "bun" | undefined
): number => {
  const entry = path.resolve(file)
  const project = path.dirname(entry)
  if (runtime === "node") {
    // only the project's own install: `require.resolve` alone would also search NODE_PATH
    const root = projectWith(project, "effectscript")
    if (root === undefined) {
      process.stderr.write(
        "efx run --runtime node needs effectscript installed in the project (npm i -D effectscript); " +
          "without it, efx runs the file on its built-in Bun\n"
      )
      return 1
    }
    const register = createRequire(path.join(root, "package.json")).resolve("effectscript/register")
    const result = spawnSync("node", ["--import", pathToFileURL(register).href, file, ...rest], { stdio: "inherit" })
    if (result.error !== undefined) {
      process.stderr.write(`efx run --runtime node needs Node on your PATH: ${result.error.message}\n`)
      return 1
    }
    return exitStatus(result)
  }
  const preload = unpack(cacheDir(process.env, process.platform, os.homedir()), "bun-preload", host.preload)
  const result = spawnSync(process.execPath, ["--preload", preload, entry, ...rest], {
    stdio: "inherit",
    env: {
      ...process.env,
      BUN_BE_BUN: "1",
      EFFECTSCRIPT_MAIN_RUNTIME: installedInProject(project, "@effect/platform-bun") ? "bun" : "node"
    }
  })
  if (result.error !== undefined) {
    process.stderr.write(`efx run: ${result.error.message}\n`)
    return 1
  }
  return exitStatus(result)
}
