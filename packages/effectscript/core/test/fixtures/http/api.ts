import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/http-api/HttpApi"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

export class NewUser extends Schema.Class<NewUser>("NewUser")({
  name: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}) {}

export class UsersApi extends HttpApiGroup.make("users").add(
  HttpApiEndpoint.get("list", "/", { query: { search: Schema.optionalKey(Schema.String) }, success: Schema.Array(User) }),
  HttpApiEndpoint.get("getById", "/:id", { params: { id: Schema.String }, success: User, error: [UserNotFound, Forbidden] }),
  HttpApiEndpoint.post("create", "/", { payload: NewUser, success: User }),
  HttpApiEndpoint.delete("remove", "/:id", { params: { id: Schema.String } })
) {}

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Schema.String })
) {}

export class Api extends HttpApi.make("api").add(UsersApi, SystemApi) {}

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
}>()("fixtures/http/api/Users") {
  static readonly layer = Layer.succeed(Users, Users.of({
    find: Effect.fnUntraced(function*(id: string) { return id === "1" ? new User({ id, name: "Ada" }) : (yield* new UserNotFound({ id })) })
  }))
  static readonly find = (id: string) => Users.use((_) => _.find(id))
}

export const UsersHandlers = HttpApiBuilder.group(Api, "users", Effect.fn("Api.users")(function*(handlers) {
  const users = yield* Users
  return handlers.handleAll({
    list: ({ query }) => Effect.succeed([new User({ id: "0", name: query.search ?? "all" })]),
    getById: Effect.fn("Api.users.getById")(function*({ params }) {
      return yield* users.find(params.id)
    }),
    create: ({ payload }) => Effect.succeed(new User({ id: "2", name: payload.name })),
    remove: () => Effect.void
  })
})).pipe(Layer.provide(Users.layer))
