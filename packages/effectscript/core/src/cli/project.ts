/**
 * The engines behind `efx build` and the CLI version: plain functions the `.efx` command modules
 * call (ADR-0032).
 *
 * @since 4.0.0
 */
import { readFileSync } from "node:fs"
import { loadTypeScript } from "./typescript.ts"

/**
 * The `effectscript` package version.
 *
 * @since 4.0.0
 * @category cli
 */
export const version: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version

/**
 * `efx build`: loads TypeScript 6 lazily (everything else works without it, review I7) and builds
 * the project. Returns the exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const buildProject = async (project: string): Promise<number> => {
  const ts = await loadTypeScript(process.cwd())
  if (typeof ts === "string") {
    process.stderr.write(`${ts}\n`)
    return 1
  }
  const { build } = await import("./build.ts")
  const result = build(ts, { project })
  for (const error of result.errors) process.stderr.write(`${error}\n\n`)
  return result.ok ? 0 : 1
}
