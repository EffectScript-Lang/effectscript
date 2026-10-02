# effect/Cache

The examples in the JSDoc of `packages/effect/src/Cache.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Cache

**Creating a basic cache**

```efx

// Basic cache with string keys and number values
const program = effect {
  const cache = await Cache.make<string, number>({
    capacity: 100,
    lookup: (key: string) => succeed(key.length)
  })

  // Cache operations
  const value1 = await Cache.get(cache, "hello") // 5
  const value2 = await Cache.get(cache, "world") // 5
  const value3 = await Cache.get(cache, "hello") // 5 (cached)

  return [value1, value2, value3]
}

const actual = await runPromise(program)
actual // => [5, 5, 5]
```

**Handling lookup failures**

```efx
import { Cache, Effect, Exit } from "effect"

// Cache with error handling
const program = effect {
  const cache = await Cache.make<string, number, string>({
    capacity: 10,
    lookup: (key: string) =>
      key === "error"
        ? fail("Lookup failed")
        : succeed(key.length)
  })

  // Handle successful and failed lookups
  const success = await Cache.get(cache, "test")
  const failure = await exit(Cache.get(cache, "error"))

  return [success, failure] as const
}

const actual = await runPromise(program)
actual // => [4, Exit.fail("Lookup failed")]
```

**Using complex keys with TTL**

```efx

// Cache with complex key types and TTL
class UserId extends Data.Class<{ id: number }> {}

const program = effect {
  const userCache = await Cache.make<UserId, string>({
    capacity: 1000,
    lookup: (userId: UserId) => succeed(`User-${userId.id}`),
    timeToLive: Duration.minutes(5)
  })

  const userId = new UserId({ id: 123 })
  const userName = await Cache.get(userCache, userId)

  return userName
}

const actual = await runPromise(program)
actual // => "User-123"
```

## makeWith

**Configuring dynamic time to live**

```efx

// Cache with TTL based on computed value
const program = effect {
  const cache = await Cache.makeWith(
    (id: number) => succeed({ id, active: id % 2 === 0 }),
    {
      capacity: 1000,
      timeToLive(exit) {
        if (Exit.isSuccess(exit)) {
          const user = exit.value
          return user.active ? "1 hour" : "5 minutes"
        }
        return "30 seconds"
      }
    }
  )

  return cache.capacity
}

const actual = await runPromise(program)
actual // => 1000
```

## make

**Creating a basic cache**

```efx

// Basic cache with string keys
const program = effect {
  const cache = await Cache.make<string, number>({
    capacity: 100,
    lookup: (key) => succeed(key.length)
  })

  const result1 = await Cache.get(cache, "hello")
  const result2 = await Cache.get(cache, "world")
  return { result1, result2 }
}

const actual = await runPromise(program)
actual // => { result1: 5, result2: 5 }
```

**Creating a cache with TTL**

```efx

const program = effect {
  const users = new Map([
    [123, { name: "Ada", email: "ada@example.com" }],
    [456, { name: "Grace", email: "grace@example.com" }]
  ])

  const cache = await Cache.make<
    number,
    { name: string; email: string },
    string
  >({
    capacity: 500,
    lookup: (userId) =>
      suspend(() => {
        const user = users.get(userId)
        return user === undefined
          ? fail(`User ${userId} not found`)
          : succeed(user)
      }),
    timeToLive: "15 minutes"
  })

  const user1 = await Cache.get(cache, 123)
  const user2 = await Cache.get(cache, 123)
  return [user1, user2, user1 === user2] as const
}

const actual = await runPromise(program)
actual // => [{ name: "Ada", email: "ada@example.com" }, { name: "Ada", email: "ada@example.com" }, true]
```

## get

**Getting cached values**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Cache miss - triggers lookup function
  const result1 = await Cache.get(cache, "hello")

  // Cache hit - returns cached value without lookup
  const result2 = await Cache.get(cache, "hello")

  return { result1, result2 }
}

const actual = await runPromise(program)
actual // => { result1: 5, result2: 5 }
```

**Handling lookup failures**

```efx
import { Cache, Effect, Exit } from "effect"

// Error handling when lookup fails
const program = effect {
  const cache = await Cache.make<string, number, string>({
    capacity: 10,
    lookup: (key: string) =>
      key === "error"
        ? fail("Lookup failed")
        : succeed(key.length)
  })

  // Successful lookup
  const success = await Cache.get(cache, "hello")

  // Failed lookup - returns error
  const failure = await exit(Cache.get(cache, "error"))
  return [success, failure] as const
}

const actual = await runPromise(program)
actual // => [5, Exit.fail("Lookup failed")]
```

