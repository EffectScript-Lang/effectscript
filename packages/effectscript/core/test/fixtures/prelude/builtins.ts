import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
declare const fetchUser: (id: string) => Effect.Effect<string, Error>

export const profile = Effect.fn("profile")(function*(id: string): Effect.fn.Return<string, Error> {
  const name = yield* pipe(fetchUser(id), Effect.retry({ times: 2 }), Effect.orElseSucceed(() => "anonymous"))
  yield* Effect.sleep("10 millis")
  const [a, b] = yield* Effect.all([Effect.succeed(1), Effect.succeed(2)])
  return `${name}:${a + b}`
})

export const delays = Schedule.exponential("10 millis")

const local = (retry: number) => retry + 1
const map = new Map<string, number>()

export type User = { readonly id: Option.Option<string> }
export const parsed: Effect.Effect<number> = Effect.succeed(local(1) + map.size)

export const readConfig = Effect.fn("readConfig")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path)
})
