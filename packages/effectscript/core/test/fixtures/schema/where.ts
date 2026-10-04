import { Schema } from "effect"
export class Signup extends Schema.Class<Signup>("Signup")({
  email: Schema.String.check(Schema.isPattern(/^[^@\s]+@[^@\s]+$/)),
  name: Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty()),
  nickname: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(20))),
  referrer: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  manager: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
  age: Schema.Int.check(Schema.isGreaterThan(17), Schema.isLessThan(150)),
  joinedAt: Schema.DateTimeUtcFromString
}) {}

export class TooYoung extends Schema.TaggedError<TooYoung>()("TooYoung", { age: Schema.Int.check(Schema.isLessThanOrEqualTo(17)) }) {}

export const Percent = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
export type Percent = typeof Percent.Type

const Note = Schema.NullOr(Schema.String.check(Schema.isMaxLength(280)))
type Note = typeof Note.Type
