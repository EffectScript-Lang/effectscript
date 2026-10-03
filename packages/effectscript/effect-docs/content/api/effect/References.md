# effect/References

The examples in the JSDoc of `packages/effect/src/References.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## CurrentLogAnnotations

**Managing log annotations**

```efx
const logAnnotationExample = effect {
  // Get current annotations (empty by default)
  const current = await References.CurrentLogAnnotations
  const defaultCount = Object.keys(current).length

  // Run with custom log annotations
  const custom = await provideService(
    effect {
      const annotations = await References.CurrentLogAnnotations
      return [annotations.requestId, annotations.userId, annotations.version]
    },
    References.CurrentLogAnnotations,
    {
      requestId: "req-123",
      userId: "user-456",
      version: "1.0.0"
    }
  )

  // Run with extended annotations
  const extended = await provideService(
    effect {
      const annotations = await References.CurrentLogAnnotations
      return [annotations.operation, annotations.timestamp]
    },
    References.CurrentLogAnnotations,
    {
      requestId: "req-123",
      userId: "user-456",
      version: "1.0.0",
      operation: "data-sync",
      timestamp: 1234567890
    }
  )

  return [defaultCount, custom, extended]
}

await runPromise(logAnnotationExample) // => [0, ["req-123", "user-456", "1.0.0"], ["data-sync", 1234567890]]
```

## CurrentLogLevel

**Changing the level of an unqualified log**

```efx
const levels: Array<string> = []
const logger = Logger.make<unknown, void>(({ logLevel }) => {
  levels.push(logLevel)
})

const program = effect {
  console.log("uses the default level")
  await log("uses the provided level").pipe(
    provideService(References.CurrentLogLevel, "Error")
  )
}

await runPromise(program.pipe(provide(Logger.layer([logger]))))
levels // => ["Info", "Error"]
```

## CurrentLogSpans

**Tracking log spans**

```efx
const logSpanExample = effect {
  // Get current spans (empty by default)
  const current = await References.CurrentLogSpans
  const defaultCount = current.length

  // Add a log span manually
  const databaseConnectionStartedAt = 0
  const database = await provideService(
    effect {
      const spans = await References.CurrentLogSpans
      return spans.map(([label]) => label)
    },
    References.CurrentLogSpans,
    [["database-connection", databaseConnectionStartedAt]]
  )

  // Add another span
  const dataProcessingStartedAt = 100
  const processing = await provideService(
    effect {
      const spans = await References.CurrentLogSpans
      return spans.map(([label]) => label)
    },
    References.CurrentLogSpans,
    [
      ["database-connection", databaseConnectionStartedAt],
      ["data-processing", dataProcessingStartedAt]
    ]
  )

  // Clear spans when operations complete
  const cleared = await provideService(
    effect {
      const spans = await References.CurrentLogSpans
      return spans.length
    },
    References.CurrentLogSpans,
    []
  )

  return [defaultCount, database, processing, cleared]
}

await runPromise(logSpanExample) // => [0, ["database-connection"], ["database-connection", "data-processing"], 0]
```

## MinimumLogLevel

**Filtering logs below the minimum level**

```efx
const levels: Array<string> = []
const logger = Logger.make<unknown, void>(({ logLevel }) => {
  levels.push(logLevel)
})

const program = effect {
  console.info("filtered out")
  console.warn("included at the threshold")
  console.error("included above the threshold")
}

await runPromise(program.pipe(
  provideService(References.MinimumLogLevel, "Warn"),
  provide(Logger.layer([logger]))
))
levels // => ["Warn", "Error"]
```

## TracerEnabled

**Toggling tracing**

```efx
const tracingControl = effect {
  // Check if tracing is enabled (default is true)
  const current = await References.TracerEnabled

  // Disable tracing globally
  const disabled = await provideService(
    References.TracerEnabled,
    References.TracerEnabled,
    false
  )

  // Re-enable tracing
  const enabled = await provideService(
    References.TracerEnabled,
    References.TracerEnabled,
    true
  )

  return [current, disabled, enabled]
}

await runPromise(tracingControl) // => [true, false, true]
```

## TracerSpanAnnotations

**Managing span annotations**

```efx
const spanAnnotationExample = effect {
  // Get current annotations (empty by default)
  const current = await References.TracerSpanAnnotations
  const defaultCount = Object.keys(current).length

  // Set global span annotations
  const configured = await provideService(
    effect {
      // Get current annotations
      const annotations = await References.TracerSpanAnnotations
      return [annotations.service, annotations.version, annotations.environment]
    },
    References.TracerSpanAnnotations,
    {
      service: "user-service",
      version: "1.2.3",
      environment: "production"
    }
  )

  // Clear annotations
  const cleared = await provideService(
    effect {
      const annotations = await References.TracerSpanAnnotations
      return Object.keys(annotations).length
    },
    References.TracerSpanAnnotations,
    {}
  )

  return [defaultCount, configured, cleared]
}

await runPromise(spanAnnotationExample) // => [0, ["user-service", "1.2.3", "production"], 0]
```

## TracerSpanLinks

**Managing span links**

```efx
const spanLinksExample = effect {
  // Get current links (empty by default)
  const current = await References.TracerSpanLinks
  const defaultCount = current.length

  // Create an external span for the example
  const externalSpan = Tracer.externalSpan({
    spanId: "external-span-123",
    traceId: "trace-456"
  })

  // Create span links
  const spanLink: Tracer.SpanLink = {
    span: externalSpan,
    attributes: {
      relationship: "follows-from",
      priority: "high"
    }
  }

  // Set global span links
  const configuredCount = await provideService(
    map(References.TracerSpanLinks, (links) => links.length),
    References.TracerSpanLinks,
    [spanLink]
  )

  // Clear links
  const clearedCount = await provideService(
    map(References.TracerSpanLinks, (links) => links.length),
    References.TracerSpanLinks,
    []
  )

  return [defaultCount, configuredCount, clearedCount]
}

await runPromise(spanLinksExample) // => [0, 1, 0]
```

## TracerTimingEnabled

**Toggling trace timing**

```efx
const tracingControl = effect {
  // Check if trace timing is enabled (default is true)
  const current = await References.TracerTimingEnabled

  // Disable trace timing globally
  const disabled = await provideService(
    References.TracerTimingEnabled,
    References.TracerTimingEnabled,
    false
  )

  // Re-enable trace timing
  const enabled = await provideService(
    References.TracerTimingEnabled,
    References.TracerTimingEnabled,
    true
  )

  return [current, disabled, enabled]
}

await runPromise(tracingControl) // => [true, false, true]
```

## Scheduler

**Providing a custom scheduler**

```efx
const customScheduling = effect {
  // Get current scheduler (default is MixedScheduler)
  const current = await References.Scheduler
  const isDefaultMixed = current instanceof Scheduler.MixedScheduler

  // Use a custom scheduler
  const isCustomMixed = await provideService(
    map(References.Scheduler, (scheduler) => scheduler instanceof Scheduler.MixedScheduler),
    References.Scheduler,
    new Scheduler.MixedScheduler()
  )

  return [isDefaultMixed, isCustomMixed]
}

await runPromise(customScheduling) // => [true, true]
```
