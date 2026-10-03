import { Context, Effect, Layer } from "effect"
export interface Greeter {
  greet(name: string): Effect.Effect<string>
  readonly punctuation: string
}
const GreeterReference = Context.Reference<Greeter>("fixtures/service/default/Greeter", {
  defaultValue: () => ({
    punctuation: "!",
    greet: Effect.fnUntraced(function*(name: string) { return `Hello, ${name}!` })
  })
})
export const Greeter = Object.assign(GreeterReference, {
  layerTest: Layer.succeed(GreeterReference, GreeterReference.of({ punctuation: ".", greet: Effect.fnUntraced(function*(name: string) { return `Hi, ${name}.` }) })),
  greet: (name: string) => GreeterReference.use((_) => _.greet(name))
})

export const welcome = Effect.fn("welcome")(function*(name: string) {
  const greeting = yield* Greeter.greet(name)
  return `${greeting} Welcome.`
})
