import { assert, describe, expect, it, layer } from "@effect/vitest"
import { Clock, Context, Effect, Layer } from "effect"
class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<string>
}>()("fixtures/test/Users") {
  static readonly layerTest = Layer.succeed(Users, Users.of({ find: Effect.fnUntraced(function*(id: string) { return `user-${id}` }) }))
  static readonly find = (id: string) => Users.use((_) => _.find(id))
}

describe("Users", () => {
  it.effect("finds a user", () => Effect.gen(function*() {
    const user = yield* Users.find("1")
    assert.strictEqual(user, "user-1")
  }).pipe(Effect.provide(Users.layerTest)))

  it.effect("scopes resources to the test", () => Effect.gen(function*() {
    const value = yield* Effect.acquireRelease(Effect.succeed(1), () => Effect.void)
    assert.strictEqual(value, 1)
  }))

  it.live("runs on the live clock", () => Effect.gen(function*() {
    expect(yield* Clock.currentTimeMillis).toBeGreaterThan(0)
  }))

  it.effect.skip("is skipped", () => Effect.gen(function*() {
    return yield* Effect.fail("never runs")
  }))
})

layer(Users.layerTest)("with a shared layer", (it) => {
  it.effect("provides the layer to every test", () => Effect.gen(function*() {
    expect(yield* Users.find("2")).toBe("user-2")
  }))
})
