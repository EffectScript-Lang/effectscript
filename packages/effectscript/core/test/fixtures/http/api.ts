import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
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
