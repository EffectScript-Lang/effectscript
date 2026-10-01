import { Effect, pipe } from "effect"
declare const getUserName: (id: string) => Effect.Effect<string, Error>

const loadUser = Effect.fn("loadUser")(function*(id: string) {
  return yield* getUserName(id)
})

const program = Effect.gen(function*() {
  return yield* loadUser("1")
}).pipe(Effect.retry({ times: 3 }), Effect.orElseSucceed(() => "anonymous"))

const viaLocal = loadUser("2").pipe(
  Effect.timeout("1 second"),
  Effect.orDie)

const viaPipe = pipe(getUserName("3"), Effect.map((name) => name.length))

const hack = Effect.map(getUserName("4"), (name) => name.trim())

const twice = pipe(21, ($) => $ + $)

const mixed = loadUser("5").pipe(Effect.orDie, ($) => Effect.map($, (s) => s.length), Effect.asVoid)

const awaited = Effect.fn("awaited")(function*() {
  return yield* loadUser("6").pipe(Effect.orElseSucceed(() => "none"))
})
