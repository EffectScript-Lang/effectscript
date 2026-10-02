/**
 * `effectscript/doctest`: runtime helpers for doctests (ADR-0042). Compiled `efx` examples call
 * these; they are not meant for hand-written tests.
 *
 * @since 4.0.0
 */
import * as assert from "node:assert"
import { isDeepStrictEqual, inspect } from "node:util"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"

/**
 * Passes when `Equal.equals` or deep strict equality holds; otherwise fails with a diff.
 *
 * @since 4.0.0
 * @category assertions
 */
export const assertDoc = (actual: unknown, expected: unknown): void => {
  if (Equal.equals(actual, expected) || isDeepStrictEqual(actual, expected)) return
  assert.deepStrictEqual(actual, expected)
  assert.fail(`expected ${inspect(expected)}, got ${inspect(actual)}`)
}

/**
 * Runs `self` and passes when it fails with an error whose `_tag` is `tag`.
 *
 * @since 4.0.0
 * @category assertions
 */
export const failsWith = <A, E, R>(self: Effect.Effect<A, E, R>, tag: string): Effect.Effect<void, never, R> =>
  Effect.flatMap(Effect.exit(self), (exit) =>
    Effect.sync(() => {
      if (Exit.isSuccess(exit)) {
        assert.fail(`expected a failure with ${tag}, but the effect succeeded with ${inspect(exit.value)}`)
      }
      const error = Cause.findError(exit.cause)
      if (Result.isFailure(error)) assert.fail(`expected a failure with ${tag}, but the effect died:\n${Cause.pretty(exit.cause)}`)
      const actual = (error.success as { readonly _tag?: unknown } | null)?._tag
      if (actual !== tag) assert.fail(`expected a failure with ${tag}, but it failed with ${typeof actual === "string" ? actual : inspect(error.success)}`)
    }))

/**
 * Runs `self` and passes when it dies with a defect (a bug, never a typed failure).
 *
 * @since 4.0.0
 * @category assertions
 */
export const dies = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<void, never, R> =>
  Effect.flatMap(Effect.exit(self), (exit) =>
    Effect.sync(() => {
      if (Exit.isSuccess(exit)) assert.fail(`expected a defect, but the effect succeeded with ${inspect(exit.value)}`)
      const error = Cause.findError(exit.cause)
      if (Result.isSuccess(error)) {
        const tag = (error.success as { readonly _tag?: unknown } | null)?._tag
        assert.fail(`expected a defect, but it failed with ${typeof tag === "string" ? tag : inspect(error.success)}`)
      }
    }))