**Sharing concurrent lookups**

```efx

// Concurrent access - multiple gets of same key only invoke lookup once
const program = effect {
  let lookupCount = 0
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) =>
      sync(() => {
        lookupCount++
        return key.length
      })
  })

  // Multiple concurrent gets
  const results = await [
    Cache.get(cache, "hello"),
    Cache.get(cache, "hello"),
    Cache.get(cache, "hello")
  ]

  return { results, lookupCount }
}

const actual = await runPromise(program)
actual // => { results: [5, 5, 5], lookupCount: 1 }
```

## getOption

**Reading cached values without lookup**

```efx
import { Cache, Effect, Option } from "effect"

const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // No value in cache yet - returns None without lookup
  const empty = await Cache.getOption(cache, "hello")

  // Populate cache using get
  await Cache.get(cache, "hello")

  // Now getOption returns the cached value
  const cached = await Cache.getOption(cache, "hello")
  return [empty, cached] as const
}

const actual = await runPromise(program)
actual // => [Option.none(), Option.some(5)]
```

**Skipping expired entries**

```efx
import { Cache, Effect, Option } from "effect"
import { TestClock } from "effect/testing"

// Expired entries return None
const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length),
    timeToLive: "1 hour"
  })

  // Add value to cache
  await Cache.get(cache, "hello")

  // Value exists before expiration
  const beforeExpiry = await Cache.getOption(cache, "hello")

  // Simulate time passing
  await TestClock.adjust("2 hours")

  // Value expired - returns None
  const afterExpiry = await Cache.getOption(cache, "hello")
  return [beforeExpiry, afterExpiry] as const
}

const actual = await runPromise(provide(program, TestClock.layer()))
actual // => [Option.some(5), Option.none()]
```

**Waiting for pending lookups**

```efx
import { Cache, Deferred, Effect, Fiber, Option } from "effect"

// Waits for ongoing computation to complete
const program = effect {
  const deferred = await Deferred.make<void>()
  const cache = await Cache.make({
    capacity: 10,
    lookup: (_key: string) => Deferred.await(deferred).pipe(as(42))
  })

  // Start lookup in background
  const getFiber = await forkChild(Cache.get(cache, "key"))

  // getOption waits for ongoing computation
  const optionFiber = await forkChild(Cache.getOption(cache, "key"))

  // Complete the computation
  await Deferred.succeed(deferred, void 0)

  const result = await Fiber.join(optionFiber)
  const value = await Fiber.join(getFiber)
  return [result, value] as const
}

const actual = await runPromise(program)
actual // => [Option.some(42), 42]
```

## set

**Setting values directly**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 100,
    lookup: (key: string) => succeed(key.length)
  })

  // Set a value directly without invoking lookup
  await Cache.set(cache, "hello", 42)
  return await Cache.get(cache, "hello")
}

const actual = await runPromise(program)
actual // => 42
```

**Overwriting cached values**

```efx

// Overwriting existing cached values
const program = effect {
  const cache = await Cache.make({
    capacity: 100,
    lookup: (key: string) => succeed(key.length)
  })

  // First get populates via lookup
  const original = await Cache.get(cache, "test") // 4

  // Set overwrites the cached value
  await Cache.set(cache, "test", 999)
  const updated = await Cache.get(cache, "test") // 999

  return { original, updated }
}

const actual = await runPromise(program)
actual // => { original: 4, updated: 999 }
```

**Applying TTL to set values**

```efx

// TTL behavior with set operations
const program = effect {
  const cache = await Cache.make({
    capacity: 100,
    lookup: (key: string) => succeed(key.length),
    timeToLive: "1 hour"
  })

  // Set value with TTL applied
  await Cache.set(cache, "temporary", 123)
  const beforeExpiry = await Cache.has(cache, "temporary")

  // Advance time past TTL
  await TestClock.adjust("2 hours")
  const afterExpiry = await Cache.has(cache, "temporary")
  return [beforeExpiry, afterExpiry]
}

const actual = await runPromise(provide(program, TestClock.layer()))
actual // => [true, false]
```

**Enforcing capacity when setting values**

```efx

// Capacity enforcement with set operations
const program = effect {
  const cache = await Cache.make({
    capacity: 2,
    lookup: (key: string) => succeed(key.length)
  })

  // Fill cache to capacity
  await Cache.set(cache, "a", 1)
  await Cache.set(cache, "b", 2)
  const sizeBeforeEviction = await Cache.size(cache)

  // Adding another entry evicts oldest
  await Cache.set(cache, "c", 3)
  const sizeAfterEviction = await Cache.size(cache)
  const hasOldest = await Cache.has(cache, "a")
  const hasNewest = await Cache.has(cache, "c")
  return [sizeBeforeEviction, sizeAfterEviction, hasOldest, hasNewest]
}

