import * as Schema from "effect/Schema"
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.optionalKey(Schema.String),
  tags: Schema.Array(Schema.String),
  role: Schema.Literals(["admin", "member"]),
  manager: Schema.NullOr(UserId),
  age: Schema.Int.check(Schema.isGreaterThan(0))
}) {
  get label() {
    return `${this.name} <${this.email ?? "?"}>`
  }
}

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
export type Point = typeof Point.Type

export class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
export class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
export const Shape = Schema.Union([Circle, Square])
export type Shape = typeof Shape.Type

class Event extends Schema.TaggedClass<Event>()("Event", {
  at: Schema.Date,
  payload: Schema.Record(Schema.String, Schema.Unknown)
}) {}
