import * as Effect from "effect/Effect"
declare const task: Effect.Effect<number>

const main = Effect.fn("main")(function*() {
  return yield* task
})
export default main
