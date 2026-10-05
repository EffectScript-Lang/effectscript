import { NodeRuntime, NodeServices } from "@effect/platform-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
declare const program: Effect.Effect<void>

const helper = Effect.fn("helper")(function*() {
  return 1
})
NodeRuntime.runMain(Effect.gen(function*() {
  yield* program
  globalThis.console.log("done")
}).pipe(Effect.provide(Layer.empty), Effect.provide(NodeServices.layer)))
