# effect/TxChunk

The examples in the JSDoc of `packages/effect/src/TxChunk.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxChunk

**Using a transactional chunk**

```efx
const program = effect {
  // Create a transactional chunk
  const txChunk: TxChunk<number> = await TxChunk.fromIterable([
    1,
    2,
    3
  ])

  // Single operations - no explicit transaction needed
  await TxChunk.append(txChunk, 4)
  const result = await TxChunk.get(txChunk)

  // Multi-step atomic operation - use explicit transaction
  await tx(
    effect {
      await TxChunk.prepend(txChunk, 0)
      await TxChunk.append(txChunk, 5)
    }
  )

  const finalResult = await TxChunk.get(txChunk)
  return [Chunk.toArray(result), Chunk.toArray(finalResult)]
}

await runPromise(program) // => [[1, 2, 3, 4], [0, 1, 2, 3, 4, 5]]
```

## make

**Creating a TxChunk from a chunk**

```efx
const program = effect {
  // Create a TxChunk with initial values
  const initialChunk = Chunk.fromIterable([1, 2, 3])
  const txChunk = await TxChunk.make(initialChunk)

  // Read the value - automatically transactional
  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [1, 2, 3]
```

## empty

**Creating an empty TxChunk**

```efx
const program = effect {
  // Create an empty TxChunk
  const txChunk = await TxChunk.empty<number>()

  // Check if it's empty - automatically transactional
  const isEmpty = await TxChunk.isEmpty(txChunk)

  // Add elements - automatically transactional
  await TxChunk.append(txChunk, 42)

  const isStillEmpty = await TxChunk.isEmpty(txChunk)
  return [isEmpty, isStillEmpty]
}

await runPromise(program) // => [true, false]
```

## fromIterable

**Creating from an iterable**

```efx
const program = effect {
  // Create TxChunk from array
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4, 5])

  // Read the contents - automatically transactional
  const chunk = await TxChunk.get(txChunk)

  // Multi-step atomic modification - use explicit transaction
  await tx(
    effect {
      await TxChunk.append(txChunk, 6)
      await TxChunk.prepend(txChunk, 0)
    }
  )

  const updated = await TxChunk.get(txChunk)
  return [Chunk.toArray(chunk), Chunk.toArray(updated)]
}

await runPromise(program) // => [[1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]
```

## makeUnsafe

**Wrapping an existing TxRef**

```efx
// Create a TxChunk from an existing TxRef (advanced usage)
const ref = TxRef.makeUnsafe(Chunk.fromIterable([1, 2, 3]))
const txChunk = TxChunk.makeUnsafe(ref)
Chunk.toArray(await runPromise(TxChunk.get(txChunk))) // => [1, 2, 3]
```

## isTxChunk

**Checking for transactional chunks**

```efx
import { Chunk, TxChunk, TxRef } from "effect"

const txChunk = TxChunk.makeUnsafe(TxRef.makeUnsafe(Chunk.empty<number>()))

TxChunk.isTxChunk(txChunk) // => true
TxChunk.isTxChunk(Chunk.empty()) // => false
```

## modify

**Modifying while returning a value**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3])

  // Modify and return both old size and new chunk
  const oldSize = await TxChunk.modify(txChunk, (chunk) => [
    Chunk.size(chunk), // return value (old size)
    Chunk.append(chunk, 4) // new value
  ])

  const newChunk = await TxChunk.get(txChunk)
  return [oldSize, Chunk.toArray(newChunk)]
}

await runPromise(program) // => [3, [1, 2, 3, 4]]
```

## update

**Updating the stored chunk**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3])

  // Update the chunk by reversing it atomically
  await TxChunk.update(txChunk, (chunk) => Chunk.reverse(chunk))

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [3, 2, 1]
```

## get

**Reading the current chunk**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3])

  // Read the current value within a transaction
  const chunk = await TxChunk.get(txChunk)
  return [Chunk.toArray(chunk), Chunk.size(chunk)]
}

await runPromise(program) // => [[1, 2, 3], 3]
```

## set

**Replacing the stored chunk**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3])

  // Replace the entire chunk content
  const newChunk = Chunk.fromIterable([10, 20, 30, 40])
  await TxChunk.set(txChunk, newChunk)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [10, 20, 30, 40]
