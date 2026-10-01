import { Console, Scope, Stream, Effect } from "effect"

declare const acquire: Effect.Effect<{ readonly close: Effect.Effect<void> }, never, Scope.Scope>

export const useResource = Effect.fn("useResource")(function*() {
  const handle = yield* acquire
  yield* Effect.addFinalizer(() => handle.close)
  yield* Effect.addFinalizer(() => Effect.sync(() => {
    globalThis.console.info("sync cleanup")
  }))
  return 1
}, Effect.scoped)

export const sum = Effect.fn("sum")(function*(numbers: Stream.Stream<number>) {
  let total = 0
  yield* Stream.runForEach(numbers, (n) => Effect.gen(function*() {
    if (n < 0) return
    total += n
  }))
  return total
})

export const block = Effect.scoped(Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Console.log("bye"))
  return 2
}))
