import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}
class DbError extends Schema.TaggedError<DbError>()("DbError", { cause: Schema.Defect() }) {}
class Timeout extends Schema.TaggedError<Timeout>()("RequestTimeout", {
  ms: Schema.Number
}) {
  get summary() { return `timed out after ${this.ms}ms` }
}

const find = Effect.fn("find")(function*(id: string): Effect.fn.Return<string, UserNotFound | DbError> {
  if (id === "") return yield* new UserNotFound({ id })
  if (id === "db") return yield* new DbError({ cause: new Error("down") })
  return id
})
