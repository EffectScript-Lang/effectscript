# effect/Tracer

The examples in the JSDoc of `packages/effect/src/Tracer.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## SpanStatus

**Creating span statuses**

```efx
import { Exit } from "effect"
import type { Tracer } from "effect"

const startTime = 1_000_000_000n
const endTime = 1_500_000_000n

const startedStatus: Tracer.SpanStatus = {
  _tag: "Started",
  startTime
}

const endedStatus: Tracer.SpanStatus = {
  _tag: "Ended",
  startTime,
  endTime,
  exit: Exit.succeed("result")
}

startedStatus._tag // => "Started"
endedStatus.endTime - endedStatus.startTime // => 500_000_000n
```

## AnySpan

**Accepting any span**

```efx
// Function that accepts any span type
const getSpanIds = (span: Tracer.AnySpan) => succeed([span.spanId, span.traceId])

// Works with both Span and ExternalSpan
const externalSpan = Tracer.externalSpan({
  spanId: "span-123",
  traceId: "trace-456"
})

await runPromise(getSpanIds(externalSpan)) // => ["span-123", "trace-456"]
```

## ParentSpanKey

**Reading the parent span key**

```efx
import { Tracer } from "effect"

// The key used to identify parent spans in the context
Tracer.ParentSpanKey // => "effect/Tracer/ParentSpan"
```

## ParentSpan

**Accessing the parent span**

```efx
// Access the parent span from the context
const program = effect {
  const parentSpan = await service(Tracer.ParentSpan)
  return parentSpan.spanId
}

const parent = Tracer.externalSpan({ spanId: "span-123", traceId: "trace-456" })
await runPromise(provideService(program, Tracer.ParentSpan, parent)) // => "span-123"
```

## ExternalSpan

**Creating an external span value**

```efx
import { Context } from "effect"
import type { Tracer } from "effect"

// Create an external span from another tracing system
const externalSpan: Tracer.ExternalSpan = {
  _tag: "ExternalSpan",
  spanId: "span-abc-123",
  traceId: "trace-xyz-789",
  sampled: true,
  annotations: Context.empty()
}

externalSpan.spanId // => "span-abc-123"
```

## SpanOptions

**Configuring span options**

```efx
// Create an effect with span options
const options: Tracer.SpanOptions = {
  attributes: { "user.id": "123", "operation": "data-processing" },
  kind: "internal",
  root: false,
  captureStackTrace: true
}

const program = succeed("Hello World").pipe(
  withSpan("my-operation", options)
)

const spans: Array<Tracer.NativeSpan> = []
const tracer = Tracer.make({
  span(options) {
    const span = new Tracer.NativeSpan(options)
    spans.push(span)
    return span
  }
})
const value = await runPromise(provideService(program, Tracer.Tracer, tracer)) // => "Hello World"

spans[0]?.attributes.get("user.id") // => "123"
spans[0]?.status._tag // => "Ended"
```

## SpanKind

**Configuring span kinds**

```efx
// Different span kinds for different operations
const program = succeed("handled").pipe(
  withSpan("handle-request", {
    kind: "server" as Tracer.SpanKind
  })
)

const spans: Array<Tracer.NativeSpan> = []
const tracer = Tracer.make({
  span(options) {
    const span = new Tracer.NativeSpan(options)
    spans.push(span)
    return span
  }
})
const value = await runPromise(provideService(program, Tracer.Tracer, tracer)) // => "handled"

spans[0]?.kind // => "server"
```

## Span

**Working with spans**

```efx
import { Context, Exit, Option } from "effect"
import type { Tracer } from "effect"

const attributes = new Map<string, unknown>()
const links: Array<Tracer.SpanLink> = []
const events: Array<[name: string, startTime: bigint, attributes: Record<string, unknown>]> = []
let status: Tracer.SpanStatus = {
  _tag: "Started",
  startTime: 1_000_000_000n
}

const span: Tracer.Span = {
  _tag: "Span",
  name: "load-user",
  spanId: "span-1",
  traceId: "trace-1",
  parent: Option.none(),
  annotations: Context.empty(),
  get status() {
    return status
  },
  attributes,
  links,
  sampled: true,
  kind: "internal",
  end(endTime, exit) {
    status = { _tag: "Ended", startTime: status.startTime, endTime, exit }
  },
  attribute(key, value) {
    attributes.set(key, value)
  },
  event(name, startTime, eventAttributes = {}) {
    events.push([name, startTime, eventAttributes])
  },
  addLinks(newLinks) {
    links.push(...newLinks)
  }
}

span.attribute("user.id", "123")
span.event("loaded", 1_250_000_000n, { "cache.hit": true })
span.end(1_500_000_000n, Exit.succeed("user"))

span.name // => "load-user"
span.attributes.get("user.id") // => "123"
span.status._tag // => "Ended"
events // => [["loaded", 1_250_000_000n, { "cache.hit": true }]]
```

## SpanLink

**Linking spans**

```efx
// Create a span link to connect spans
const externalSpan = Tracer.externalSpan({
  spanId: "external-span-123",
  traceId: "trace-456"
})

const link: Tracer.SpanLink = {
  span: externalSpan,
  attributes: { "link.type": "follows-from", "service": "external-api" }
}

const program = succeed("result").pipe(
  withSpan("linked-operation", { links: [link] })
)

const spans: Array<Tracer.NativeSpan> = []
const tracer = Tracer.make({
  span(options) {
    const span = new Tracer.NativeSpan(options)
    spans.push(span)
    return span
  }
})
const value = await runPromise(provideService(program, Tracer.Tracer, tracer)) // => "result"

spans[0]?.links[0]?.span.spanId // => "external-span-123"
spans[0]?.links[0]?.attributes["link.type"] // => "follows-from"
```

## externalSpan

**Creating an external span**

```efx
// Create an external span from another tracing system
const span = Tracer.externalSpan({
  spanId: "span-abc-123",
  traceId: "trace-xyz-789",
  sampled: true
})

// Use the external span as a parent
const program = succeed("Hello").pipe(
  withSpan("child-operation", { parent: span })
)

const spans: Array<Tracer.NativeSpan> = []
const tracer = Tracer.make({
  span(options) {
    const span = new Tracer.NativeSpan(options)
    spans.push(span)
    return span
  }
})
const value = await runPromise(provideService(program, Tracer.Tracer, tracer))

value // => "Hello"
spans.map((span) => Option.getOrUndefined(span.parent)?.spanId) // => ["span-abc-123"]
```

## DisablePropagation

**Disabling span propagation**

```efx
// Disable span propagation for a specific effect
const program = Tracer.DisablePropagation.pipe(
  provideService(Tracer.DisablePropagation, true)
)

await runPromise(program) // => true
```

## Tracer

**Accessing the current tracer**

```efx
// Access the current tracer from the context
const program = effect {
  const tracer = await service(Tracer.Tracer)
  // Or use the built-in tracer effect
  const tracerFromAccessor = await Effect.tracer
  return tracer === tracerFromAccessor
}

await runPromise(program) // => true
```
