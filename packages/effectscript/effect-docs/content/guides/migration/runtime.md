> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Runtime: `Runtime<R>` Removed

In v3, `Runtime<R>` bundled a `Context<R>`, `RuntimeFlags`, and `FiberRefs`
into a single value used to execute effects:

```ts
// v3
interface Runtime<in R> {
  readonly context: Context.Context<R>
  readonly runtimeFlags: RuntimeFlags
  readonly fiberRefs: FiberRefs
}
```

In v4, this type no longer exists and you can use `Context<R>` instead.
Run functions live directly on `Effect`, and the `Runtime` module is reduced to
process lifecycle utilities.

## `Runtime.runFork(runtime)` -> `Effect.runForkWith(services)`

In v3, running an effect with dependencies usually meant pulling the current
runtime from `Effect.runtime<R>()` and calling `Runtime.runFork(runtime)` inside
the main effect.

**v3**

```ts
import { Context, Effect, Runtime } from "effect"

class Logger extends Context.Tag("Logger")<Logger, {
  readonly log: (message: string) => void
}>() {}

const program = Effect.gen(function*() {
  const logger = yield* Logger
  logger.log("Hello from Logger")
})

const main = Effect.gen(function*() {
  const runtime = yield* Effect.runtime<Logger>()
  return Runtime.runFork(runtime)(program)
}).pipe(
  Effect.provideService(Logger, {
    log: (message) => console.log(message)
  })
)

const fiber = Effect.runFork(main)
```

In v4, use the same pattern with `Effect.context<R>()`, then run with
`Effect.runForkWith(services)`:

**v4**

```efx
service Logger {
  readonly log: (message: string) => void
}

const program = effect {
  const logger = await Logger
  logger.log("Hello from Logger")
}

const main = effect {
  const services = await context<Logger>()
  return runForkWith(services)(program)
}
  |> provideContext(Context.make(Logger, {
    log: (message) => console.log(message)
  }))

const fiber = runFork(main)
```

If your effect has no service requirements, use `Effect.runFork(effect)`.

## `Runtime` Module Contents

The `Runtime` module now only contains:

- `Teardown` — interface for handling process exit
- `defaultTeardown` — default teardown implementation
- `makeRunMain` — creates platform-specific main runners
