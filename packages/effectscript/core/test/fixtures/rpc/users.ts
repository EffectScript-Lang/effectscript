import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}) {}

export const UsersRpc = RpcGroup.make(
  Rpc.make("getUser", { payload: { id: Schema.String }, success: User, error: UserNotFound }),
  Rpc.make("rename", { payload: { id: Schema.String, name: Schema.String }, success: User, error: Schema.Union([UserNotFound, Forbidden]) }),
  Rpc.make("ping"),
  Rpc.make("watch", { payload: { id: Schema.String, limit: Schema.optionalKey(Schema.Number) }, success: Schema.String, stream: true })
)

export const UsersLive = UsersRpc.toLayer(Effect.gen(function*() {
  const users = new Map([["1", new User({ id: "1", name: "Ada" })]])
  return UsersRpc.of({
    getUser: Effect.fnUntraced(function*({ id }) { return users.get(id) ?? (yield* new UserNotFound({ id })) }),
    rename: Effect.fn("UsersRpc.rename")(function*({ id, name }) {
      if (id === "0") return yield* new Forbidden()
      const user = users.get(id) ?? (yield* new UserNotFound({ id }))
      return new User({ id: user.id, name })
    }),
    ping: Effect.fnUntraced(function*() {}),
    watch: ({ id }) => Stream.make(`${id}:a`, `${id}:b`)
  })
}))
