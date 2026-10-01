/**
 * The `efx` command (adoption-slice subset: `build`, `check`, `run`).
 *
 * @since 4.0.0
 */
import { check } from "./check.ts"
import { run } from "./run.ts"
import { loadTypeScript } from "./typescript.ts"

const usage = "usage: efx <build [-p tsconfig.json] | check [tsc args…] | run <file> [args…]>\n"

/**
 * Runs `efx` with `args` (without the node/script prefix) and returns the exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const main = async (args: ReadonlyArray<string>): Promise<number> => {
  const [command, ...rest] = args
  switch (command) {
    case "build": {
      const ts = await loadTypeScript(process.cwd())
      if (typeof ts === "string") {
        process.stderr.write(`${ts}\n`)
        return 1
      }
      // loaded lazily: everything else in `efx` works without TypeScript (review I7)
      const { build } = await import("./build.ts")
      const flag = rest.findIndex((arg) => arg === "-p" || arg === "--project")
      const project = flag === -1 ? "tsconfig.json" : rest[flag + 1] ?? "tsconfig.json"
      const result = build(ts, { project })
      for (const error of result.errors) process.stderr.write(`${error}\n\n`)
      return result.ok ? 0 : 1
    }
    case "check":
      return check(rest)
    case "run":
      return run(rest)
    default:
      process.stderr.write(usage)
      return command === undefined || command === "--help" ? 0 : 1
  }
}
