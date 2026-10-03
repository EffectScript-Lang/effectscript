/**
 * `efx check [tsc args…]`: delegates to `efx-tsc` from `@effectscript/language` (ADR-0019).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { standalone } from "./host.ts"
import { languageInstall } from "./project.ts"

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
    const message = `efx check needs @effectscript/language: ${languageInstall}\n`
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
 * A bin of `@effectscript/language` (default `efx-tsc`), resolved from the project, then from
 * `efx` itself.
 *
 * @since 4.0.0
 * @category cli
 */
export const languageBin = (
  cwd: string = process.cwd(),
  fromSelf = true,
  bin = "efx-tsc.js"
): string | undefined => {
  // the project's own install, found by walking up: `require.resolve` would also search NODE_PATH
  for (let dir = path.resolve(cwd);; dir = path.dirname(dir)) {
    const language = path.join(dir, "node_modules", "@effectscript", "language")
    if (fs.existsSync(path.join(language, "package.json"))) return path.join(language, "bin", bin)
    if (path.dirname(dir) === dir) break
  }
  if (!fromSelf) return undefined
  try {
    return path.join(
      path.dirname(createRequire(import.meta.url).resolve("@effectscript/language/package.json")),
      "bin",
      bin
    )
  } catch {
    return undefined
  }
}
