import { Match, Schema } from "effect"
class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const strict: boolean

export const size = Match.value(shape).pipe(
  Match.when((c): c is Extract<typeof c, { readonly _tag: "Circle" }> & { readonly "~effectscript/guard": true } => c._tag === "Circle" && c.radius > 10, (c) => `big circle ${c.radius}`),
  Match.tag("Circle", ({ radius }) => `circle ${radius}`),
  Match.when((_): _ is Extract<typeof _, { readonly _tag: "Square" }> & { readonly "~effectscript/guard": true } => _._tag === "Square" && (({ side }) => side === 0)(_), ({ side }) => "dot"),
  Match.tag("Square", () => "square"),
  Match.exhaustive
)

export const label = Match.value(status).pipe(
  Match.when((_) => _ === "banned" && strict, () => "✗"),
  Match.orElse(() => "?")
)
