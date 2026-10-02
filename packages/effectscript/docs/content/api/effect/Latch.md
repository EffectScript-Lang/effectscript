# effect/Latch

The examples in the JSDoc of `packages/effect/src/Latch.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Latch

**Coordinating fibers with a latch**

```efx

// Create and use a latch for coordination between fibers
const program = effect {
  const latch = await Latch.make()
  const waiter = await forkChild(latch.await.pipe(as("opened")))
  await latch.open
  return await Fiber.join(waiter)
}

await runPromise(program) // => "opened"
```

## makeUnsafe

**Creating a latch unsafely**

```efx

const latch = Latch.makeUnsafe(false)
const waiter = latch.await.pipe(as("opened"))

const program = effect {
  const fiber = await forkChild(waiter)
  await latch.open
  return await Fiber.join(fiber)
}

await runPromise(program) // => "opened"
```

## make

**Creating a latch**

```efx

const program = effect {
  const latch = await Latch.make(false)
  const waiter = latch.await.pipe(as("opened"))

  const fiber = await forkChild(waiter)
  await latch.open
  return await Fiber.join(fiber)
}

await runPromise(program) // => "opened"
```
