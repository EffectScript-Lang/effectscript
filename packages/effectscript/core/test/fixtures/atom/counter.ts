import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
export const count = Atom.make(0)

export const doubled = Atom.make((get) => get(count) * 2)

export const session = Atom.make(1).pipe(Atom.keepAlive)

export const greeting = Atom.make(Effect.gen(function*() {
  return yield* Effect.succeed("hello")
}))
