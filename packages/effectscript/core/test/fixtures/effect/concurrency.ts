import * as Effect from "effect/Effect"
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<string>

const both = Effect.fn("both")(function*() {
  const [n, s] = yield* Effect.all([a, b], { concurrency: "unbounded" })
  const { x, y } = yield* Effect.all({ x: a, y: b }, { concurrency: "unbounded" })
  return `${n}${s}${x}${y}`
})
