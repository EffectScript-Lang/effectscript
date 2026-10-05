import { NodeRuntime, NodeServices } from "@effect/platform-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Otlp from "effect/observability/Otlp"
import * as OtlpSerialization from "effect/observability/OtlpSerialization"
// @efx observability otlp
NodeRuntime.runMain(Effect.gen(function*() {
  yield* Effect.log("traced")
}).pipe(Effect.provide(Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson]))), Effect.provide(NodeServices.layer)))
