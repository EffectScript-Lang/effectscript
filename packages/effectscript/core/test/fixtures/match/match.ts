import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const scale: (n: number) => Effect.Effect<number>

export const area = Match.valueTags(shape, {
  Circle: ({ radius }) => Math.PI * radius ** 2,
  Square: ({ side }) => side ** 2
})

export const label = Match.value(status).pipe(Match.when("active", () => "✓"), Match.when("banned", () => "✗"), Match.orElse(() => "?"))

export const scaled = Effect.fn("scaled")(function*() {
  return (yield* Match.valueTags(shape, {
    Circle: (c) => Effect.gen(function*() { return yield* scale(c.radius) }),
    Square: () => Effect.gen(function*() { return 0 })
  }))
})
