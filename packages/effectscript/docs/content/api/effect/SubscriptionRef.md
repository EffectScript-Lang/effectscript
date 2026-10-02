# effect/SubscriptionRef

The examples in the JSDoc of `packages/effect/src/SubscriptionRef.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## changes

**Streaming changes**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(0)
  const ready = await Deferred.make<void>()

  const fiber = await SubscriptionRef.changes(ref).pipe(
    Stream.tap(() => Deferred.succeed(ready, void 0)),
    Stream.take(3),
    Stream.runCollect,
    forkChild
  )

  await Deferred.await(ready)
  await SubscriptionRef.set(ref, 1)
  await SubscriptionRef.set(ref, 2)

  const values = await Fiber.join(fiber)
  return Array.from(values)
}

await runPromise(program) // => [0, 1, 2]
```

## getUnsafe

**Reading the current value unsafely**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(42)

  return SubscriptionRef.getUnsafe(ref)
}

await runPromise(program) // => 42
```

## get

**Reading the current value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(42)

  return await SubscriptionRef.get(ref)
}

await runPromise(program) // => 42
```

## getAndSet

**Getting and setting a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const oldValue = await SubscriptionRef.getAndSet(ref, 20)
  const newValue = await SubscriptionRef.get(ref)
  return [oldValue, newValue]
}

await runPromise(program) // => [10, 20]
```

## getAndUpdate

**Getting and updating a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const oldValue = await SubscriptionRef.getAndUpdate(ref, (n) => n * 2)
  const newValue = await SubscriptionRef.get(ref)
  return [oldValue, newValue]
}

await runPromise(program) // => [10, 20]
```

## getAndUpdateEffect

**Getting and updating with an effect**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const oldValue = await SubscriptionRef.getAndUpdateEffect(
    ref,
    (n) => succeed(n + 5)
  )
  const newValue = await SubscriptionRef.get(ref)
  return [oldValue, newValue]
}

await runPromise(program) // => [10, 15]
```

## getAndUpdateSome

**Getting and conditionally updating a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const oldValue = await SubscriptionRef.getAndUpdateSome(
    ref,
    (n) => n > 5 ? Option.some(n * 2) : Option.none()
  )
  const newValue = await SubscriptionRef.get(ref)
  return [oldValue, newValue]
}

await runPromise(program) // => [10, 20]
```

## getAndUpdateSomeEffect

**Getting and conditionally updating with an effect**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const oldValue = await SubscriptionRef.getAndUpdateSomeEffect(
    ref,
    (n) => succeed(n > 5 ? Option.some(n + 3) : Option.none())
  )
  const newValue = await SubscriptionRef.get(ref)
  return [oldValue, newValue]
}

await runPromise(program) // => [10, 13]
```

## modify

**Modifying a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const result = await SubscriptionRef.modify(ref, (n) => [
    `Old value was ${n}`,
    n * 2
  ])
  const newValue = await SubscriptionRef.get(ref)
  return [result, newValue]
}

await runPromise(program) // => ["Old value was 10", 20]
```

## modifyEffect

**Modifying with an effect**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const result = await SubscriptionRef.modifyEffect(
    ref,
    (n) => succeed([`Doubled from ${n}`, n * 2] as const)
  )
  const newValue = await SubscriptionRef.get(ref)
  return [result, newValue]
}

await runPromise(program) // => ["Doubled from 10", 20]
```

## modifySome

**Conditionally modifying a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const result = await SubscriptionRef.modifySome(
    ref,
    (n) =>
      n > 5 ? ["Updated", Option.some(n * 2)] : ["Not updated", Option.none()]
  )
  const newValue = await SubscriptionRef.get(ref)
  return [result, newValue]
}

await runPromise(program) // => ["Updated", 20]
```

## modifySomeEffect

**Conditionally modifying with an effect**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  const result = await SubscriptionRef.modifySomeEffect(
    ref,
    (n) =>
      succeed(
        n > 5
          ? (["Updated", Option.some(n + 5)] as const)
          : (["Not updated", Option.none()] as const)
      )
  )
  const newValue = await SubscriptionRef.get(ref)
  return [result, newValue]
}

await runPromise(program) // => ["Updated", 15]
```

## set

**Setting a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(0)

  await SubscriptionRef.set(ref, 42)

  return await SubscriptionRef.get(ref)
}

await runPromise(program) // => 42
```

## setAndGet

**Setting and reading the new value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(0)

  return await SubscriptionRef.setAndGet(ref, 42)
}

await runPromise(program) // => 42
```

## update

**Updating a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  await SubscriptionRef.update(ref, (n) => n * 2)

  return await SubscriptionRef.get(ref)
}

await runPromise(program) // => 20
```

## updateEffect

**Updating with an effect**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  await SubscriptionRef.updateEffect(ref, (n) => succeed(n + 5))

  return await SubscriptionRef.get(ref)
}

await runPromise(program) // => 15
```

## updateAndGet

**Updating and reading the new value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  return await SubscriptionRef.updateAndGet(ref, (n) => n * 2)
}

await runPromise(program) // => 20
```

## updateAndGetEffect

**Updating with an effect and reading the new value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  return await SubscriptionRef.updateAndGetEffect(
    ref,
    (n) => succeed(n + 5)
  )
}

await runPromise(program) // => 15
```

## updateSome

**Conditionally updating a value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  await SubscriptionRef.updateSome(
    ref,
    (n) => n > 5 ? Option.some(n * 2) : Option.none()
  )

  return await SubscriptionRef.get(ref)
}

await runPromise(program) // => 20
```

## updateSomeEffect

**Conditionally updating with an effect**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  await SubscriptionRef.updateSomeEffect(
    ref,
    (n) => succeed(n > 5 ? Option.some(n + 3) : Option.none())
  )

  return await SubscriptionRef.get(ref)
}

await runPromise(program) // => 13
```

## updateSomeAndGet

**Conditionally updating and reading the new value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  return await SubscriptionRef.updateSomeAndGet(
    ref,
    (n) => n > 5 ? Option.some(n * 2) : Option.none()
  )
}

await runPromise(program) // => 20
```

## updateSomeAndGetEffect

**Conditionally updating with an effect and reading the new value**

```efx

const program = effect {
  const ref = await SubscriptionRef.make(10)

  return await SubscriptionRef.updateSomeAndGetEffect(
    ref,
    (n) => succeed(n > 5 ? Option.some(n + 3) : Option.none())
  )
}

await runPromise(program) // => 13
```
