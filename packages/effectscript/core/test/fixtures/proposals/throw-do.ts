import { Data, Effect } from "effect"

class Missing extends Data.TaggedError("Missing")<{}> {}

declare const find: (id: string) => Effect.Effect<string | undefined>

const required = Effect.fn("required")(function*(id: string) {
  const value = (yield* find(id)) ?? (yield* Effect.fail(new Missing()))
  return value
})

const port = Number(process.env["PORT"] ?? (() => { throw new Error("PORT is required") })())

const size = (() => {
  const n = port * 2
  if (n > 100) {
    return "large"
  } else {
    return "small"
  }
})()

const describeId = Effect.fn("describeId")(function*(id: string) {
  const label = (yield* Effect.gen(function*() {
    const value = yield* find(id)
    return value === undefined ? "none" : value.toUpperCase()
  }))
  return label
})
