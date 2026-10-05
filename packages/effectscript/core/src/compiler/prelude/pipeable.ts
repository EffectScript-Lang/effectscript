/**
 * Which of Effect's exports produce a `Pipeable` (ADR-0092 A1), read from the generated
 * `pipeableExports` table. The forward and reverse compilers ask the same question, so a pipeline
 * whose head is one of these compiles to `.pipe(…)` and converts back to `|>`.
 *
 * @since 4.0.0
 */
import { pipeableExports, pipeableSteps } from "./tables.ts"

const parse = (table: ReadonlyMap<string, string>): Map<string, Map<string, string>> =>
  new Map(
    [...table].map(([module, entries]) => [
      module,
      new Map(
        entries.split(" ").map((entry) => {
          const colon = entry.lastIndexOf(":")
          return [entry.slice(0, colon), entry.slice(colon + 1)]
        })
      )
    ])
  )

let exportsTable: Map<string, Map<string, string>> | undefined
let stepsTable: Map<string, Map<string, string>> | undefined

const specOf = (module: string, name: string): string | undefined =>
  (exportsTable ??= parse(pipeableExports)).get(module)?.get(name)

const stepSpecOf = (module: string, name: string): string | undefined =>
  (stepsTable ??= parse(pipeableSteps)).get(module)?.get(name)

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

/**
 * Whether `Module.name` is a step over a `Pipeable` (ADR-0092 A7): written as a value (`Effect.orDie`,
 * `args` undefined), or called with `args` arguments (`Effect.map(f)`). A pipeline whose first step is
 * one only type-checks on a `Pipeable`, so its head takes `.pipe(…)` whatever it is.
 *
 * @since 4.0.0
 * @category pipeable
 */
export const pipeableStep = (module: string, name: string, args: number | undefined): boolean =>
  stepSpecOf(module, name)?.includes(args === undefined ? "v" : String(Math.min(args, 9))) === true
