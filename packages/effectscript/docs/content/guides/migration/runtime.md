> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

# Runtime: `Runtime<R>` Removed

In v3, `Runtime<R>` bundled a `Context<R>`, `RuntimeFlags`, and `FiberRefs`
into a single value used to execute effects:

```efx
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

```efx

class Logger extends Context.Tag("Logger")<Logger, {
  readonly log: (message: string) => void
}>() {}

const program = effect {
  const logger = await Logger
  logger.log("Hello from Logger")
}

const main = effect {
  const runtime = await Effect.runtime<Logger>()
  return Runtime.runFork(runtime)(program)
}
  |> provideService(Logger, {
    log: (message) => console.log(message)
  })

const fiber = runFork(main)
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
