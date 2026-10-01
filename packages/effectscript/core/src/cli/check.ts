/**
 * `efx check [tsc args…]`: delegates to `efx-tsc` from `@effectscript/language` (ADR-0019).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import * as path from "node:path"

/**
 * @since 4.0.0
 * @category cli
 */
export const check = (args: ReadonlyArray<string>): number => {
  let packageJson: string | undefined
  for (const base of [path.join(process.cwd(), "package.json"), import.meta.url]) {
    try {
      packageJson = createRequire(base).resolve("@effectscript/language/package.json")
      break
    } catch {
      // try the next location
    }
  }
  if (packageJson === undefined) {
    process.stderr.write("efx check needs @effectscript/language: npm i -D @effectscript/language typescript@6\n")
    return 1
  }
  const bin = path.join(path.dirname(packageJson), "bin/efx-tsc.js")
  return spawnSync(process.execPath, [bin, ...(args.length > 0 ? args : ["--noEmit"])], { stdio: "inherit" }).status ??
    1
}
