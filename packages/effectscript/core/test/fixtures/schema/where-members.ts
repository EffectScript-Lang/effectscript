import * as Schema from "effect/Schema"
export const Point = Schema.Struct({ x: Schema.Number.check(Schema.isFinite()), y: Schema.Number.check(Schema.isFinite()) })
export type Point = typeof Point.Type

export class Address extends Schema.Class<Address>("Address")({
  geo: Schema.Struct({ lat: Schema.Number.check(Schema.isBetween({ minimum: -90, maximum: 90 })), lng: Schema.Number })
}) {}

export class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number.check(Schema.isGreaterThan(0)) }) {}
export class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThan(0))) }) {}
export const Shape = Schema.Union([Circle, Square])
export type Shape = typeof Shape.Type
