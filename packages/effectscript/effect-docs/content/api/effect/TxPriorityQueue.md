# effect/TxPriorityQueue

The examples in the JSDoc of `packages/effect/src/TxPriorityQueue.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxPriorityQueue

**Dequeuing values by priority**

```efx
const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  await TxPriorityQueue.offer(pq, 3)
  await TxPriorityQueue.offer(pq, 1)
  await TxPriorityQueue.offer(pq, 2)
  return await TxPriorityQueue.take(pq)
}

await runPromise(program) // => 1
```

## empty

**Creating an empty priority queue**

```efx
const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  return await TxPriorityQueue.isEmpty(pq)
}

await runPromise(program) // => true
```

## fromIterable

**Creating a priority queue from an iterable**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
  return await TxPriorityQueue.take(pq)
}

await runPromise(program) // => 1
```

## make

**Creating a priority queue from variadic values**

```efx
const program = effect {
  const pq = await TxPriorityQueue.make(Order.Number)(3, 1, 2)
  return await TxPriorityQueue.take(pq)
}

await runPromise(program) // => 1
```

## size

**Getting the queue size**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3])
  return await TxPriorityQueue.size(pq)
}

await runPromise(program) // => 3
```

## isEmpty

**Checking whether a queue is empty**

```efx
const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  return await TxPriorityQueue.isEmpty(pq)
}

await runPromise(program) // => true
```

## isNonEmpty

**Checking whether a queue has elements**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [1])
  return await TxPriorityQueue.isNonEmpty(pq)
}

await runPromise(program) // => true
```

## peek

**Peeking at the next value**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
  return await TxPriorityQueue.peek(pq)
}

await runPromise(program) // => 1
```

## peekOption

**Peeking without retrying**

```efx
import { Option } from "effect"

const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  return await TxPriorityQueue.peekOption(pq)
}

await runPromise(program) // => Option.none()
```

## offer

**Offering a value**

```efx
const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  await TxPriorityQueue.offer(pq, 2)
  await TxPriorityQueue.offer(pq, 1)
  return await TxPriorityQueue.take(pq)
}

await runPromise(program) // => 1
```

## offerAll

**Offering multiple values**

```efx
const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  await TxPriorityQueue.offerAll(pq, [3, 1, 2])
  return await TxPriorityQueue.take(pq)
}

await runPromise(program) // => 1
```

## take

**Taking the next value**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
  return await TxPriorityQueue.take(pq)
}

await runPromise(program) // => 1
```

## takeAll

**Taking all values in priority order**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
  return await TxPriorityQueue.takeAll(pq)
}

await runPromise(program) // => [1, 2, 3]
```

## takeOption

**Taking without retrying**

```efx
import { Option } from "effect"

const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  return await TxPriorityQueue.takeOption(pq)
}

await runPromise(program) // => Option.none()
```

## takeUpTo

**Taking up to a limit**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [5, 3, 1, 4, 2])
  return await TxPriorityQueue.takeUpTo(pq, 2)
}

await runPromise(program) // => [1, 2]
```

## removeIf

**Removing matching values**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3, 4, 5])
  await TxPriorityQueue.removeIf(pq, (n) => n % 2 === 0)
  return await TxPriorityQueue.takeAll(pq)
}

await runPromise(program) // => [1, 3, 5]
```

## retainIf

**Retaining matching values**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [1, 2, 3, 4, 5])
  await TxPriorityQueue.retainIf(pq, (n) => n % 2 === 0)
  return await TxPriorityQueue.takeAll(pq)
}

await runPromise(program) // => [2, 4]
```

## toArray

**Reading values in priority order**

```efx
const program = effect {
  const pq = await TxPriorityQueue.fromIterable(Order.Number, [3, 1, 2])
  return await TxPriorityQueue.toArray(pq)
}

await runPromise(program) // => [1, 2, 3]
```

## isTxPriorityQueue

**Checking for a TxPriorityQueue**

```efx
const program = effect {
  const pq = await TxPriorityQueue.empty<number>(Order.Number)
  return [TxPriorityQueue.isTxPriorityQueue(pq), TxPriorityQueue.isTxPriorityQueue("nope")]
}

await runPromise(program) // => [true, false]
```
