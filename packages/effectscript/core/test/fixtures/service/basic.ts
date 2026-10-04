import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}

class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

declare const SqlLive: Layer.Layer<never>

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
  list(): Effect.Effect<ReadonlyArray<User>>
  readonly size: number

}>()("fixtures/service/basic/Users") {
  static readonly layer = Layer.effect(Users, Effect.gen(function*() {
    const cache = new Map<string, User>()
    yield* Effect.addFinalizer(() => Effect.log("users layer released"))
    return Users.of({
      size: 0,
      find: Effect.fn("Users.find")(function*(id: string) {
        return cache.get(id) ?? (yield* new UserNotFound({ id }))
      }),
      list: Effect.fnUntraced(function*() { return [...cache.values()] })
    })
  })).pipe(Layer.provide(SqlLive))

  static readonly layerTest = Layer.succeed(Users, Users.of({
    size: 1,
    find: Effect.fnUntraced(function*(id: string) { return new User({ id, name: "Test" }) }),
    list: Effect.fnUntraced(function*() { return [] })
  }))
  static readonly find = (id: string) => Users.use((_) => _.find(id))
  static readonly list = () => Users.use((_) => _.list())
}

export const firstName = Effect.fn("firstName")(function*(id: string) {
  const user = yield* Users.find(id)
  return user.name
})
