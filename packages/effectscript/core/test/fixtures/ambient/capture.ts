import { Clock, Config, Effect, Random } from "effect"
export const report = Effect.fn("report")(function*(name: string) {
  yield* Effect.log("hello", name)
  yield* Effect.logWarning("careful")
  const startedAt = yield* Clock.currentTimeMillis
  const jitter = (yield* Random.next) * 10
  const region = (yield* Config.String("REGION").pipe(Config.withDefault(undefined))) ?? "eu"
  return { startedAt, jitter, region, debug: yield* Config.String("DEBUG").pipe(Config.withDefault(undefined)) }
})

export function plain() {
  console.log("not captured: outside effect code")
  return Date.now()
}
