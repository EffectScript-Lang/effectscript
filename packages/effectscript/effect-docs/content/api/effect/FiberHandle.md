# effect/FiberHandle

The examples in the JSDoc of `packages/effect/src/FiberHandle.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## FiberHandle

**Managing a single fiber**

```efx
const program = effect {
  // Create a FiberHandle that can hold fibers producing strings
  const handle = await FiberHandle.make<string, never>()

  // The handle can store and manage a single fiber
  const fiber = await FiberHandle.run(handle, succeed("hello"))
  return await Fiber.join(fiber)
}

const actual = await runPromise(scoped(program))
actual // => "hello"
```

## isFiberHandle

**Checking fiber handles**

```efx
const program = effect {
  const handle = await FiberHandle.make()

  return [FiberHandle.isFiberHandle(handle), FiberHandle.isFiberHandle("not a handle")]
}

const actual = await runPromise(scoped(program))
actual // => [true, false]
```

## make

**Creating a scoped fiber handle**

```efx
const program = effect {
  const handle = await FiberHandle.make()

  // run some effects
  await FiberHandle.run(handle, never)
  // this will interrupt the previous fiber
  await FiberHandle.run(handle, never)

  await yieldNow
  return handle.state._tag === "Open" && handle.state.fiber !== undefined
}
  |> scoped // The fiber will be interrupted when the scope is closed


const actual = await runPromise(program)
actual // => true
```

## makeRuntime

**Running effects with a fiber handle**

```efx
import { Cause, Exit } from "effect"

const program = effect {
  const run = await FiberHandle.makeRuntime<never>()

  // Run effects and get fibers back
  const fiberA = run(never)
  const fiberB = run(succeed("second"))

  // The second fiber will interrupt the first
  const resultA = await Fiber.await(fiberA)
  const resultB = await Fiber.await(fiberB)
  return [resultA, resultB]
} |> scoped

const actual = await runPromise(program)
actual // => [Exit.failCause(Cause.interrupt(-1)), Exit.succeed("second")]
```

## makeRuntimePromise

**Running effects as promises**

```efx
const program = effect {
  const run = await FiberHandle.makeRuntimePromise()

  // Run effects and get promises back
  const promise = run(succeed("hello"))
  return await Effect.promise(() => promise)
} |> scoped

const actual = await runPromise(program)
actual // => "hello"
```

## setUnsafe

**Setting a fiber unsafely**

```efx
const program = Effect.gen(function*() {
  const handle = yield* FiberHandle.make()
  const fiber = runFork(succeed("hello"))

  // Set the fiber directly (unsafe)
  FiberHandle.setUnsafe(handle, fiber)

  // The fiber is now managed by the handle
  return yield* Fiber.join(fiber)
})

const actual = await runPromise(scoped(program))
actual // => "hello"
```

## set

**Setting a fiber safely**

```efx
const program = Effect.gen(function*() {
  const handle = yield* FiberHandle.make()
  const fiber = runFork(succeed("hello"))

  // Set the fiber safely
  yield* FiberHandle.set(handle, fiber)

  // The fiber is now managed by the handle
  return yield* Fiber.join(fiber)
})

const actual = await runPromise(scoped(program))
actual // => "hello"
```

## getUnsafe

**Reading the current fiber unsafely**

```efx
const program = effect {
  const handle = await FiberHandle.make()

  // No fiber initially
  const emptyFiber = FiberHandle.getUnsafe(handle)

  // Add a fiber
  await FiberHandle.run(handle, never)
  const fiber = FiberHandle.getUnsafe(handle)
  return [emptyFiber, Option.map(fiber, () => true)]
}

const actual = await runPromise(scoped(program))
actual // => [Option.none(), Option.some(true)]
```

## get

**Reading the current fiber**

```efx
const program = effect {
  const handle = await FiberHandle.make()

  // Add a fiber
  await FiberHandle.run(handle, never)

  // Get the current fiber if present
  const fiber = await FiberHandle.get(handle)
  return Option.map(fiber, () => true)
}

const actual = await runPromise(scoped(program))
actual // => Option.some(true)
```

## clear

**Clearing a fiber handle**

```efx
import { Option } from "effect"

const program = effect {
  const handle = await FiberHandle.make()

  // Add a fiber
  await FiberHandle.run(handle, never)

  // Clear the handle, interrupting the fiber
  await FiberHandle.clear(handle)

  // The handle is now empty
  return FiberHandle.getUnsafe(handle)
}

const actual = await runPromise(scoped(program))
actual // => Option.none()
```

## run

**Running an effect in a fiber handle**

```efx
const program = effect {
  const handle = await FiberHandle.make()

  // Run an effect and get the fiber
  const fiber = await FiberHandle.run(handle, succeed("hello"))
  const result = await Fiber.join(fiber)

  // Running another effect will interrupt the previous one
  const fiber2 = await FiberHandle.run(handle, succeed("world"))
  const result2 = await Fiber.join(fiber2)
  return [result, result2]
}

const actual = await runPromise(scoped(program))
actual // => ["hello", "world"]
```

## runtime

**Capturing a runtime for fiber handles**

```efx
service Users {
  readonly getAll: Effect<Array<unknown>>
}

const program = effect {
  const handle = await FiberHandle.make()
  const run = await FiberHandle.runtime(handle)<Users>()

  // run an effect and set the fiber in the handle
  const fiberA = run(andThen(Users, (_) => _.getAll))

  // this will interrupt the previous fiber
  const fiberB = run(andThen(Users, (_) => _.getAll))
  await Fiber.await(fiberA)
  return (await Fiber.join(fiberB)).length
}
  |> scoped // The fiber will be interrupted when the scope is closed


const actual = await runPromise(provideService(program, Users, {
  getAll: succeed([])
}))
actual // => 0
```

## runtimePromise

**Capturing a runtime for promises**

```efx
const program = effect {
  const handle = await FiberHandle.make()
  const runPromise = await FiberHandle.runtimePromise(handle)<never>()

  // Run an effect and get a promise
  const promise = runPromise(succeed("hello"))
  return await Effect.promise(() => promise)
}

const actual = await Effect.runPromise(scoped(program))
actual // => "hello"
```

## join

**Propagating fiber failures**

```efx
import { Exit } from "effect"

const program = Effect.gen(function*() {
  const handle = yield* FiberHandle.make()
  yield* FiberHandle.set(handle, runFork(fail("error")))

  // parent fiber will fail with "error"
  yield* FiberHandle.join(handle)
})

const actual = await runPromise(exit(scoped(program)))
actual // => Exit.fail("error")
```

## awaitEmpty

**Waiting for a fiber to complete**

```efx
import { Option } from "effect"

const program = effect {
  const handle = await FiberHandle.make()

  await FiberHandle.run(handle, yieldNow)

  // Wait for the fiber to complete
  await FiberHandle.awaitEmpty(handle)

  return await FiberHandle.get(handle)
}

const actual = await runPromise(scoped(program))
actual // => Option.none()
```
