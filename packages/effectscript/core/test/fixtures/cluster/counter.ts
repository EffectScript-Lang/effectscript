import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Entity from "effect/cluster/Entity"
import * as Rpc from "effect/rpc/Rpc"
export class TooLarge extends Schema.TaggedError<TooLarge>()("TooLarge", { by: Schema.Number }) {}

export const Counter = Entity.make("Counter", [
  Rpc.make("increment", { payload: { by: Schema.Number }, success: Schema.Number, error: TooLarge }),
  Rpc.make("current", { success: Schema.Number })
])

// the body runs once per entity: `count` is that entity's state
export const CounterLive = Counter.toLayer(Effect.gen(function*() {
  let count = 0
  return Counter.of({
    increment: Effect.fn("Counter.increment")(function*({ payload }) {
      if (payload.by > 100) return yield* new TooLarge({ by: payload.by })
      count += payload.by
      return count
    }),
    current: Effect.fnUntraced(function*() { return count })
  })
}))
