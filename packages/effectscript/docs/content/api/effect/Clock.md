# effect/Clock

The examples in the JSDoc of `packages/effect/src/Clock.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Clock

**Reading current time**

```efx

const testClock: Clock = {
  currentTimeMillisUnsafe: () => 1_000,
  currentTimeMillis: succeed(1_000),
  monotonicTimeNanosUnsafe: () => 1_000_000_000n,
  monotonicTimeNanos: succeed(1_000_000_000n),
  currentTimeNanosUnsafe: () => 1_000_000_000n,
  currentTimeNanos: succeed(1_000_000_000n),
  sleep: () => Effect.void
}

const clockOperations = effect {
  const currentTime = Date.now()
  const currentTimeNanos = await Clock.currentTimeNanos
  return [currentTime, currentTimeNanos] as const
}

await runPromise(provideService(clockOperations, Clock.Clock, testClock)) // => [1_000, 1_000_000_000n]
```

**Accessing the Clock service**

```efx

const testClock: Clock = {
  currentTimeMillisUnsafe: () => 1_000,
  currentTimeMillis: succeed(1_000),
  monotonicTimeNanosUnsafe: () => 1_000_000_000n,
  monotonicTimeNanos: succeed(1_000_000_000n),
  currentTimeNanosUnsafe: () => 1_000_000_000n,
  currentTimeNanos: succeed(1_000_000_000n),
  sleep: () => Effect.void
}

const program = effect {
  const clock = await Clock
  return clock.currentTimeMillisUnsafe()
}

await runPromise(provideService(program, Clock.Clock, testClock)) // => 1_000
```

## clockWith

**Accessing the current Clock service**

```efx

const testClock: Clock = {
  currentTimeMillisUnsafe: () => 1_000,
  currentTimeMillis: succeed(1_000),
  monotonicTimeNanosUnsafe: () => 1_000_000_000n,
  monotonicTimeNanos: succeed(1_000_000_000n),
  currentTimeNanosUnsafe: () => 1_000_000_000n,
  currentTimeNanos: succeed(1_000_000_000n),
  sleep: () => Effect.void
}

const program = Clock.clockWith((clock) => sync(() => clock.currentTimeMillisUnsafe()))

await runPromise(provideService(program, Clock.Clock, testClock)) // => 1_000
```

## currentTimeMillis

**Reading milliseconds**

```efx

const testClock: Clock = {
  currentTimeMillisUnsafe: () => 1_000,
  currentTimeMillis: succeed(1_000),
  monotonicTimeNanosUnsafe: () => 1_000_000_000n,
  monotonicTimeNanos: succeed(1_000_000_000n),
  currentTimeNanosUnsafe: () => 1_000_000_000n,
  currentTimeNanos: succeed(1_000_000_000n),
  sleep: () => Effect.void
}

await runPromise(provideService(Clock.currentTimeMillis, Clock.Clock, testClock)) // => 1_000
```

## currentTimeNanos

**Reading nanoseconds**

```efx

const testClock: Clock = {
  currentTimeMillisUnsafe: () => 1_000,
  currentTimeMillis: succeed(1_000),
  monotonicTimeNanosUnsafe: () => 1_000_000_000n,
  monotonicTimeNanos: succeed(1_000_000_000n),
  currentTimeNanosUnsafe: () => 1_000_000_000n,
  currentTimeNanos: succeed(1_000_000_000n),
  sleep: () => Effect.void
}

await runPromise(provideService(Clock.currentTimeNanos, Clock.Clock, testClock)) // => 1_000_000_000n
```
