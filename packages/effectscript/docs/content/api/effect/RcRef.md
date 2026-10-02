# effect/RcRef

The examples in the JSDoc of `packages/effect/src/RcRef.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## RcRef

**Sharing a lazily acquired resource**

```efx

const events: Array<string> = []

// Create an RcRef for a database connection
const createConnectionRef = (connectionString: string) =>
  RcRef.make({
    acquire: acquireRelease(
      succeed(`Connected to ${connectionString}`),
      (connection) => sync(() => events.push(`closed ${connection}`))
    )
  })

// Use the RcRef in multiple operations
const program = effect {
  const connectionRef = await createConnectionRef("postgres://localhost")

  // Multiple gets will share the same connection
  const connection1 = await RcRef.get(connectionRef)
  const connection2 = await RcRef.get(connectionRef)

  return [connection1 === connection2, events] as const
}

await runPromise(scoped(program)) // => [true, ["closed Connected to postgres://localhost"]]
```

**Referencing namespace types**

```efx
import type { RcRef } from "effect"

// Use RcRef namespace types
type MyRcRef = RcRef.RcRef<string, Error>
type MyVariance = RcRef.RcRef.Variance<string, Error>

```

## make

**Creating a reference-counted resource**

```efx

const events: Array<string> = []

const program = effect {
  const ref = await RcRef.make({
    acquire: acquireRelease(
      succeed("foo"),
      () => sync(() => events.push("released foo"))
    )
  })

  // will only acquire the resource once, and release it
  // when the scope is closed
  await RcRef.get(ref).pipe(
    andThen(RcRef.get(ref)),
    scoped
  )
}

await runPromise(scoped(program))
events // => ["released foo"]
```

## get

**Sharing one acquired value**

```efx

const events: Array<string> = []

const program = effect {
  // Create an RcRef with a resource
  const ref = await RcRef.make({
    acquire: acquireRelease(
      succeed("shared resource"),
      (resource) => sync(() => events.push(`released ${resource}`))
    )
  })

  // Get the value from the RcRef
  const value1 = await RcRef.get(ref)
  const value2 = await RcRef.get(ref)

  return [value1 === value2, events] as const
}

await runPromise(scoped(program)) // => [true, ["released shared resource"]]
```
