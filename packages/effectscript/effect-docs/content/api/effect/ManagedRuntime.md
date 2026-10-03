# effect/ManagedRuntime

The examples in the JSDoc of `packages/effect/src/ManagedRuntime.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## make

**Creating a managed runtime**

```efx
const notifications: Array<string> = []

service Notifications {
  readonly notify: (message: string) => Effect<void>
  layer = Layer.succeed(this)({
    notify: Effect.fn("Notifications.notify")((message) =>
      Effect.sync(() => notifications.push(message))
    )
  })
}

const runtime = ManagedRuntime.make(Notifications.layer)

const program = flatMap(
  Notifications,
  (_) => _.notify("Hello, world!")
).pipe(ensuring(runtime.disposeEffect))

await runtime.runPromise(program)
notifications // => ["Hello, world!"]
```