const actual = await runPromise(program)
actual // => [2, 2, false, true]
```

## has

**Checking for cached keys**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 100,
    lookup: (key: string) => succeed(key.length)
  })

  // Check non-existent key
  const missing = await Cache.has(cache, "missing")

  // Add entry and check existence
  await Cache.get(cache, "hello")
  const present = await Cache.has(cache, "hello")
  return [missing, present]
}

const actual = await runPromise(program)
actual // => [false, true]
```

**Checking TTL expiration**

```efx

// TTL expiration behavior
const program = effect {
  const cache = await Cache.make({
    capacity: 100,
    lookup: (key: string) => succeed(key.length),
    timeToLive: "1 hour"
  })

  // Add entry with TTL
  await Cache.get(cache, "expires")
  const initial = await Cache.has(cache, "expires")

  // Still valid before expiration
  await TestClock.adjust("30 minutes")
  const beforeExpiry = await Cache.has(cache, "expires")

  // Expired after TTL
  await TestClock.adjust("31 minutes")
  const afterExpiry = await Cache.has(cache, "expires")
  return [initial, beforeExpiry, afterExpiry]
}

const actual = await runPromise(provide(program, TestClock.layer()))
actual // => [true, true, false]
```

**Checking multiple keys**

```efx

// Checking multiple keys efficiently
const program = effect {
  const cache = await Cache.make({
    capacity: 100,
    lookup: (key: string) => succeed(key.length)
  })

  // Populate some entries
  await Cache.set(cache, "apple", 5)
  await Cache.set(cache, "banana", 6)

  // Check multiple keys
  const keys = ["apple", "banana", "cherry", "date"]
  const results: Array<string> = []
  for (const key of keys) {
    const exists = await Cache.has(cache, key)
    results.push(`${key}: ${exists}`)
  }
  return results
}

const actual = await runPromise(program)
actual // => ["apple: true", "banana: true", "cherry: false", "date: false"]
```

## invalidate

**Invalidating cached entries**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Add a value to the cache
  await Cache.get(cache, "hello")
  const beforeInvalidation = await Cache.has(cache, "hello")

  // Invalidate the entry
  await Cache.invalidate(cache, "hello")
  const afterInvalidation = await Cache.has(cache, "hello")

  // Invalidating non-existent keys doesn't error
  await Cache.invalidate(cache, "nonexistent")

  // Get after invalidation will invoke lookup again
  let lookupCount = 0
  const cache2 = await Cache.make({
    capacity: 10,
    lookup: (key: string) =>
      sync(() => {
        lookupCount++
        return key.length
      })
  })

  await Cache.get(cache2, "test") // lookupCount = 1
  await Cache.invalidate(cache2, "test")
  await Cache.get(cache2, "test") // lookupCount = 2 (lookup called again)
  return { beforeInvalidation, afterInvalidation, lookupCount }
}

const actual = await runPromise(program)
actual // => { beforeInvalidation: true, afterInvalidation: false, lookupCount: 2 }
```

## invalidateWhen

**Invalidating entries conditionally**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Add values to the cache
  await Cache.get(cache, "hello") // value = 5
  await Cache.get(cache, "hi") // value = 2

  // Invalidate when value equals 5
  const invalidated1 = await Cache.invalidateWhen(
    cache,
    "hello",
    (value) => value === 5
  )
  const hasHello = await Cache.has(cache, "hello")

  // Don't invalidate when predicate doesn't match
  const invalidated2 = await Cache.invalidateWhen(
    cache,
    "hi",
    (value) => value === 5
  )
  const hasHi = await Cache.has(cache, "hi")

  // Returns false for non-existent keys
  const invalidated3 = await Cache.invalidateWhen(
    cache,
    "nonexistent",
    () => true
  )

  // Returns false for failed cached values
  const cacheWithErrors = await Cache.make<string, number, string>({
    capacity: 10,
    lookup: (key: string) =>
      key === "fail" ? fail("error") : succeed(key.length)
  })

  await exit(Cache.get(cacheWithErrors, "fail"))
  const invalidated4 = await Cache.invalidateWhen(
    cacheWithErrors,
    "fail",
    () => true
  )
  return [invalidated1, hasHello, invalidated2, hasHi, invalidated3, invalidated4]
}

const actual = await runPromise(program)
actual // => [true, false, false, true, false, false]
```

