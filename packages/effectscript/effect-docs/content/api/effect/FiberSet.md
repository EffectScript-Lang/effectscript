# effect/FiberSet

The examples in the JSDoc of `packages/effect/src/FiberSet.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## FiberSet

**Managing fibers in a set**

```efx
const program = effect {
  const set = await FiberSet.make<string, string>()

  // Add fibers to the set
  await FiberSet.run(set, succeed("hello"))
  await FiberSet.run(set, succeed("world"))

  // Wait for all fibers to complete
  await FiberSet.awaitEmpty(set)
  return await FiberSet.size(set)
}

const actual = await runPromise(scoped(program))
actual // => 0
```

## isFiberSet

**Checking if a value is a FiberSet**

```efx
const program = effect {
  const set = await FiberSet.make()

  return [FiberSet.isFiberSet(set), FiberSet.isFiberSet({})]
}

const actual = await runPromise(scoped(program))
actual // => [true, false]
```

## make

**Creating a scoped FiberSet**

```efx
const program = effect {
  const set = await FiberSet.make()

  // run some effects and add the fibers to the set
  await FiberSet.run(set, never)
  await FiberSet.run(set, never)

  await yieldNow
  return await FiberSet.size(set)
}
  |> scoped // The fibers will be interrupted when the scope is closed


const actual = await runPromise(program)
actual // => 2
```

## makeRuntime

**Creating a scoped runtime**

```efx
const program = effect {
  const runFork = await FiberSet.makeRuntime()

  // Fork effects using the runtime
  const fiber1 = runFork(succeed("hello"))
  const fiber2 = runFork(succeed("world"))

  return [await Fiber.join(fiber1), await Fiber.join(fiber2)]
}

const actual = await runPromise(scoped(program))
actual // => ["hello", "world"]
```

## makeRuntimePromise

**Creating a promise runtime**

```efx
const program = effect {
  const runPromise = await FiberSet.makeRuntimePromise()

  // Run effects as promises
  const promise1 = runPromise(succeed("hello"))
  const promise2 = runPromise(succeed("world"))

  return [await promise(() => promise1), await promise(() => promise2)]
}

const actual = await Effect.runPromise(scoped(program))
actual // => ["hello", "world"]
```

## addUnsafe

**Adding a fiber unsafely**

```efx
const program = effect {
  const set = await FiberSet.make()
  const fiber = await forkChild(never)

  // Unsafe add - doesn't return an Effect
  FiberSet.addUnsafe(set, fiber)

  // The fiber is now managed by the set
  return await FiberSet.size(set)
}

const actual = await runPromise(scoped(program))
actual // => 1
```

## add

**Adding a fiber**

```efx
const program = effect {
  const set = await FiberSet.make()
  const fiber = await forkChild(never)

  // Add the fiber to the set
  await FiberSet.add(set, fiber)

  // The fiber is now managed by the set
  return await FiberSet.size(set)
}

const actual = await runPromise(scoped(program))
actual // => 1
```

## clear

**Clearing all fibers**

```efx
const program = effect {
  const set = await FiberSet.make()

  // Add some fibers
  await FiberSet.run(set, never)
  await FiberSet.run(set, never)

  const sizeBefore = await FiberSet.size(set)

  // Clear all fibers
  await FiberSet.clear(set)

  return [sizeBefore, await FiberSet.size(set)]
}

const actual = await runPromise(scoped(program))
actual // => [2, 0]
```

## run

**Forking effects into a set**

```efx
const program = effect {
  const set = await FiberSet.make()

  // Fork and add to set
  const fiber1 = await FiberSet.run(set, succeed("hello"))
  const fiber2 = await FiberSet.run(set, succeed("world"))

  // Get results
  return [await Fiber.join(fiber1), await Fiber.join(fiber2)]
}

const actual = await runPromise(scoped(program))
actual // => ["hello", "world"]
```

## runtime

**Capturing a runtime**

```efx
service Users {
  readonly getAll: Effect<Array<unknown>>
}

const program = effect {
  const set = await FiberSet.make()
  const run = await FiberSet.runtime(set)<Users>()

  // run some effects and add the fibers to the set
  const fiber = run(andThen(Users, (_) => _.getAll))
  return (await Fiber.join(fiber)).length
}
  |> scoped // The fibers will be interrupted when the scope is closed


const actual = await runPromise(provideService(program, Users, {
  getAll: succeed([])
}))
actual // => 0
```

## runtimePromise

**Running effects as promises**

```efx
const program = effect {
  const set = await FiberSet.make()
  const runPromise = await FiberSet.runtimePromise(set)()

  // Run effects as promises
  const promise1 = runPromise(succeed("hello"))
  const promise2 = runPromise(succeed("world"))

  return [await promise(() => promise1), await promise(() => promise2)]
}

const actual = await Effect.runPromise(scoped(program))
actual // => ["hello", "world"]
```

## size

**Checking the set size**

```efx
const program = effect {
  const set = await FiberSet.make()

  const sizeBefore = await FiberSet.size(set)

  // Add some fibers
  await FiberSet.run(set, never)
  await FiberSet.run(set, never)

  return [sizeBefore, await FiberSet.size(set)]
}

const actual = await runPromise(scoped(program))
actual // => [0, 2]
```

## join

**Joining failing fibers**

```efx
import { Effect, Exit } from "effect"

const program = Effect.gen(function*() {
  const set = yield* FiberSet.make()
  yield* FiberSet.add(set, runFork(fail("error")))

  // parent fiber will fail with "error"
  yield* FiberSet.join(set)
})

const actual = await runPromise(exit(scoped(program)))
actual // => Exit.fail("error")
```

## awaitEmpty

**Waiting for an empty set**

```efx
const program = effect {
  const set = await FiberSet.make()

  await FiberSet.run(set, yieldNow)
  await FiberSet.run(set, yieldNow)

  // Wait for all fibers to complete
  await FiberSet.awaitEmpty(set)

  return await FiberSet.size(set)
}

const actual = await runPromise(scoped(program))
actual // => 0
```
