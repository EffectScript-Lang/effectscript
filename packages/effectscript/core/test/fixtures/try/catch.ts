import { Data, Cause, Effect } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{}> {}
class Timeout extends Data.TaggedError("Timeout")<{}> {}

declare const load: (id: string) => Effect.Effect<string, NotFound | Timeout | Error>

const withFallback = Effect.fn("withFallback")(function*(id: string) {
  return yield* Effect.gen(function*() {
    return yield* load(id)
  }).pipe(Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect))), Effect.catchTags({ NotFound: (e) => Effect.gen(function*() {
    return "missing"
  }), Timeout: (e) => Effect.gen(function*() {
    return "slow"
  }) }, (e) => Effect.gen(function*() {
    return `failed: ${String(e)}`
  })))
})

const logged = Effect.fn("logged")(function*(id: string) {
  let result = "none"
  yield* Effect.gen(function*() {
    result = yield* load(id)
  }).pipe(Effect.catchTag(["NotFound", "Timeout"], (e) => Effect.gen(function*() {
    result = e._tag
  })), Effect.ensuring(Effect.gen(function*() {
    yield* Effect.log("done")
  })))
  return result
})

const plain = Effect.fn("plain")(function*(json: string) {
  return yield* Effect.gen(function*() {
    return JSON.parse(json) as unknown
  }).pipe(Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect))), Effect.catch(() => Effect.gen(function*() {
    return null
  })))
})
