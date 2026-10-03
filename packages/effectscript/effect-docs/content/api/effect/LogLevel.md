# effect/LogLevel

The examples in the JSDoc of `packages/effect/src/LogLevel.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## LogLevel

**Using log levels**

```efx
// Using log levels with Effect logging
const program = effect {
  await logFatal("System failure")
  console.error("Database error")
  console.warn("High memory usage")
  console.info("User logged in")
  console.debug("Processing request")
  await logTrace("Variable state")
}

// Type-safe log level variables
const errorLevel = "Error" // LogLevel
const debugLevel = "Debug" // LogLevel

await runPromise(
  provideService(program, References.MinimumLogLevel, "None")
)

const levels = [errorLevel, debugLevel]
levels // => ["Error", "Debug"]
```

## Order

**Ordering log levels**

```efx
import { LogLevel } from "effect"

LogLevel.Order("Error", "Info") // => 1
LogLevel.Order("Debug", "Error") // => -1
LogLevel.Order("Info", "Info") // => 0
```

## Equivalence

**Comparing log levels**

```efx
import { LogLevel } from "effect"

LogLevel.Equivalence("Error", "Error") // => true
LogLevel.Equivalence("Error", "Info") // => false
```

## isGreaterThan

**Checking higher severity**

```efx
import { LogLevel } from "effect"

LogLevel.isGreaterThan("Error", "Info") // => true
LogLevel.isGreaterThan("Debug", "Error") // => false

// Use with filtering
const isFatal = LogLevel.isGreaterThan("Fatal", "Warn")
const isError = LogLevel.isGreaterThan("Error", "Warn")
const isDebug = LogLevel.isGreaterThan("Debug", "Warn")
isFatal // => true
isError // => true
isDebug // => false

// Curried usage
const isMoreSevereThanInfo = LogLevel.isGreaterThan("Info")
isMoreSevereThanInfo("Error") // => true
isMoreSevereThanInfo("Debug") // => false
```

## isGreaterThanOrEqualTo

**Filtering by minimum log level**

```efx
import { LogLevel } from "effect"

LogLevel.isGreaterThanOrEqualTo("Error", "Error") // => true
LogLevel.isGreaterThanOrEqualTo("Error", "Info") // => true
LogLevel.isGreaterThanOrEqualTo("Debug", "Info") // => false

const isInfoOrAbove = LogLevel.isGreaterThanOrEqualTo("Info")
isInfoOrAbove("Error") // => true
```

## isLessThan

**Checking lower severity**

```efx
import { LogLevel } from "effect"

LogLevel.isLessThan("Debug", "Info") // => true
LogLevel.isLessThan("Error", "Info") // => false

// Filter out verbose logs
const isFatalVerbose = LogLevel.isLessThan("Fatal", "Info")
const isErrorVerbose = LogLevel.isLessThan("Error", "Info")
const isTraceVerbose = LogLevel.isLessThan("Trace", "Info")
isFatalVerbose // => false
isErrorVerbose // => false
isTraceVerbose // => true

// Curried usage
const isLessSevereThanError = LogLevel.isLessThan("Error")
isLessSevereThanError("Info") // => true
isLessSevereThanError("Fatal") // => false
```

## isLessThanOrEqualTo

**Filtering by maximum log level**

```efx
import { LogLevel } from "effect"

LogLevel.isLessThanOrEqualTo("Info", "Info") // => true
LogLevel.isLessThanOrEqualTo("Debug", "Info") // => true
LogLevel.isLessThanOrEqualTo("Error", "Info") // => false

const isInfoOrBelow = LogLevel.isLessThanOrEqualTo("Info")
isInfoOrBelow("Debug") // => true
```

## isEnabled

**Checking current fiber log level**

```efx
const program = effect {
  const debugEnabled = await LogLevel.isEnabled("Debug")
  const errorEnabled = await LogLevel.isEnabled("Error")

  return { debugEnabled, errorEnabled }
}

const warnOnly = program
  |> provideService(References.MinimumLogLevel, "Warn")

await runPromise(warnOnly) // => { debugEnabled: false, errorEnabled: true }
```
