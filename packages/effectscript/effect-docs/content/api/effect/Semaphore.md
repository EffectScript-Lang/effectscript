# effect/Semaphore

The examples in the JSDoc of `packages/effect/src/Semaphore.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Semaphore

**Controlling concurrent access**

```efx

// Create and use a semaphore for controlling concurrent access
const program = effect {
  const semaphore = await Semaphore.make(2)

  return await semaphore.withPermits(1)(
    succeed("Resource accessed")
  )
}

await runPromise(program) // => "Resource accessed"
```

## makeUnsafe

**Creating an unsafe semaphore**

```efx

const semaphore = Semaphore.makeUnsafe(3)

const task = (id: number) =>
  semaphore.withPermits(1)(
    effect {
      await yieldNow
      return id
    }
  )

// Only 3 tasks can run concurrently
const program = all([
  task(1),
  task(2),
  task(3),
  task(4),
  task(5)
], { concurrency: "unbounded" })

await runPromise(program) // => [1, 2, 3, 4, 5]
```

## make

**Creating a semaphore**

```efx

const program = effect {
  const semaphore = await Semaphore.make(2)

  const task = (id: number) =>
    semaphore.withPermits(1)(
      effect {
        await yieldNow
        return id
      }
    )

  // Run 4 tasks, but only 2 can run concurrently
  return await all([task(1), task(2), task(3), task(4)])
}

await runPromise(program) // => [1, 2, 3, 4]
```
