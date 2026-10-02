# effect/observability/OtlpMetrics

The examples in the JSDoc of `packages/effect/src/observability/OtlpMetrics.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## AggregationTemporality

**Configuring aggregation temporality**

```efx
import { Layer } from "effect"
import { OtlpMetrics } from "effect/observability"

// Use delta temporality for backends that prefer it (e.g., Datadog, Dynatrace)
const metricsLayer = OtlpMetrics.layer({
  url: "http://localhost:4318/v1/metrics",
  temporality: "delta"
})

// Use cumulative temporality for backends like Prometheus
const cumulativeLayer = OtlpMetrics.layer({
  url: "http://localhost:4318/v1/metrics",
  temporality: "cumulative" // This is the default
})

const result = [Layer.isLayer(metricsLayer), Layer.isLayer(cumulativeLayer)] // => [true, true]
```
