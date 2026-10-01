import { Data, Effect } from "effect"

class Invalid extends Data.TaggedError("Invalid")<{}> {}
class Zero extends Data.TaggedError("Zero")<{}> {}

const check = Effect.fn("check")(function*(n: number): Effect.fn.Return<number, Invalid | Zero> {
  if (n < 0) return yield* Effect.fail(new Invalid())
  if (n === 0) {
    return yield* Effect.fail(new Zero())
  }
  const parse = (s: string) => {
    if (s === "") throw new Error("plain JS throw")
    return Number(s)
  }
  return parse(String(n))
})
