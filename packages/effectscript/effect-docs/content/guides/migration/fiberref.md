> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# FiberRef: `FiberRef` → `Context.Reference`

In v4, `FiberRef`, `FiberRefs`, `FiberRefsPatch`, and `Differ` have been removed.
Fiber-local state is now handled by `Context.Reference` — the same mechanism
used for services with default values.

## Built-in References

v3's built-in `FiberRef` values are now `Context.Reference` values exported
from `References` and related modules.

| v3 FiberRef                         | v4 Reference                       |
| ----------------------------------- | ---------------------------------- |
| `FiberRef.currentLogLevel`          | `References.CurrentLogLevel`       |
| `FiberRef.currentMinimumLogLevel`   | `References.MinimumLogLevel`       |
| `FiberRef.currentLogAnnotations`    | `References.CurrentLogAnnotations` |
| `FiberRef.currentLogSpan`           | `References.CurrentLogSpans`       |
| `FiberRef.currentScheduler`         | `References.Scheduler`             |
| `FiberRef.currentMaxOpsBeforeYield` | `References.MaxOpsBeforeYield`     |
| `FiberRef.currentTracerEnabled`     | `References.TracerEnabled`         |
| `FiberRef.unhandledErrorLogLevel`   | `References.UnhandledLogLevel`     |

## Reading References

In v3, `FiberRef.get` retrieved the current value. In v4, references are
services — `yield*` them directly.

**v3**

```ts
import { Effect, FiberRef } from "effect"

const program = Effect.gen(function*() {
  const level = yield* FiberRef.get(FiberRef.currentLogLevel)
  console.log(level)
})
```

**v4**

```efx
import { Effect, References } from "effect"

const program = Effect.gen(function*() {
  const level = yield* References.CurrentLogLevel
  console.log(level) // "Info" (default)
})
```

## Scoped Updates (`Effect.locally` → `Effect.provideService`)

v3's `Effect.locally` set a `FiberRef` value for the duration of an effect. In
v4, use `Effect.provideService` with the reference.

**v3**

```ts
import { Effect, FiberRef, LogLevel } from "effect"

const program = Effect.locally(
  myEffect,
  FiberRef.currentLogLevel,
  LogLevel.Debug
)
```

**v4**

```efx
const program = provideService(
  myEffect,
  References.CurrentLogLevel,
  "Debug"
)
```

## Writing References

v3's `FiberRef.set` mutated the current fiber's ref value. In v4, references are
set via `Effect.provideService`, which scopes the value to the provided effect.

**v3**

```ts
import { Effect, FiberRef } from "effect"

const program = Effect.gen(function*() {
  yield* FiberRef.set(FiberRef.currentMaxOpsBeforeYield, 500)
  // subsequent code sees maxOpsBeforeYield = 500
})
```

**v4**

```efx
const program = provideService(
  Effect.gen(function*() {
    const maxOps = yield* References.MaxOpsBeforeYield
    console.log(maxOps) // 500
  }),
  References.MaxOpsBeforeYield,
  500
)
```
