import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
class Exhausted extends Schema.TaggedError<Exhausted>()("Exhausted", { after: Schema.Number }) {}

export const countdown = (from: number): Stream.Stream<number> => Stream.callback((queue) => Effect.gen(function*() {
  for (let i = from; i > 0; i--) {
    yield* Queue.offer(queue, i)
    yield* Effect.sleep("10 millis")
  }
}).pipe(Queue.into(queue)), { bufferSize: 1 })

const naturals = (limit: number): Stream.Stream<number, Exhausted> => Stream.callback((queue) => Effect.gen(function*() {
  let n = 0
  while (true) {
    if (n === limit) return yield* new Exhausted({ after: n })
    yield* Queue.offer(queue, n++)
  }
}).pipe(Queue.into(queue)), { bufferSize: 1 })

// a plain generator is still JavaScript's
function* letters() {
  yield "a"
}
