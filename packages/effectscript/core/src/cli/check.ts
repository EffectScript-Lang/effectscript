/**
 * `efx check [tsc args…]`: delegates to `efx-tsc` from `@effectscript/language` (ADR-0019).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import * as path from "node:path"
import { standalone } from "./host.ts"

/**
 * @since 4.0.0
 * @category cli
 */
export const check = (args: ReadonlyArray<string>): number => runCheck(args, false).status

/**
 * `efx check` with its output captured (`quiet`) for `efx convert`'s verification.
 *
 * @since 4.0.0
 * @category cli
 */
export const runCheck = (
  args: ReadonlyArray<string>,
  quiet: boolean
): { readonly status: number; readonly output: string } => {
  const bin = languageBin()
  if (bin === undefined) {
    const message = "efx check needs @effectscript/language: npm i -D @effectscript/language typescript@6\n"
    if (!quiet) process.stderr.write(message)
    return { status: 1, output: message }
  }
  // `efx check` never writes files (review I2)
  const noEmit = args.includes("--noEmit") ? [] : ["--noEmit"]
  // the standalone binary runs the checker on its own Bun (ADR-0037)
  const result = spawnSync(process.execPath, [bin, ...args, ...noEmit], {
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
    ...(standalone() === undefined ? {} : { env: { ...process.env, BUN_BE_BUN: "1" } })
  })
  return { status: result.status ?? 1, output: quiet ? `${result.stdout}${result.stderr}` : "" }
}

/**
 * `efx-tsc` from `@effectscript/language`, resolved from the project, then from `efx` itself.
 *
 * @since 4.0.0
 * @category cli
 */
export const languageBin = (cwd: string = process.cwd(), fromSelf = true): string | undefined => {
  for (const base of [path.join(cwd, "package.json"), ...(fromSelf ? [import.meta.url] : [])]) {
    try {
      return path.join(
        path.dirname(createRequire(base).resolve("@effectscript/language/package.json")),
        "bin/efx-tsc.js"
      )
    } catch {
      // try the next location
    }
  }
  return undefined
}
