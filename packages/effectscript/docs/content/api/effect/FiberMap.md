# effect/FiberMap

The examples in the JSDoc of `packages/effect/src/FiberMap.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## FiberMap

**Managing fibers in a map**

```efx

// Create a FiberMap with string keys
const program = effect {
  const map = await FiberMap.make<string>()

  // Add some fibers to the map
  await FiberMap.run(map, "task1", never)
  await FiberMap.run(map, "task2", never)

  // Get the size of the map
  return await FiberMap.size(map)
}

const actual = await runPromise(scoped(program))
actual // => 2
```

## isFiberMap

**Checking if a value is a FiberMap**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  return [FiberMap.isFiberMap(map), FiberMap.isFiberMap({}), FiberMap.isFiberMap(null)]
}

const actual = await runPromise(scoped(program))
actual // => [true, false, false]
```

## make

**Creating a scoped FiberMap**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  // run some effects and add the fibers to the map
  await FiberMap.run(map, "fiber a", never)
  await FiberMap.run(map, "fiber b", never)

  await yieldNow
  return await FiberMap.size(map)
}
  |> scoped // The fibers will be interrupted when the scope is closed


const actual = await runPromise(program)
actual // => 2
```

## makeRuntime

**Creating a scoped runtime**

```efx

const program = effect {
  const run = await FiberMap.makeRuntime<never, string>()

  // Run effects and get back fibers
  const fiber1 = run("task1", succeed("Hello"))
  const fiber2 = run("task2", succeed("World"))

  // Join the fibers to get their successful values
  return [await Fiber.join(fiber1), await Fiber.join(fiber2)]
}

const actual = await runPromise(scoped(program))
actual // => ["Hello", "World"]
```

## makeRuntimePromise

**Creating a promise runtime**

```efx

const program = effect {
  const run = await FiberMap.makeRuntimePromise<never, string>()

  // Run effects and get back promises
  const promise1 = run("task1", succeed("Hello"))
  const promise2 = run("task2", succeed("World"))

  // Convert to Effect and await
  return [await promise(() => promise1), await promise(() => promise2)]
}

const actual = await runPromise(scoped(program))
actual // => ["Hello", "World"]
```

## setUnsafe

**Adding a fiber unsafely**

```efx

const program = effect {
  const map = await FiberMap.make<string>()
  const deferred = await Deferred.make<string>()

  // Create a fiber and add it to the map
  const fiber = await forkChild(Deferred.await(deferred))
  FiberMap.setUnsafe(map, "greeting", fiber)

  await Deferred.succeed(deferred, "Hello")

  // Join the fiber to get its successful value
  return await Fiber.join(fiber)
}

const actual = await runPromise(scoped(program))
actual // => "Hello"
```

## set

**Adding a fiber**

```efx

const program = effect {
  const map = await FiberMap.make<string>()
  const deferred = await Deferred.make<string>()

  // Create a fiber and add it to the map using Effect
  const fiber = await forkChild(Deferred.await(deferred))
  await FiberMap.set(map, "greeting", fiber)

  await Deferred.succeed(deferred, "Hello")

  // Join the fiber to get its successful value
  return await Fiber.join(fiber)
}

const actual = await runPromise(scoped(program))
actual // => "Hello"
```

## getUnsafe

**Retrieving a fiber unsafely**

```efx

const program = effect {
  const map = await FiberMap.make<string>()
  const deferred = await Deferred.make<string>()

  // Add a fiber to the map
  const fiber = await forkChild(Deferred.await(deferred))
  FiberMap.setUnsafe(map, "greeting", fiber)

  // Retrieve the fiber
  const retrieved = FiberMap.getUnsafe(map, "greeting")
  await Deferred.succeed(deferred, "Hello")
  const result = await Fiber.join(fiber)
  return Option.map(retrieved, () => result)
}

const actual = await runPromise(scoped(program))
actual // => Option.some("Hello")
```

## get

**Retrieving a fiber**

```efx

const program = effect {
  const map = await FiberMap.make<string>()
  const deferred = await Deferred.make<string>()

  // Add a fiber to the map
  const fiber = await forkChild(Deferred.await(deferred))
  await FiberMap.set(map, "greeting", fiber)

  // Retrieve the fiber with error handling
  const retrieved = await FiberMap.get(map, "greeting")
  await Deferred.succeed(deferred, "Hello")
  const result = await Fiber.join(fiber)
  return Option.map(retrieved, () => result)
}

