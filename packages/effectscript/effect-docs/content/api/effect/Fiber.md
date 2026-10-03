# effect/Fiber

The examples in the JSDoc of `packages/effect/src/Fiber.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Fiber

**Awaiting a forked fiber**

```efx
import { Effect, Exit } from "effect"

const program = effect {
  // Fork an effect to run in a new fiber
  const fiber = await forkChild(succeed(42))

  // Wait for the fiber to complete and get its result
  const result = await Fiber.await(fiber)
  return result
}

const actual = await runPromise(program)
actual // => Exit.succeed(42)
```

**Working with fiber types**

```efx
const program = effect {
  // Create a fiber
  const fiber = await forkChild(succeed(42))

  // Use namespace types for variance
  const typedFiber: Fiber<number, never> = fiber

  // Join the fiber
  return await Fiber.join(fiber)
}

const actual = await runPromise(program)
actual // => 42
```

## Fiber.Variance

**Upcasting fibers safely**

```efx
// Variance allows safe subtyping
const fiber: Fiber<number, never> = runFork(succeed(1))
const upcast: Fiber<unknown, unknown> = fiber
const actual = await runPromise(Fiber.join(upcast))
actual // => 1
```

## await

**Awaiting a fiber exit**

```efx
import { Effect, Exit } from "effect"

const program = effect {
  const fiber = await forkChild(succeed(42))
  return await Fiber.await(fiber)
}

const actual = await runPromise(program)
actual // => Exit.succeed(42)
```

## awaitAll

**Awaiting multiple fiber exits**

```efx
import { Effect, Exit } from "effect"

const program = effect {
  const fiber1 = await forkChild(succeed(1))
  const fiber2 = await forkChild(succeed(2))
  return await Fiber.awaitAll([fiber1, fiber2])
}

const actual = await runPromise(program)
actual // => [Exit.succeed(1), Exit.succeed(2)]
```

## join

**Joining a fiber**

```efx
const program = effect {
  const fiber = await forkChild(succeed(42))
  return await Fiber.join(fiber)
}

const actual = await runPromise(program)
actual // => 42
```

## interrupt

**Interrupting a fiber**

```efx
const program = effect {
  const fiber = await forkChild(
    delay("1 second")(succeed(42))
  )
  await Fiber.interrupt(fiber)
}

await runPromise(program)
```

## interruptAs

**Interrupting a fiber as another fiber**

```efx
const program = effect {
  const targetFiber = await forkChild(
    delay("5 seconds")(succeed("task completed"))
  )

  // Interrupt the fiber, specifying fiber ID 123 as the interruptor
  await Fiber.interruptAs(targetFiber, 123)
}

await runPromise(program)
```

## interruptAll

**Interrupting multiple fibers**

```efx
const program = effect {
  const fiber1 = await forkChild(never)
  const fiber2 = await forkChild(never)
  const fiber3 = await forkChild(never)
  await Fiber.interruptAll([fiber1, fiber2, fiber3])
}

await runPromise(program)
```

## interruptAllAs

**Interrupting multiple fibers as another fiber**

```efx
const program = effect {
  // Create a controlling fiber
  const controllerFiber = await forkChild(succeed("controller"))

  const worker1 = await forkChild(never)
  const worker2 = await forkChild(never)

  await Fiber.interruptAllAs([worker1, worker2], controllerFiber.id)
}

await runPromise(program)
```

## isFiber

**Checking for fibers**

```efx
const program = effect {
  // Create a fiber
  const fiber = await forkChild(succeed(42))

  // Test if values are fibers
  return [Fiber.isFiber(fiber), Fiber.isFiber("hello"), Fiber.isFiber(42), Fiber.isFiber(null)]
}

const actual = await runPromise(program)
actual // => [true, false, false, false]
```

## getCurrent

**Getting the current fiber**

```efx
const program = effect {
  const current = Fiber.getCurrent()
  return current !== undefined
}

const actual = await runPromise(program)
actual // => true
```
