import { Data, Effect } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

declare const lookup: (id: string) => Effect.Effect<string, NotFound>

export const getName = Effect.fn("getName")(function*(id: string): Effect.fn.Return<string, NotFound> {
  const name = yield* lookup(id)
  return name.toUpperCase()
})

const helper = Effect.fn("helper")(function*(n: number) {
  return n * 2
})
