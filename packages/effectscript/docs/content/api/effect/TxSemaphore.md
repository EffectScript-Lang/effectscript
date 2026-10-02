# effect/TxSemaphore

The examples in the JSDoc of `packages/effect/src/TxSemaphore.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## TxSemaphore

**Managing permits transactionally**

```efx

// Create a semaphore with 3 permits for managing concurrent database connections
const program = effect {
  const dbSemaphore = await TxSemaphore.make(3)

  // Acquire a permit before accessing the database
  await TxSemaphore.acquire(dbSemaphore)
  const acquired = await TxSemaphore.available(dbSemaphore)

  // Perform database operations...

  // Release the permit when done
  await TxSemaphore.release(dbSemaphore)
  const released = await TxSemaphore.available(dbSemaphore)
  return [acquired, released] as const
}

await runPromise(program) // => [2, 3]
```

## make

**Creating a semaphore**

```efx

// Create a semaphore for managing concurrent access to a resource pool
const program = effect {
  // Create a semaphore with 3 permits for a connection pool
  const connectionSemaphore = await TxSemaphore.make(3)

  // Check initial state
  const available = await TxSemaphore.available(connectionSemaphore)
  const capacity = await TxSemaphore.capacity(connectionSemaphore)
  return [capacity, available] as const
}

await runPromise(program) // => [3, 3]
```

## available

**Checking available permits**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(5)

  // Check available permits before acquiring
  const before = await TxSemaphore.available(semaphore)

  // Acquire some permits
  await TxSemaphore.acquire(semaphore)
  await TxSemaphore.acquire(semaphore)

  // Check available permits after acquiring
  const after = await TxSemaphore.available(semaphore)
  return [before, after] as const
}

await runPromise(program) // => [5, 3]
```

## capacity

**Checking semaphore capacity**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(10)

  const capacity = await TxSemaphore.capacity(semaphore)

  // Capacity remains constant regardless of current permits
  await TxSemaphore.acquire(semaphore)
  const stillSame = await TxSemaphore.capacity(semaphore)
  return [capacity, stillSame] as const
}

await runPromise(program) // => [10, 10]
```

## acquire

**Acquiring a permit**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(2)

  await TxSemaphore.acquire(semaphore)

  await TxSemaphore.acquire(semaphore)

  return await TxSemaphore.available(semaphore)
}

await runPromise(program) // => 0
```

## acquireN

**Acquiring multiple permits**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(5)

  await TxSemaphore.acquireN(semaphore, 3)

  return await TxSemaphore.available(semaphore)
}

await runPromise(program) // => 2
```

## tryAcquire

**Trying to acquire a permit**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(1)

  // First try should succeed
  const first = await TxSemaphore.tryAcquire(semaphore)

  // Second try should fail (no permits left)
  const second = await TxSemaphore.tryAcquire(semaphore)
  return [first, second] as const
}

await runPromise(program) // => [true, false]
```

## tryAcquireN

**Trying to acquire multiple permits**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(3)

  // Try to acquire 2 permits (should succeed)
  const first = await TxSemaphore.tryAcquireN(semaphore, 2)

  // Try to acquire 2 more permits (should fail, only 1 left)
  const second = await TxSemaphore.tryAcquireN(semaphore, 2)
  return [first, second] as const
}

await runPromise(program) // => [true, false]
```

## release

**Releasing a permit**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(2)

  // Acquire a permit
  await TxSemaphore.acquire(semaphore)
  const afterAcquire = await TxSemaphore.available(semaphore)

  // Release the permit
  await TxSemaphore.release(semaphore)
  const afterRelease = await TxSemaphore.available(semaphore)
  return [afterAcquire, afterRelease] as const
}

await runPromise(program) // => [1, 2]
```

## releaseN

**Releasing multiple permits**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(5)

  // Acquire 3 permits
  await TxSemaphore.acquireN(semaphore, 3)
  const afterAcquire = await TxSemaphore.available(semaphore)

  // Release 2 permits
  await TxSemaphore.releaseN(semaphore, 2)
  const afterRelease = await TxSemaphore.available(semaphore)
  return [afterAcquire, afterRelease] as const
}

await runPromise(program) // => [2, 4]
```

## withPermit

**Running an effect with a permit**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(2)
  const events: Array<string> = []

  // Execute database operation with automatic permit management
  const result = await TxSemaphore.withPermit(
    semaphore,
    effect {
      events.push("permit acquired")
      await yieldNow
      events.push("operation complete")
      return "query result"
    }
  )

  // Permit is automatically released here
  const available = await TxSemaphore.available(semaphore)
  return [events, result, available] as const
}

await runPromise(program) // => [["permit acquired", "operation complete"], "query result", 2]
```

## withPermits

**Running an effect with multiple permits**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(5)
  const events: Array<string> = []

  // Execute batch operation with 3 permits
  const results = await TxSemaphore.withPermits(
    semaphore,
    3,
    effect {
      events.push("3 permits acquired")
      await yieldNow
      return ["result1", "result2", "result3"]
    }
  )

  // All 3 permits are automatically released here
  const available = await TxSemaphore.available(semaphore)
  return [events, results, available] as const
}

await runPromise(program) // => [["3 permits acquired"], ["result1", "result2", "result3"], 5]
```

## withPermitScoped

**Acquiring a scoped permit**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(3)
  const events: Array<string> = []

  await scoped(
    effect {
      // Acquire permit for the duration of this scope
      await TxSemaphore.withPermitScoped(semaphore)
      events.push("permit acquired for scope")

      // Do work within the scope
      await yieldNow
      events.push("work completed")

      // Permit will be automatically released when scope closes
    }
  )

  const available = await TxSemaphore.available(semaphore)
  return [events, available] as const
}

await runPromise(program) // => [["permit acquired for scope", "work completed"], 3]
```

## isTxSemaphore

**Checking semaphore values**

```efx

const program = effect {
  const semaphore = await TxSemaphore.make(5)
  const notSemaphore = { some: "object" }

  const semaphoreResult = TxSemaphore.isTxSemaphore(semaphore)
  const objectResult = TxSemaphore.isTxSemaphore(notSemaphore)

  // Useful for runtime type checking in generic functions
  if (TxSemaphore.isTxSemaphore(semaphore)) {
    const available = await TxSemaphore.available(semaphore)
    return [semaphoreResult, objectResult, available] as const
  }
  return [semaphoreResult, objectResult, 0] as const
}

await runPromise(program) // => [true, false, 5]
```
