/**
 * The `efx` command (adoption-slice subset: `build`, `check`, `run`).
 *
 * @since 4.0.0
 */
import { build } from "./build.ts"
import { check } from "./check.ts"
import { run } from "./run.ts"

const usage = "usage: efx <build [-p tsconfig.json] | check [tsc args…] | run <file> [args…]>\n"

/**
 * Runs `efx` with `args` (without the node/script prefix) and returns the exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const main = (args: ReadonlyArray<string>): number => {
  const [command, ...rest] = args
  switch (command) {
    case "build": {
      const flag = rest.findIndex((arg) => arg === "-p" || arg === "--project")
      const project = flag === -1 ? "tsconfig.json" : rest[flag + 1] ?? "tsconfig.json"
      const result = build({ project })
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
