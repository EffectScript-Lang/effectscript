# effect/TxRef

The examples in the JSDoc of `packages/effect/src/TxRef.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxRef

**Using a transactional reference**

```efx

const program = effect {
  // Create a transactional reference
  const ref: TxRef<number> = await TxRef.make(0)

  // Use within a transaction
  await tx(effect {
    const current = await TxRef.get(ref)
    await TxRef.set(ref, current + 1)
  })

  return await TxRef.get(ref)
}

await runPromise(program) // => 1
```

## make

**Creating transactional references**

```efx

const program = effect {
  // Create a transactional reference with initial value
  const counter = await TxRef.make(0)
  const name = await TxRef.make("Alice")

  // Use in transactions
  await tx(effect {
    await TxRef.set(counter, 42)
    await TxRef.set(name, "Bob")
  })

  return [await TxRef.get(counter), await TxRef.get(name)]
}

await runPromise(program) // => [42, "Bob"]
```

## makeUnsafe

**Creating transactional references unsafely**

```efx
import { TxRef } from "effect"

// Create a TxRef synchronously (unsafe - use make instead in Effect contexts)
const counter = TxRef.makeUnsafe(0)
const config = TxRef.makeUnsafe({ timeout: 5000, retries: 3 })

// These are now ready to use in transactions
counter.value // => 0
config.value // => { timeout: 5000, retries: 3 }
```

## modify

**Modifying transactional references**

```efx

const program = effect {
  const counter = await TxRef.make(0)

  // Modify and return both old and new value
  const result = await TxRef.modify(counter, (current) => [current * 2, current + 1])

  return [result, await TxRef.get(counter)]
}

await runPromise(program) // => [0, 1]
```

## update

**Updating transactional references**

```efx

const program = effect {
  const counter = await TxRef.make(10)

  // Update the value using a function
  await tx(
    TxRef.update(counter, (current) => current * 2)
  )

  return await TxRef.get(counter)
}

await runPromise(program) // => 20
```

## get

**Reading transactional references**

```efx

const program = effect {
  const counter = await TxRef.make(42)

  // Read the value within a transaction
  const value = await tx(
    TxRef.get(counter)
  )

  return value
}

await runPromise(program) // => 42
```

## set

**Setting transactional references**

```efx

const program = effect {
  const counter = await TxRef.make(0)

  // Set a new value within a transaction
  await tx(
    TxRef.set(counter, 100)
  )

  return await TxRef.get(counter)
}

await runPromise(program) // => 100
```
