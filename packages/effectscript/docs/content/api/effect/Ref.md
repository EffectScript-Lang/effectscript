# effect/Ref

The examples in the JSDoc of `packages/effect/src/Ref.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Ref

**Reading and updating a ref**

```efx

const program = effect {
  const counter = await Ref.make(0)
  const value = await Ref.get(counter)
  await Ref.update(counter, (n) => n + 1)
  const newValue = await Ref.get(counter)
  return [value, newValue]
}

await runPromise(program) // => [0, 1]
```

## Ref.Variance

**Using invariant refs**

```efx

const program = effect {
  const ref = await Ref.make(42)
  const value = await Ref.get(ref)
  await Ref.set(ref, value + 1)
  return await Ref.get(ref)
}

await runPromise(program) // => 43
```

## makeUnsafe

**Creating a ref unsafely**

```efx
import { Ref } from "effect"

const counter = Ref.makeUnsafe(0)
Ref.getUnsafe(counter) // => 0
```

## make

**Creating a ref**

```efx

const program = effect {
  const ref = await Ref.make(42)
  return await Ref.get(ref)
}

await runPromise(program) // => 42
```

## get

**Getting the current value**

```efx

const program = effect {
  const ref = await Ref.make(42)
  return await Ref.get(ref)
}

await runPromise(program) // => 42
```

## set

**Setting a value**

```efx

const program = effect {
  const ref = await Ref.make(0)
  await Ref.set(ref, 42)
  return await Ref.get(ref)
}

const program2 = effect {
  const ref = await Ref.make(0)
  await Ref.set(ref, 100)
  return await Ref.get(ref)
}

await runPromise(program) // => 42
await runPromise(program2) // => 100
```

## getAndSet

**Replacing a value atomically**

```efx

const program = effect {
  const ref = await Ref.make("initial")

  const previous = await Ref.getAndSet(ref, "updated")
  const current = await Ref.get(ref)
  return [previous, current]
}

await runPromise(program) // => ["initial", "updated"]
```

## getAndUpdate

**Updating and returning the previous value**

```efx

const program = effect {
  const counter = await Ref.make(10)

  const previous = await Ref.getAndUpdate(counter, (n) => n * 2)
  const current = await Ref.get(counter)
  return [previous, current]
}

await runPromise(program) // => [10, 20]
```

## getAndUpdateSome

**Conditionally updating and returning the previous value**

```efx

const program = effect {
  const counter = await Ref.make(5)

  const previous1 = await Ref.getAndUpdateSome(
    counter,
    (n) => n > 3 ? Option.some(n * 2) : Option.none()
  )
  const current1 = await Ref.get(counter)
  const previous2 = await Ref.getAndUpdateSome(
    counter,
    (n) => n < 3 ? Option.some(n * 2) : Option.none()
  )
  const current2 = await Ref.get(counter)
  return [previous1, current1, previous2, current2]
}

await runPromise(program) // => [5, 10, 10, 10]
```

## setAndGet

**Setting and returning the new value**

```efx

const program = effect {
  const ref = await Ref.make(10)

  const newValue = await Ref.setAndGet(ref, 42)
  const current = await Ref.get(ref)
  return [newValue, current]
}

const program2 = effect {
  const counter = await Ref.make(0)
  return await Ref.setAndGet(counter, 20)
}

await runPromise(program) // => [42, 42]
await runPromise(program2) // => 20
```

## modify

**Modifying a value atomically**

```efx

const program = effect {
  const counter = await Ref.make(10)

  const result = await Ref.modify(counter, (n) => [
    `Previous value was ${n}`,
    n * 2
  ])
  const current = await Ref.get(counter)
  return [result, current]
}

const program2 = effect {
  const state = await Ref.make({ count: 0, total: 0 })
  return await Ref.modify(state, (s) => [
    s.count,
    { count: s.count + 1, total: s.total + s.count + 1 }
  ])
}

await runPromise(program) // => ["Previous value was 10", 20]
await runPromise(program2) // => 0
```

## modifySome

**Conditionally modifying a value**

```efx

const program = effect {
  const counter = await Ref.make(5)

  const result1 = await Ref.modifySome(
    counter,
    (n) =>
      n > 3
        ? [`incremented ${n}`, Option.some(n + 10)]
        : ["no change", Option.none()]
  )
  const current1 = await Ref.get(counter)
  const result2 = await Ref.modifySome(
    counter,
    (n) =>
      n < 10
        ? [`decremented ${n}`, Option.some(n - 5)]
        : ["no change", Option.none()]
  )
  const current2 = await Ref.get(counter)
  return [result1, current1, result2, current2]
}

await runPromise(program) // => ["incremented 5", 15, "no change", 15]
```

## update

**Updating a value**

```efx

const program = effect {
  const counter = await Ref.make(5)

  await Ref.update(counter, (n) => n * 2)
  return await Ref.get(counter)
}

const program2 = effect {
  const counter = await Ref.make(5)
  await Ref.update(counter, (n: number) => n + 10)
  return await Ref.get(counter)
}

await runPromise(program) // => 10
await runPromise(program2) // => 15
```

## updateAndGet

**Updating and returning the new value**

```efx

const program = effect {
  const counter = await Ref.make(5)

  const newValue = await Ref.updateAndGet(counter, (n) => n * 3)
  const current = await Ref.get(counter)
  return [newValue, current]
}

await runPromise(program) // => [15, 15]
```

## updateSome

**Conditionally updating a value**

```efx

const program = effect {
  const counter = await Ref.make(5)

  await Ref.updateSome(
    counter,
    (n) => n % 2 === 0 ? Option.some(n * 2) : Option.none()
  )
  const before = await Ref.get(counter)
  await Ref.set(counter, 6)
  await Ref.updateSome(
    counter,
    (n) => n % 2 === 0 ? Option.some(n * 2) : Option.none()
  )
  const after = await Ref.get(counter)
  return [before, after]
}

await runPromise(program) // => [5, 12]
```

## updateSomeAndGet

**Conditionally updating and returning the current value**

```efx

const program = effect {
  const counter = await Ref.make(10)

  const result1 = await Ref.updateSomeAndGet(
    counter,
    (n) => n > 5 ? Option.some(n / 2) : Option.none()
  )
  const result2 = await Ref.updateSomeAndGet(
    counter,
    (n) => n > 5 ? Option.some(n / 2) : Option.none()
  )
  return [result1, result2]
}

await runPromise(program) // => [5, 5]
```

## getUnsafe

**Reading a ref unsafely**

```efx
import { Ref } from "effect"

const counter = Ref.makeUnsafe(42)
Ref.getUnsafe(counter) // => 42
```
