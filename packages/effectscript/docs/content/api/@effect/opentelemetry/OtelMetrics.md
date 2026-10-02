# @effect/opentelemetry/OtelMetrics

The examples in the JSDoc of `packages/opentelemetry/src/OtelMetrics.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## layer

**Exporting delta metrics**

```efx
import { OtelMetrics, Resource } from "@effect/opentelemetry"
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader
} from "@opentelemetry/sdk-metrics"
import { Effect } from "effect"

const exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA)
const reader = new PeriodicExportingMetricReader({
  exporter,
  exportIntervalMillis: 60_000
})
const metricsLayer = OtelMetrics.layer(() => reader, { temporality: "delta" }).pipe(
  Layer.provide(Resource.layerEmpty)
)

const program = effect {
  await Metric.update(Metric.counter("docs.requests", { incremental: true }), 2)
  await promise(() => reader.forceFlush())

  const metric = exporter.getMetrics()[0]?.scopeMetrics[0]?.metrics.find(
    (metric) => metric.descriptor.name === "docs.requests"
  )
  return [metric?.descriptor.name, metric?.aggregationTemporality, metric?.dataPoints[0]?.value] as const
}
  |> provide(metricsLayer)
  |> provideService(Metric.MetricRegistry, new Map())

await runPromise(program) // => ["docs.requests", AggregationTemporality.DELTA, 2]
```
