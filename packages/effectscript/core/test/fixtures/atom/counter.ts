import { Effect } from "effect"
import { Atom } from "effect/reactivity"
export const count = Atom.make(0)

export const doubled = Atom.make((get) => get(count) * 2)

export const session = Atom.make(1).pipe(Atom.keepAlive)

export const greeting = Atom.make(Effect.gen(function*() {
  return yield* Effect.succeed("hello")
}))
