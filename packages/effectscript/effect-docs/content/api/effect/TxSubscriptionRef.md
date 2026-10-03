# effect/TxSubscriptionRef

The examples in the JSDoc of `packages/effect/src/TxSubscriptionRef.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxSubscriptionRef

**Subscribing to transactional changes**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(0)

  return await scoped(
    effect {
      const sub = await TxSubscriptionRef.changes(ref)
      const initial = await TxQueue.take(sub)

      await TxSubscriptionRef.set(ref, 1)
      const next = await TxQueue.take(sub)
      return [initial, next]
    }
  )
}

await runPromise(program) // => [0, 1]
```

## make

**Creating a transactional subscription reference**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(42)
  return await TxSubscriptionRef.get(ref)
}

await runPromise(program) // => 42
```

## get

**Reading the current value**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make("hello")
  return await TxSubscriptionRef.get(ref)
}

await runPromise(program) // => "hello"
```

## modify

**Modifying and returning a value**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(10)
  const result = await TxSubscriptionRef.modify(ref, (n) => [`was ${n}`, n + 1])
  return [result, await TxSubscriptionRef.get(ref)]
}

await runPromise(program) // => ["was 10", 11]
```

## set

**Setting a new value**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(0)
  await TxSubscriptionRef.set(ref, 42)
  return await TxSubscriptionRef.get(ref)
}

await runPromise(program) // => 42
```

## update

**Updating a value**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(5)
  await TxSubscriptionRef.update(ref, (n) => n * 2)
  return await TxSubscriptionRef.get(ref)
}

await runPromise(program) // => 10
```

## getAndSet

**Getting and setting atomically**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make("a")
  const old = await TxSubscriptionRef.getAndSet(ref, "b")
  return [old, await TxSubscriptionRef.get(ref)]
}

await runPromise(program) // => ["a", "b"]
```

## getAndUpdate

**Getting and updating atomically**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(1)
  const old = await TxSubscriptionRef.getAndUpdate(ref, (n) => n + 10)
  return [old, await TxSubscriptionRef.get(ref)]
}

await runPromise(program) // => [1, 11]
```

## updateAndGet

**Updating and reading atomically**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(3)
  return await TxSubscriptionRef.updateAndGet(ref, (n) => n * 3)
}

await runPromise(program) // => 9
```

## changes

**Subscribing to changes**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(0)

  return await scoped(
    effect {
      const sub = await TxSubscriptionRef.changes(ref)
      const initial = await TxQueue.take(sub)

      await TxSubscriptionRef.set(ref, 1)
      const next = await TxQueue.take(sub)
      return [initial, next]
    }
  )
}

await runPromise(program) // => [0, 1]
```

## changesStream

**Streaming changes**

```efx
const program = effect {
  const ref = await TxSubscriptionRef.make(0)
  await TxSubscriptionRef.set(ref, 1)
  await TxSubscriptionRef.set(ref, 2)

  const values = await Stream.runCollect(
    TxSubscriptionRef.changesStream(ref).pipe(Stream.take(1))
  )
  return Array.from(values)
}

await runPromise(program) // => [2]
```

## isTxSubscriptionRef

**Checking transactional subscription references**

```efx
import { TxSubscriptionRef } from "effect"

const someValue: unknown = {}
TxSubscriptionRef.isTxSubscriptionRef(someValue) // => false
```
