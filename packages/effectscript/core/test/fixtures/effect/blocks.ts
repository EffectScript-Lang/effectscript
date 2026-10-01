import { Effect } from "effect"
declare const task: Effect.Effect<number>

export const program = Effect.gen(function*() {
  const n = yield* task
  return n + 1
})

class Counter {
  count = 0
  readonly increment = Effect.gen({ self: this }, function*() {
    this.count++
    return this.count
  })
}

export const add = Effect.fnUntraced(function*(n: number) { return (yield* task) + n })
export const addAll = Effect.fnUntraced(function*(xs: ReadonlyArray<number>): Effect.fn.Return<number> {
  let total = 0
  for (const x of xs) total += x + (yield* task)
  return total
})
export const typed = Effect.fnUntraced(function*(s: string): Effect.fn.Return<string, never> { return s.trim() })

export const api = {
  fetch: Effect.fn("fetch")(function*(id: string) {
    return id.length + (yield* task)
  }),
  plain() {
    return 1
  }
}
