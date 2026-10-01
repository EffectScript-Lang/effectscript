import { Effect } from "effect"
declare const task: Effect.Effect<number, string>

export const resilient = Effect.fn("resilient")(function*() {
  return yield* task
}, Effect.retry({ times: 2 }),
  Effect.orElseSucceed(() => 0))
