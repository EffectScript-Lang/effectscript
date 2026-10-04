/**
 * Which of Effect's exports produce a `Pipeable` (ADR-0091 A1), read from the generated
 * `pipeableExports` table. The forward and reverse compilers ask the same question, so a pipeline
 * whose head is one of these compiles to `.pipe(…)` and converts back to `|>`.
 *
 * @since 4.0.0
 */
import { pipeableExports } from "./tables.ts"

let parsed: Map<string, Map<string, string>> | undefined

const specOf = (module: string, name: string): string | undefined => {
  if (parsed === undefined) {
    parsed = new Map()
    for (const [m, entries] of pipeableExports) {
      parsed.set(
        m,
        new Map(
          entries.split(" ").map((entry) => {
            const colon = entry.lastIndexOf(":")
            return [entry.slice(0, colon), entry.slice(colon + 1)]
          })
        )
      )
    }
  }
  return parsed.get(module)?.get(name)
}

/**
 * Whether `Module.name`, as a value, is a `Pipeable` (`Schema.String`, `Effect.void`).
 *
 * @since 4.0.0
 * @category pipeable
 */
export const pipeableValue = (module: string, name: string): boolean => specOf(module, name)?.includes("v") === true

/**
 * Whether `Module.name(…)` with `args` arguments returns a `Pipeable` for every signature that
 * accepts that many (`Stream.make(1, 2)`, `Option.map(o, f)`, but not the data-last `Option.map(f)`).
 *
 * @since 4.0.0
 * @category pipeable
 */
export const pipeableCall = (module: string, name: string, args: number): boolean =>
  specOf(module, name)?.includes(String(Math.min(args, 9))) === true
