# effect/persistence/RateLimiter

The examples in the JSDoc of `packages/effect/src/persistence/RateLimiter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## makeWithRateLimiter

**Applying rate limits to effects**

```efx
import { RateLimiter } from "effect/persistence"

const messages: Array<string> = []
const program = effect {
  // Access the `withLimiter` function from the RateLimiter module
  const withLimiter = await RateLimiter.makeWithRateLimiter

  // Apply a rate limiter to an effect
  await sync(() => messages.push("Making a request with rate limiting")).pipe(
    withLimiter({
      key: "some-key",
      limit: 10,
      onExceeded: "delay",
      window: "5 seconds",
      algorithm: "fixed-window"
    })
  )
}
  |> provide(RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)))

await runPromise(program)
messages // => ["Making a request with rate limiting"]
```

## sleep

**Sleeping until rate limit permits**

```efx
import { RateLimiter } from "effect/persistence"

const program = effect {
  const limiter = await RateLimiter.RateLimiter
  const partiallyApplied = RateLimiter.sleep(limiter)
  const partial = await partiallyApplied({
    key: "partial",
    limit: 10,
    window: "5 seconds",
    algorithm: "fixed-window"
  })
  const direct = await RateLimiter.sleep(limiter, {
    key: "direct",
    limit: 10,
    window: "5 seconds",
    algorithm: "fixed-window"
  })
  return [partial.remaining, direct.remaining]
}
  |> provide(RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)))

await runPromise(program) // => [9, 9]
```
