import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<string, UserNotFound>
  all(): Effect.Effect<ReadonlyArray<string>>
}>()("fixtures/layer/for/Users") {
  static readonly find = (id: string) => Users.use((_) => _.find(id))
  static readonly all = () => Users.use((_) => _.all())
}

declare const rows: Map<string, string>

// a layer for a service declared anywhere: the live one, with a helper and a scope
export const UsersLive = Layer.effect(Users, Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Effect.log("users released"))
  const lookup = Effect.fn("Users.lookup")(function*(id: string) {
    return rows.get(id) ?? (yield* new UserNotFound({ id }))
  })
  return Users.of({
    find: Effect.fn("Users.find")(function*(id) {
      return yield* lookup(id)
    }),
    all: Effect.fnUntraced(function*() { return [...rows.values()] })
  })
}))

// and a test one, from a plain object
export const UsersTest = Layer.succeed(Users, Users.of({
  find: Effect.fnUntraced(function*(id) { return `user-${id}` }),
  all: Effect.fnUntraced(function*() { return [] })
}))