```

## append

**Appending an element**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3])

  // Add element to the end atomically
  await TxChunk.append(txChunk, 4)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [1, 2, 3, 4]
```

## prepend

**Prepending an element**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([2, 3, 4])

  // Add element to the beginning atomically
  await TxChunk.prepend(txChunk, 1)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [1, 2, 3, 4]
```

## size

**Getting the size**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4, 5])

  // Get the current size - automatically transactional
  const currentSize = await TxChunk.size(txChunk)

  // Size is tracked for conflict detection
  await TxChunk.append(txChunk, 6)
  const newSize = await TxChunk.size(txChunk)
  return [currentSize, newSize]
}

await runPromise(program) // => [5, 6]
```

## isEmpty

**Checking for an empty chunk**

```efx
const program = effect {
  const emptyChunk = await TxChunk.empty<number>()
  const nonEmptyChunk = await TxChunk.fromIterable([1, 2, 3])

  // Check if chunks are empty - automatically transactional
  const isEmpty1 = await TxChunk.isEmpty(emptyChunk)
  const isEmpty2 = await TxChunk.isEmpty(nonEmptyChunk)

  return [isEmpty1, isEmpty2]
}

await runPromise(program) // => [true, false]
```

## isNonEmpty

**Checking for a non-empty chunk**

```efx
const program = effect {
  const emptyChunk = await TxChunk.empty<number>()
  const nonEmptyChunk = await TxChunk.fromIterable([1, 2, 3])

  // Check if chunks are non-empty - automatically transactional
  const isNonEmpty1 = await TxChunk.isNonEmpty(emptyChunk)
  const isNonEmpty2 = await TxChunk.isNonEmpty(nonEmptyChunk)

  return [isNonEmpty1, isNonEmpty2]
}

await runPromise(program) // => [false, true]
```

## take

**Taking leading elements**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4, 5])

  // Take only the first 3 elements - automatically transactional
  await TxChunk.take(txChunk, 3)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [1, 2, 3]
```

## drop

**Dropping leading elements**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4, 5])

  // Drop the first 2 elements - automatically transactional
  await TxChunk.drop(txChunk, 2)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [3, 4, 5]
```

## slice

**Taking a slice**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4, 5, 6, 7])

  // Take elements from index 2 to 5 (exclusive) - automatically transactional
  await TxChunk.slice(txChunk, 2, 5)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [3, 4, 5]
```

## map

**Mapping elements**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4])

  // Transform each element atomically (must maintain same type)
  await TxChunk.map(txChunk, (n) => n * 2)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [2, 4, 6, 8]
```

## filter

**Filtering elements**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3, 4, 5, 6])

  // Keep only even numbers atomically
  await TxChunk.filter(txChunk, (n) => n % 2 === 0)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [2, 4, 6]
```

## appendAll

**Appending another chunk**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([1, 2, 3])
  const otherChunk = Chunk.fromIterable([4, 5, 6])

  // Append all elements from another chunk atomically
  await TxChunk.appendAll(txChunk, otherChunk)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [1, 2, 3, 4, 5, 6]
```

## prependAll

**Prepending another chunk**

```efx
const program = effect {
  const txChunk = await TxChunk.fromIterable([4, 5, 6])
  const otherChunk = Chunk.fromIterable([1, 2, 3])

  // Prepend all elements from another chunk atomically
  await TxChunk.prependAll(txChunk, otherChunk)

  const result = await TxChunk.get(txChunk)
  return Chunk.toArray(result)
}

await runPromise(program) // => [1, 2, 3, 4, 5, 6]
```

## concat

**Concatenating TxChunks**

```efx
const program = effect {
  const txChunk1 = await TxChunk.fromIterable([1, 2, 3])
  const txChunk2 = await TxChunk.fromIterable([4, 5, 6])

  // Concatenate atomically within a transaction
  await TxChunk.concat(txChunk1, txChunk2)

  const result = await TxChunk.get(txChunk1)

  // Original txChunk2 is unchanged
  const original = await TxChunk.get(txChunk2)
  return [Chunk.toArray(result), Chunk.toArray(original)]
}

await runPromise(program) // => [[1, 2, 3, 4, 5, 6], [4, 5, 6]]
```
