import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp, OtlpSerialization } from "effect/observability"
// @efx observability otlp
NodeRuntime.runMain(Effect.gen(function*() {
  yield* Effect.log("traced")
}).pipe(Effect.provide(Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson]))), Effect.provide(NodeServices.layer)))