## refresh

**Refreshing cached values**

```efx

// Force refresh of existing cached values
const program = effect {
  let counter = 0
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => sync(() => `${key}-${++counter}`)
  })

  // Initial cache population
  const value1 = await Cache.get(cache, "user")

  // Get from cache (no lookup)
  const value2 = await Cache.get(cache, "user")

  // Force refresh - always calls lookup
  const refreshed = await Cache.refresh(cache, "user")

  // Subsequent gets return refreshed value
  const value3 = await Cache.get(cache, "user")
  return [value1, value2, refreshed, value3, counter]
}

const actual = await runPromise(program)
actual // => ["user-1", "user-1", "user-2", "user-2", 2]
```

**Resetting TTL on refresh**

```efx

// Refresh resets TTL (Time To Live)
const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length),
    timeToLive: "1 hour"
  })

  await Cache.get(cache, "test")
  await TestClock.adjust("45 minutes")

  // Entry would normally expire in 15 minutes
  const beforeRefresh = await Cache.has(cache, "test")

  // Refresh resets the TTL to full 1 hour
  await Cache.refresh(cache, "test")
  await TestClock.adjust("30 minutes")

  // Still valid because TTL was reset
  const afterRefresh = await Cache.has(cache, "test")
  return [beforeRefresh, afterRefresh]
}

const actual = await runPromise(provide(program, TestClock.layer()))
actual // => [true, true]
```

**Refreshing missing keys**

```efx

// Refresh non-existent keys
const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(`value-for-${key}`)
  })

  // Refresh non-existent key creates new entry
  const result = await Cache.refresh(cache, "newKey")

  // Verify it's now cached
  const cached = await Cache.has(cache, "newKey")
  return [result, cached]
}

const actual = await runPromise(program)
actual // => ["value-for-newKey", true]
```

## invalidateAll

**Invalidating all entries**

```efx

// Clear all cached entries at once
const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Populate cache with multiple entries
  await Cache.get(cache, "apple")
  await Cache.get(cache, "banana")
  await Cache.get(cache, "cherry")

  const sizeBeforeInvalidation = await Cache.size(cache)
  const hasAppleBeforeInvalidation = await Cache.has(cache, "apple")

  // Clear all entries
  await Cache.invalidateAll(cache)

  // Verify cache is empty
  const sizeAfterInvalidation = await Cache.size(cache)
  const hasAppleAfterInvalidation = await Cache.has(cache, "apple")
  const hasBananaAfterInvalidation = await Cache.has(cache, "banana")
  const hasCherryAfterInvalidation = await Cache.has(cache, "cherry")
  return [
    sizeBeforeInvalidation,
    hasAppleBeforeInvalidation,
    sizeAfterInvalidation,
    hasAppleAfterInvalidation,
    hasBananaAfterInvalidation,
    hasCherryAfterInvalidation
  ]
}

const actual = await runPromise(program)
actual // => [3, true, 0, false, false, false]
```

## size

**Reading cache size**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Empty cache has size 0
  const emptySize = await Cache.size(cache)

  // Add entries and check size
  await Cache.get(cache, "hello")
  await Cache.get(cache, "world")
  const sizeAfterAdding = await Cache.size(cache)

  // Size decreases after invalidation
  await Cache.invalidate(cache, "hello")
  const sizeAfterInvalidation = await Cache.size(cache)
  return [emptySize, sizeAfterAdding, sizeAfterInvalidation]
}

const actual = await runPromise(program)
actual // => [0, 2, 1]
```

## keys

**Reading active keys**

```efx

// Basic key enumeration
const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Add some entries to the cache
  await Cache.get(cache, "hello")
  await Cache.get(cache, "world")
  await Cache.get(cache, "cache")

  // Retrieve all active keys
  const keys = await Cache.keys(cache)
  return Array.from(keys).sort()
}

const actual = await runPromise(program)
actual // => ["cache", "hello", "world"]
```

## values

**Reading all cached values**

```efx

const program = effect {
  const cache = await Cache.make({
    capacity: 10,
    lookup: (key: string) => succeed(key.length)
  })

  // Add some values to the cache
  await Cache.get(cache, "a")
  await Cache.get(cache, "ab")
  await Cache.get(cache, "abc")

  // Retrieve all cached values
  const values = await Cache.values(cache)
  return Array.from(values).sort()
}

const actual = await runPromise(program)
actual // => [1, 2, 3]
```
