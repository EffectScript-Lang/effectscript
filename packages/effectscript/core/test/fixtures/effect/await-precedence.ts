import * as Effect from "effect/Effect"
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<boolean>
declare const s: Effect.Effect<{ readonly length: number }>
declare const maybe: number | undefined

const precedence = Effect.fn("precedence")(function*() {
  const sum = (yield* a) + 1
  const not = !(yield* b)
  const cast = (yield* a) as number
  const member = (yield* s).length
  const call = String(yield* a)
  const nullish = maybe ?? (yield* a)
  const cond = (yield* b) ? 1 : 2
  return [sum, not, cast, member, call, nullish, cond]
})
