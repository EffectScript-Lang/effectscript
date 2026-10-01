import { Context, Effect, Layer } from "effect"
export class Users extends Context.Service<Users, {
  list(): Effect.Effect<Array<string>>
}>()("fixtures/layer/app/Users") {
  static readonly layer = Layer.succeed(Users, Users.of({ list: Effect.fnUntraced(function*() { return ["ada"] }) }))
  static readonly list = () => Users.use((_) => _.list())
}

export class Posts extends Context.Service<Posts, {
  count(): Effect.Effect<number>
}>()("fixtures/layer/app/Posts") {
  static readonly layer = Layer.succeed(Posts, Posts.of({ count: Effect.fnUntraced(function*() { return 1 }) }))
  static readonly count = () => Posts.use((_) => _.count())
}

export const AppLive = Layer.mergeAll(Users.layer, Posts.layer)

export const Provided = Layer.mergeAll(Users.layer, Posts.layer).pipe(Layer.provide(Posts.layer))

export const Worker = Layer.effectDiscard(Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Effect.log("worker stopped"))
  yield* Effect.log("worker started")
}))