const actual = await runPromise(scoped(program))
actual // => Option.some("Hello")
```

## hasUnsafe

**Checking if a key exists unsafely**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  // Add a fiber to the map
  await FiberMap.run(map, "task1", never)

  // Check if keys exist
  return [FiberMap.hasUnsafe(map, "task1"), FiberMap.hasUnsafe(map, "task2")]
}

const actual = await runPromise(scoped(program))
actual // => [true, false]
```

## has

**Checking if a key exists**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  // Add a fiber to the map
  await FiberMap.run(map, "task1", never)

  // Check if keys exist using Effect
  return [await FiberMap.has(map, "task1"), await FiberMap.has(map, "task2")]
}

const actual = await runPromise(scoped(program))
actual // => [true, false]
```

## remove

**Removing a fiber**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  // Add some fibers to the map
  await FiberMap.run(map, "task1", never)
  await FiberMap.run(map, "task2", never)

  const sizeBefore = await FiberMap.size(map)

  // Remove a specific fiber (this will interrupt it)
  await FiberMap.remove(map, "task1")

  return [sizeBefore, await FiberMap.size(map)]
}

const actual = await runPromise(scoped(program))
actual // => [2, 1]
```

## clear

**Clearing all fibers**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  // Add some fibers to the map
  await FiberMap.run(map, "task1", never)
  await FiberMap.run(map, "task2", never)
  await FiberMap.run(map, "task3", never)

  const sizeBefore = await FiberMap.size(map)

  // Clear all fibers (this will interrupt all of them)
  await FiberMap.clear(map)

  return [sizeBefore, await FiberMap.size(map)]
}

const actual = await runPromise(scoped(program))
actual // => [3, 0]
```

## run

**Forking effects into a map**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  // Run effects and add the fibers to the map
  const fiber1 = await FiberMap.run(map, "task1", succeed("Hello"))
  const fiber2 = await FiberMap.run(map, "task2", succeed("World"))

  // Join the fibers to get their successful values
  const result1 = await Fiber.join(fiber1)
  const result2 = await Fiber.join(fiber2)
  return [result1, result2, await FiberMap.size(map)]
}

const actual = await runPromise(scoped(program))
actual // => ["Hello", "World", 0]
```

## runtime

**Capturing a runtime**

```efx

service Users {
  readonly getAll: Effect<Array<unknown>>
}

const program = effect {
  const map = await FiberMap.make<string>()
  const run = await FiberMap.runtime(map)<Users>()

  // run some effects and add the fibers to the map
  const fiberA = run("effect-a", andThen(Users, (_) => _.getAll))
  const fiberB = run("effect-b", andThen(Users, (_) => _.getAll))
  return [(await Fiber.join(fiberA)).length, (await Fiber.join(fiberB)).length]
}
  |> scoped // The fibers will be interrupted when the scope is closed


const actual = await runPromise(provideService(program, Users, {
  getAll: succeed([])
}))
actual // => [0, 0]
```

## runtimePromise

**Running effects as promises**

```efx

const program = effect {
  const map = await FiberMap.make<string>()
  const runPromise = await FiberMap.runtimePromise(map)<never>()

  // Create promises that will be backed by fibers in the map
  const promise1 = runPromise("task1", succeed("Hello"))
  const promise2 = runPromise("task2", succeed("World"))

  // Convert promises back to Effects and await
  return [await promise(() => promise1), await promise(() => promise2)]
}

const actual = await Effect.runPromise(scoped(program))
actual // => ["Hello", "World"]
```

## size

**Checking the map size**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  const sizeBefore = await FiberMap.size(map)

  // Add some fibers
  await FiberMap.run(map, "task1", never)
  await FiberMap.run(map, "task2", never)

  return [sizeBefore, await FiberMap.size(map)]
}

const actual = await runPromise(scoped(program))
actual // => [0, 2]
```

## join

**Joining failing fibers**

```efx
import { Effect, Exit } from "effect"

const program = Effect.gen(function*() {
  const map = yield* FiberMap.make()
  yield* FiberMap.set(map, "a", runFork(fail("error")))

  // parent fiber will fail with "error"
  yield* FiberMap.join(map)
})

const actual = await runPromise(exit(scoped(program)))
actual // => Exit.fail("error")
```

## awaitEmpty

**Waiting for an empty map**

```efx

const program = effect {
  const map = await FiberMap.make<string>()

  await FiberMap.run(map, "task1", yieldNow)
  await FiberMap.run(map, "task2", yieldNow)

  // Wait for the map to be empty
  await FiberMap.awaitEmpty(map)

  return await FiberMap.size(map)
}

const actual = await runPromise(scoped(program))
actual // => 0
```
