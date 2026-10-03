# effect/observability/PrometheusMetrics

The examples in the JSDoc of `packages/effect/src/observability/PrometheusMetrics.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## MetricNameMapper

**Mapping metric names**

```efx
import type { PrometheusMetrics } from "effect/observability"

// Convert camelCase to snake_case
const mapper: PrometheusMetrics.MetricNameMapper = (name) =>
  name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()

mapper("httpRequests") // => "http_requests"
```

## format

**Formatting metrics**

```efx
const program = effect {
  const counter = Metric.counter("api_requests_total", {
    description: "Total API requests"
  })
  const gauge = Metric.gauge("active_connections", {
    description: "Number of active connections"
  })

  await Metric.update(counter, 100)
  await Metric.update(gauge, 25)

  // Format without prefix
  const output1 = await PrometheusMetrics.format()

  // Format with prefix
  const output2 = await PrometheusMetrics.format({ prefix: "myapp" })

  return [output1.includes("api_requests_total"), output2.includes("myapp_active_connections")]
}

runSync(program) // => [true, true]
```

## layerHttp

**Serving metrics over HTTP**

```efx
import { Layer } from "effect"
import { PrometheusMetrics } from "effect/observability"

// Create a layer that adds /metrics endpoint to the router
const PrometheusLayer = PrometheusMetrics.layerHttp()

// Or customize the path and add a prefix to all metric names
const CustomPrometheusLayer = PrometheusMetrics.layerHttp({
  path: "/prometheus/metrics",
  prefix: "myapp"
})

const result = [Layer.isLayer(PrometheusLayer), Layer.isLayer(CustomPrometheusLayer)] // => [true, true]
```
