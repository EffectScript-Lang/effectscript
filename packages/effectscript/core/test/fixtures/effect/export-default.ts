import { Effect } from "effect"
declare const task: Effect.Effect<number>

const main = Effect.fn("main")(function*() {
  return yield* task
})
export default main
