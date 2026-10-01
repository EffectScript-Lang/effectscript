import { Effect } from "effect"
declare const task: Effect.Effect<number>

/** Doubles the task result. */
export const doubled = Effect.fn("doubled")(function* /* inline */ (): Effect.fn.Return<number> {
  // leading comment
  const n = yield* /* why */ task
  return n * 2 // trailing
})
