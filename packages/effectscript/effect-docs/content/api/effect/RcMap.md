# effect/RcMap

The examples in the JSDoc of `packages/effect/src/RcMap.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## RcMap

**Inspecting a reference-counted map**

```efx

const program = effect {
  // Create an RcMap that manages database connections
  const dbConnectionMap = await RcMap.make({
    lookup: (dbName: string) =>
      acquireRelease(succeed(`Connection to ${dbName}`), () => Effect.void),
    capacity: 10,
    idleTimeToLive: "5 minutes"
  })

  // The RcMap interface provides access to:
  // - lookup: Function to acquire resources
  // - capacity: Maximum number of resources
  // - idleTimeToLive: Time before idle resources are released
  // - state: Current state of the map

  return dbConnectionMap.capacity
}

await runPromise(scoped(program)) // => 10
```

## make

**Creating a reference-counted map**

```efx

const events: Array<string> = []

const program = effect {
  const map = await RcMap.make({
    lookup: (key: string) =>
      acquireRelease(
        succeed(`acquired ${key}`),
        () => sync(() => events.push(`released ${key}`))
      )
  })

  // Get "foo" from the map twice, which will only acquire it once.
  // It will then be released once the scope closes.
  await RcMap.get(map, "foo").pipe(
    andThen(RcMap.get(map, "foo")),
    scoped
  )
}

await runPromise(scoped(program))
events // => ["released foo"]
```

## get

**Acquiring a resource**

```efx

const events: Array<string> = []

const program = effect {
  const map = await RcMap.make({
    lookup: (key: string) =>
      acquireRelease(
        succeed(`Resource: ${key}`),
        () => sync(() => events.push(`released ${key}`))
      )
  })

  // Get a resource - it will be acquired on first access
  const resource = await RcMap.get(map, "database")
  return [resource, events] as const
}

await runPromise(scoped(program)) // => ["Resource: database", ["released database"]]
```

## getOption

**Retaining only cached resources**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const map = await RcMap.make({
    lookup: (key: string) => succeed(`Resource: ${key}`),
    idleTimeToLive: "1 minute"
  })

  const missing = await RcMap.getOption(map, "database")
  await scoped(RcMap.get(map, "database"))
  const cached = await scoped(RcMap.getOption("database")(map))

  return [missing, cached] as const
}

await runPromise(scoped(program)) // => [Option.none(), Option.some("Resource: database")]
```

## keys

**Listing keys**

```efx

const program = effect {
  const map = await RcMap.make({
    lookup: (key: string) => succeed(`value-${key}`)
  })

  // Add some resources to the map
  await RcMap.get(map, "foo")
  await RcMap.get(map, "bar")
  await RcMap.get(map, "baz")

  // Get all keys currently in the map
  const allKeys = await RcMap.keys(map)
  return Array.from(allKeys)
}

await runPromise(scoped(program)) // => ["foo", "bar", "baz"]
```

## invalidate

**Invalidating a resource**

```efx

const events: Array<string> = []

const program = effect {
  const map = await RcMap.make({
    lookup: (key: string) =>
      acquireRelease(
        succeed(`Resource: ${key}`),
        () => sync(() => events.push(`released ${key}`))
      )
  })

  // Get a resource
  await RcMap.get(map, "cache")

  // Invalidate the resource - it will be removed from the map
  // and released if no longer in use
  await RcMap.invalidate(map, "cache")

  // Next access will create a new resource
  await RcMap.get(map, "cache")
}

await runPromise(scoped(program))
events // => ["released cache", "released cache"]
```

## touch

**Extending resource idle time**

```efx

const events: Array<string> = []

const program = effect {
  const map = await RcMap.make({
    lookup: (key: string) =>
      acquireRelease(
        succeed(`Resource: ${key}`),
        () => sync(() => events.push(`released ${key}`))
      ),
    idleTimeToLive: "10 seconds"
  })

  // Get a resource
  await RcMap.get(map, "session")

  // Touch the resource to extend its idle time
  // This resets the 10-second expiration timer
  await RcMap.touch(map, "session")

  // The resource will now live for another 10 seconds
  // from the time it was touched
}

await runPromise(scoped(program))
events // => ["released session"]
```
