# effect/testing/TestClock

The examples in the JSDoc of `packages/effect/src/testing/TestClock.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## TestClock

**Testing timeouts deterministically**

```efx
import { TestClock } from "effect/testing"

const program = effect {
  const fiber = await sleep("5 minutes")
    |> timeout("1 minute")
    |> forkChild
  await TestClock.adjust("1 minute")
  const exit = await Fiber.await(fiber)
  Exit.isFailure(exit) // => true
}

await runPromise(provide(program, TestClock.layer()))
```

**Advancing time deterministically**

```efx

const program = effect {
  let executed = false

  // Fork an effect that sleeps for 1 hour
  const fiber = await effect {
    await sleep("1 hour")
    executed = true
  } |> forkChild

  // Advance the test clock by 1 hour
  await TestClock.adjust("1 hour")
  await Fiber.join(fiber)

  // The effect should now be executed
  executed // => true
}

await runPromise(provide(program, TestClock.layer()))
```

**Configuring a test clock**

```efx

const program = effect {
  // Create a TestClock with custom options
  const testClock = await TestClock.make({
    warningDelay: "5 seconds"
  })

  // Access the current state
  const currentTime = testClock.currentTimeMillisUnsafe()
  currentTime // => 0
}

await runPromise(scoped(program))
```

## TestClock.Options

**Configuring the warning delay**

```efx

const program = effect {
  // Create a TestClock with custom warning delay
  const testClock = await TestClock.make({
    warningDelay: "30 seconds"
  })

  // Use the TestClock in your test
  await testClock.adjust("1 hour")
  testClock.currentTimeMillisUnsafe() // => 3_600_000
}

await runPromise(scoped(program))
```

## make

**Creating a test clock**

```efx

const program = effect {
  // Create a TestClock with default settings
  const testClock = await TestClock.make()

  // Create a TestClock with custom warning delay
  const customTestClock = await TestClock.make({
    warningDelay: "10 seconds"
  })

  // Use the TestClock to control time in tests
  await testClock.adjust("1 hour")
  const currentTime = testClock.currentTimeMillisUnsafe()
  currentTime // => 3_600_000
}

await runPromise(scoped(program))
```

## layer

**Providing a test clock layer**

```efx

// Create a TestClock layer
const testClockLayer = TestClock.layer()

// Create a TestClock layer with custom options
const customTestClockLayer = TestClock.layer({
  warningDelay: "5 seconds"
})

const program = effect {
  // Use the layer in your program
  await TestClock.adjust("1 hour")
  return await TestClock.testClockWith((testClock) =>
    succeed(testClock.currentTimeMillisUnsafe())
  )
}

await runPromise(provide(program, testClockLayer)) // => 3_600_000
await runPromise(provide(program, customTestClockLayer)) // => 3_600_000
```

## testClockWith

**Accessing the test clock**

```efx

const program = effect {
  // Use testClockWith to access the TestClock instance
  const currentTime = await TestClock.testClockWith((testClock) =>
    succeed(testClock.currentTimeMillisUnsafe())
  )

  // Adjust time using the TestClock instance
  await TestClock.testClockWith((testClock) => testClock.adjust("2 hours"))

  currentTime // => 0
}

await runPromise(provide(program, TestClock.layer()))
```

## adjust

**Advancing the test clock**

```efx

const program = effect {
  let executed = false

  // Fork an effect that sleeps for 30 minutes
  const fiber = await effect {
    await sleep("30 minutes")
    executed = true
  } |> forkChild

  // Advance the clock by 30 minutes
  await TestClock.adjust("30 minutes")
  await Fiber.join(fiber)

  // The effect should now be executed
  executed // => true
}

await runPromise(provide(program, TestClock.layer()))
```

## setTime

**Setting the test clock time**

```efx

const program = effect {
  let executed = false

  // Fork an effect that sleeps for 2 hours
  const fiber = await effect {
    await sleep("2 hours")
    executed = true
  } |> forkChild

  // Set the clock to a specific timestamp (2 hours from epoch)
  const targetTime = Duration.toMillis(Duration.hours(2))
  await TestClock.setTime(targetTime)
  await Fiber.join(fiber)

  // The effect should now be executed
  executed // => true
}

await runPromise(provide(program, TestClock.layer()))
```

## withLive

**Running with the live clock**

```efx

const program = effect {
  // Get the current test time (starts at epoch)
  const testTime = Date.now()
  testTime // => 0

  // Get the actual system time using withLive
  const realTime = await TestClock.withLive(Clock.currentTimeMillis)
  Number.isFinite(realTime) // => true

  // Advance test time
  await TestClock.adjust("1 hour")

  // Test time is now 1 hour ahead
  const newTestTime = Date.now()
  newTestTime // => 3_600_000
}

await runPromise(provide(program, TestClock.layer()))
```
