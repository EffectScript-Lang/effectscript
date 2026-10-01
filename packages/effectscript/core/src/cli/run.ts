/**
 * `efx run <file> [args…]`: run a `.efx`/`.ts` entry on Node with `effectscript/register`
 * (ADR-0021).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

/**
 * @since 4.0.0
 * @category cli
 */
export const run = (args: ReadonlyArray<string>): number => {
  const [file, ...rest] = args
  if (file === undefined) {
    process.stderr.write("usage: efx run <file> [args…]\n")
    return 1
  }
  const register = fileURLToPath(
    new URL(`../register.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url)
  )
  const result = spawnSync(process.execPath, ["--import", register, file, ...rest], { stdio: "inherit" })
  return result.status ?? 1
}
