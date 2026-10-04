import * as Effect from "effect/Effect"
export class Counter {
  #count = 0

  bump(by: number): Effect.Effect<number> {
    return Effect.gen({ self: this }, function*() {
      this.#count += by
      yield* Effect.log(`count is ${this.#count}`)
      return this.#count
    }).pipe(Effect.withSpan("Counter.bump"))
  }

  reset() {
    return Effect.gen(function*() {
      yield* Effect.sleep("1 millis")
    }).pipe(Effect.withSpan("Counter.reset"))
  }
}
