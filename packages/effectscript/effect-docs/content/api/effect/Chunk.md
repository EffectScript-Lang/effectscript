# effect/Chunk

The examples in the JSDoc of `packages/effect/src/Chunk.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Chunk

**Inspecting chunk values**

```efx
import { Chunk } from "effect"

const chunk: Chunk.Chunk<number> = Chunk.make(1, 2, 3)
chunk.length // => 3
Chunk.toArray(chunk) // => [1, 2, 3]
```

**Working with Chunk utility types**

```efx
import type { Chunk } from "effect"

// Extract the element type from a Chunk
declare const chunk: Chunk.Chunk<string>
type ElementType = Chunk.Chunk.Infer<typeof chunk> // string

// Create a preserving non-emptiness
declare const nonEmptyChunk: Chunk.NonEmptyChunk<number>
type WithString = Chunk.Chunk.With<typeof nonEmptyChunk, string> // Chunk.NonEmptyChunk<string>
```

## NonEmptyChunk

**Working with non-empty chunks**

```efx
import { Chunk } from "effect"

const nonEmptyChunk: Chunk.NonEmptyChunk<number> = Chunk.make(1, 2, 3)
Chunk.headNonEmpty(nonEmptyChunk) // => 1
Chunk.lastNonEmpty(nonEmptyChunk) // => 3
```

## ChunkTypeLambda

**Applying the Chunk type lambda**

```efx
import type { Chunk, HKT } from "effect"

// Create a Chunk type using the type lambda
type NumberChunk = HKT.Kind<Chunk.ChunkTypeLambda, never, never, never, number>
// Equivalent to: Chunk<number>
```

## makeEquivalence

**Comparing chunks for equivalence**

```efx
import { Chunk, Equivalence } from "effect"

const chunk1 = Chunk.make(1, 2, 3)
const chunk2 = Chunk.make(1, 2, 3)
const chunk3 = Chunk.make(1, 2, 4)

const eq = Chunk.makeEquivalence(Equivalence.strictEqual<number>())
eq(chunk1, chunk2) // => true
eq(chunk1, chunk3) // => false
```

## isChunk

**Checking for chunks**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3)
const array = [1, 2, 3]

Chunk.isChunk(chunk) // => true
Chunk.isChunk(array) // => false
Chunk.isChunk("string") // => false
```

## empty

**Creating an empty chunk**

```efx
import { Chunk } from "effect"

Chunk.size(Chunk.empty()) // => 0
```

## make

**Creating a non-empty chunk**

```efx
import { Chunk } from "effect"

Chunk.toArray(Chunk.make(1, 2, 3, 4)) // => [1, 2, 3, 4]
```

## of

**Creating a single-element chunk**

```efx
import { Chunk } from "effect"

Chunk.toArray(Chunk.of("hello")) // => ["hello"]
```

## fromIterable

**Creating chunks from iterables**

```efx
import { Chunk } from "effect"

Chunk.toArray(Chunk.fromIterable([1, 2, 3])) // => [1, 2, 3]
```

## toArray

**Converting chunks to mutable arrays**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3)
const array = Chunk.toArray(chunk)
array // => [1, 2, 3]
Array.isArray(array) // => true

// With empty chunk
Chunk.toArray(Chunk.empty<number>()) // => []
```

## toReadonlyArray

**Converting chunks to readonly arrays**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3)
const readonlyArray = Chunk.toReadonlyArray(chunk)
readonlyArray // => [1, 2, 3]

// The result is read-only, modifications would cause TypeScript errors
// readonlyArray[0] = 10 // TypeScript error

// With empty chunk
Chunk.toReadonlyArray(Chunk.empty<number>()) // => []
```

## reverse

**Reversing chunks**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3)
Chunk.toArray(Chunk.reverse(chunk)) // => [3, 2, 1]
```

## get

**Accessing elements safely**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make("a", "b", "c", "d")

Chunk.get(chunk, 1) // => Option.some("b")
Chunk.get(chunk, 10) // => Option.none()
Chunk.get(chunk, -1) // => Option.none()

// Using pipe syntax
chunk.pipe(Chunk.get(2)) // => Option.some("c")
```

## fromArrayUnsafe

**Creating chunks without copying arrays**

```efx
import { Chunk } from "effect"

const array = [1, 2, 3, 4, 5]
const chunk = Chunk.fromArrayUnsafe(array)
Chunk.toArray(chunk) // => [1, 2, 3, 4, 5]

// Warning: Since this doesn't copy the array, mutations affect the chunk
array[0] = 999
Chunk.toArray(chunk) // => [999, 2, 3, 4, 5]
```

## fromNonEmptyArrayUnsafe

**Creating non-empty chunks without copying arrays**

```efx
import { Array, Chunk } from "effect"

const nonEmptyArray = Array.make(1, 2, 3, 4, 5)
const chunk = Chunk.fromNonEmptyArrayUnsafe(nonEmptyArray)
Chunk.toArray(chunk) // => [1, 2, 3, 4, 5]

// The result is guaranteed to be non-empty
Chunk.isNonEmpty(chunk) // => true
```

## getUnsafe

**Accessing elements unsafely**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make("a", "b", "c", "d")

Chunk.getUnsafe(chunk, 1) // => "b"
Chunk.getUnsafe(chunk, 3) // => "d"

// Use Chunk.get when the index may be out of bounds
Option.isNone(Chunk.get(chunk, 10)) // => true
```

## append

**Appending an element**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3)
Chunk.toArray(Chunk.append(chunk, 4)) // => [1, 2, 3, 4]

// Appending to empty chunk
const emptyChunk = Chunk.empty<number>()
Chunk.toArray(Chunk.append(emptyChunk, 42)) // => [42]
```

## prepend

**Prepending an element**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(2, 3, 4)
Chunk.toArray(Chunk.prepend(chunk, 1)) // => [1, 2, 3, 4]

// Prepending to empty chunk
const emptyChunk = Chunk.empty<string>()
Chunk.toArray(Chunk.prepend(emptyChunk, "first")) // => ["first"]
```

## take

**Taking elements from the start**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.toArray(Chunk.take(chunk, 3)) // => [1, 2, 3]
```

## drop

**Dropping elements from the start**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.toArray(Chunk.drop(chunk, 2)) // => [3, 4, 5]
```

## dropRight

**Dropping elements from the end**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.toArray(Chunk.dropRight(chunk, 2)) // => [1, 2, 3]
```

## dropWhile

**Dropping elements while a predicate matches**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.toArray(Chunk.dropWhile(chunk, (n) => n < 3)) // => [3, 4, 5]
```

## prependAll

**Prepending all elements**

```efx
import { Chunk } from "effect"

Chunk.make(1, 2).pipe(
  Chunk.prependAll(Chunk.make("a", "b")),
  Chunk.toArray
) // => ["a", "b", 1, 2]
```

## appendAll

**Appending all elements**

```efx
import { Chunk } from "effect"

Chunk.make(1, 2).pipe(
  Chunk.appendAll(Chunk.make("a", "b")),
  Chunk.toArray
) // => [1, 2, "a", "b"]
```

## filterMap

**Filtering and mapping values**

```efx
import { Chunk, Result } from "effect"

const chunk = Chunk.make("1", "2", "hello", "3", "world")
const numbers = Chunk.filterMap(chunk, (str) => {
  const num = parseInt(str)
  return isNaN(num) ? Result.failVoid : Result.succeed(num)
})
Chunk.toArray(numbers) // => [1, 2, 3]

// With index parameter
const evenIndexNumbers = Chunk.filterMap(chunk, (str, i) => {
  const num = parseInt(str)
  return isNaN(num) || i % 2 !== 0 ? Result.failVoid : Result.succeed(num)
})
Chunk.toArray(evenIndexNumbers) // => [1]
```

## filter

**Filtering values**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5, 6)
const evenNumbers = Chunk.filter(chunk, (n) => n % 2 === 0)
Chunk.toArray(evenNumbers) // => [2, 4, 6]

// With refinement
const mixed = Chunk.make("hello", 42, "world", 100)
const numbers = Chunk.filter(mixed, (x): x is number => typeof x === "number")
Chunk.toArray(numbers) // => [42, 100]
```

## filterMapWhile

**Filtering and mapping while values match**

```efx
import { Chunk, Result } from "effect"

const chunk = Chunk.make("1", "2", "hello", "3", "4")
Chunk.toArray(Chunk.filterMapWhile(chunk, (s) => {
  const n = Number(s)
  return Number.isNaN(n) ? Result.failVoid : Result.succeed(n)
})) // => [1, 2]

Chunk.toArray(Chunk.filterMap(chunk, (s) => {
  const n = Number(s)
  return Number.isNaN(n) ? Result.failVoid : Result.succeed(n)
})) // => [1, 2, 3, 4]
```

## compact

**Compacting optional values**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(Option.some(1), Option.none(), Option.some(3))
Chunk.toArray(Chunk.compact(chunk)) // => [1, 3]
```

## flatMap

**Flat mapping chunks**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3)
const duplicated = Chunk.flatMap(chunk, (n) => Chunk.make(n, n))
Chunk.toArray(duplicated) // => [1, 1, 2, 2, 3, 3]

// Flattening nested arrays
const words = Chunk.make("hello", "world")
const letters = Chunk.flatMap(
  words,
  (word) => Chunk.fromIterable(word.split(""))
)
Chunk.toArray(letters).join("") // => "helloworld"

// With index parameter
const indexed = Chunk.flatMap(chunk, (n, i) => Chunk.make(n + i))
Chunk.toArray(indexed) // => [1, 3, 5]
```

## forEach

**Iterating over chunk values**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4)

const values: Array<string> = []
Chunk.forEach(chunk, (n) => values.push(`Value: ${n}`))
values // => ["Value: 1", "Value: 2", "Value: 3", "Value: 4"]

// With index parameter
const indexed: Array<string> = []
Chunk.forEach(chunk, (n, i) => indexed.push(`Index ${i}: ${n}`))
indexed // => ["Index 0: 1", "Index 1: 2", "Index 2: 3", "Index 3: 4"]
```

## flatten

**Flattening nested chunks**

```efx
import { Chunk } from "effect"

const nested = Chunk.make(
  Chunk.make(1, 2),
  Chunk.make(3, 4, 5),
  Chunk.make(6)
)
Chunk.toArray(Chunk.flatten(nested)) // => [1, 2, 3, 4, 5, 6]

// With empty chunks
const withEmpty = Chunk.make(
  Chunk.make(1, 2),
  Chunk.empty<number>(),
  Chunk.make(3, 4)
)
Chunk.toArray(Chunk.flatten(withEmpty)) // => [1, 2, 3, 4]
```

## chunksOf

**Splitting into fixed-size chunks**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5, 6, 7, 8, 9)
const chunked = Chunk.chunksOf(chunk, 3)

Chunk.toArray(chunked).map(Chunk.toArray) // => [[1, 2, 3], [4, 5, 6], [7, 8, 9]]

// When length is not evenly divisible
const chunk2 = Chunk.make(1, 2, 3, 4, 5)
const chunked2 = Chunk.chunksOf(chunk2, 2)
Chunk.toArray(chunked2).map(Chunk.toArray) // => [[1, 2], [3, 4], [5]]
```

## intersection

**Intersecting chunks**

```efx
import { Chunk } from "effect"

const chunk1 = Chunk.make(1, 2, 3, 4)
const chunk2 = Chunk.make(3, 4, 5, 6)
Chunk.toArray(Chunk.intersection(chunk1, chunk2)) // => [3, 4]

// With strings
const words1 = Chunk.make("hello", "world", "foo")
const words2 = Chunk.make("world", "bar", "foo")
Chunk.toArray(Chunk.intersection(words1, words2)) // => ["world", "foo"]

// No intersection
const chunk3 = Chunk.make(1, 2)
const chunk4 = Chunk.make(3, 4)
Chunk.toArray(Chunk.intersection(chunk3, chunk4)) // => []
```

## isEmpty

**Checking for empty chunks**

```efx
import { Chunk } from "effect"

Chunk.isEmpty(Chunk.empty()) // => true
Chunk.isEmpty(Chunk.make(1, 2, 3)) // => false
```

## isNonEmpty

**Checking for non-empty chunks**

```efx
import { Chunk } from "effect"

Chunk.isNonEmpty(Chunk.empty()) // => false
Chunk.isNonEmpty(Chunk.make(1, 2, 3)) // => true
```

## head

**Getting the first element**

```efx
import { Chunk, Option } from "effect"

Chunk.head(Chunk.empty()) // => Option.none()
Chunk.head(Chunk.make(1, 2, 3)) // => Option.some(1)
```

## headUnsafe

**Getting the first element unsafely**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4)
Chunk.headUnsafe(chunk) // => 1

const singleElement = Chunk.make("hello")
Chunk.headUnsafe(singleElement) // => "hello"

// Use Chunk.head when the chunk may be empty
Option.isNone(Chunk.head(Chunk.empty())) // => true
```

## headNonEmpty

**Getting the first element of a non-empty chunk**

```efx
import { Chunk } from "effect"

const nonEmptyChunk = Chunk.make(1, 2, 3, 4)
Chunk.headNonEmpty(nonEmptyChunk) // => 1

const singleElement = Chunk.make("hello")
Chunk.headNonEmpty(singleElement) // => "hello"

// Type safety: this function only accepts NonEmptyChunk
// Chunk.headNonEmpty(Chunk.empty()) // TypeScript error
```

## last

**Getting the last element**

```efx
import { Chunk, Option } from "effect"

Chunk.last(Chunk.empty()) // => Option.none()
Chunk.last(Chunk.make(1, 2, 3)) // => Option.some(3)
```

## lastUnsafe

**Getting the last element unsafely**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4)
Chunk.lastUnsafe(chunk) // => 4

const singleElement = Chunk.make("hello")
Chunk.lastUnsafe(singleElement) // => "hello"

// Use Chunk.last when the chunk may be empty
Option.isNone(Chunk.last(Chunk.empty())) // => true
```

## lastNonEmpty

**Getting the last element of a non-empty chunk**

```efx
import { Chunk } from "effect"

const nonEmptyChunk = Chunk.make(1, 2, 3, 4)
Chunk.lastNonEmpty(nonEmptyChunk) // => 4

const singleElement = Chunk.make("hello")
Chunk.lastNonEmpty(singleElement) // => "hello"

// Type safety: this function only accepts NonEmptyChunk
// Chunk.lastNonEmpty(Chunk.empty()) // TypeScript error
```

## Chunk.Infer

**Inferring element types**

```efx
import type { Chunk } from "effect"

declare const numberChunk: Chunk.Chunk<number>
declare const stringChunk: Chunk.Chunk<string>

type NumberType = Chunk.Chunk.Infer<typeof numberChunk> // number
type StringType = Chunk.Chunk.Infer<typeof stringChunk> // string
```

## Chunk.With

**Preserving non-emptiness**

```efx
import type { Chunk } from "effect"

declare const regularChunk: Chunk.Chunk<number>
declare const nonEmptyChunk: Chunk.NonEmptyChunk<number>

type WithString1 = Chunk.Chunk.With<typeof regularChunk, string> // Chunk.Chunk<string>
type WithString2 = Chunk.Chunk.With<typeof nonEmptyChunk, string> // Chunk.NonEmptyChunk<string>
```

## Chunk.OrNonEmpty

**Preserving non-emptiness from either input**

```efx
import type { Chunk } from "effect"

declare const emptyChunk: Chunk.Chunk<number>
declare const nonEmptyChunk: Chunk.NonEmptyChunk<number>

type Result1 = Chunk.Chunk.OrNonEmpty<
  typeof emptyChunk,
  typeof emptyChunk,
  string
> // Chunk.Chunk<string>
type Result2 = Chunk.Chunk.OrNonEmpty<
  typeof emptyChunk,
  typeof nonEmptyChunk,
  string
> // Chunk.NonEmptyChunk<string>
type Result3 = Chunk.Chunk.OrNonEmpty<
  typeof nonEmptyChunk,
  typeof emptyChunk,
  string
> // Chunk.NonEmptyChunk<string>
```

## Chunk.AndNonEmpty

**Requiring non-emptiness from both inputs**

```efx
import type { Chunk } from "effect"

declare const emptyChunk: Chunk.Chunk<number>
declare const nonEmptyChunk: Chunk.NonEmptyChunk<number>

type Result1 = Chunk.Chunk.AndNonEmpty<
  typeof emptyChunk,
  typeof emptyChunk,
  string
> // Chunk.Chunk<string>
type Result2 = Chunk.Chunk.AndNonEmpty<
  typeof emptyChunk,
  typeof nonEmptyChunk,
  string
> // Chunk.Chunk<string>
type Result3 = Chunk.Chunk.AndNonEmpty<
  typeof nonEmptyChunk,
  typeof nonEmptyChunk,
  string
> // Chunk.NonEmptyChunk<string>
```

## Chunk.Flatten

**Flattening nested chunk types**

```efx
import type { Chunk } from "effect"

declare const nestedChunk: Chunk.Chunk<Chunk.Chunk<number>>
declare const nestedNonEmpty: Chunk.NonEmptyChunk<Chunk.NonEmptyChunk<string>>

type Flattened1 = Chunk.Chunk.Flatten<typeof nestedChunk> // Chunk.Chunk<number>
type Flattened2 = Chunk.Chunk.Flatten<typeof nestedNonEmpty> // Chunk.NonEmptyChunk<string>
```

## map

**Mapping values**

```efx
import { Chunk } from "effect"

Chunk.toArray(Chunk.map(Chunk.make(1, 2), (n) => n + 1)) // => [2, 3]
```

## mapAccum

**Mapping with accumulated state**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
const [finalState, mapped] = Chunk.mapAccum(chunk, 0, (state, current) => [
  state + current, // accumulate sum
  state + current // output running sum
])

finalState // => 15
Chunk.toArray(mapped) // => [1, 3, 6, 10, 15]

// Building a string with indices
const words = Chunk.make("hello", "world", "effect")
const [count, indexed] = Chunk.mapAccum(words, 0, (index, word) => [
  index + 1,
  `${index}: ${word}`
])
count // => 3
Chunk.toArray(indexed) // => ["0: hello", "1: world", "2: effect"]
```

## partition

**Partitioning with a Result**

```efx
import { Chunk, Result } from "effect"

const [passes, fails] = Chunk.partition(Chunk.make(1, -2, 3), (n, i) =>
  n > 0 ? Result.succeed(n + i) : Result.fail(`negative:${n}`)
)

Chunk.toArray(passes) // => [1, 5]
Chunk.toArray(fails) // => ["negative:-2"]
```

## separate

**Separating successes and failures**

```efx
import { Chunk, Result } from "effect"

const chunk = Chunk.make(
  Result.succeed(1),
  Result.fail("error1"),
  Result.succeed(2),
  Result.fail("error2"),
  Result.succeed(3)
)

const [values, errors] = Chunk.separate(chunk)
Chunk.toArray(values) // => [1, 2, 3]
Chunk.toArray(errors) // => ["error1", "error2"]

// All successes
const allSuccesses = Chunk.make(Result.succeed(1), Result.succeed(2))
const [allValues, noErrors] = Chunk.separate(allSuccesses)
Chunk.toArray(allValues) // => [1, 2]
Chunk.toArray(noErrors) // => []
```

## size

**Getting chunk size**

```efx
import { Chunk } from "effect"

Chunk.size(Chunk.make(1, 2, 3)) // => 3
```

## sort

**Sorting chunks**

```efx
import { Chunk, Order } from "effect"

const numbers = Chunk.make(3, 1, 4, 1, 5, 9, 2, 6)
Chunk.toArray(Chunk.sort(numbers, Order.Number)) // => [1, 1, 2, 3, 4, 5, 6, 9]

// Reverse order
Chunk.toArray(Chunk.sort(numbers, Order.flip(Order.Number))) // => [9, 6, 5, 4, 3, 2, 1, 1]

// String sorting
const words = Chunk.make("banana", "apple", "cherry")
Chunk.toArray(Chunk.sort(words, Order.String)) // => ["apple", "banana", "cherry"]
```

## sortWith

**Sorting chunks by a derived value**

```efx
import { Chunk, Order } from "effect"

const people = Chunk.make(
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Charlie", age: 35 }
)

// Sort by age
const byAge = Chunk.sortWith(people, (person) => person.age, Order.Number)
Chunk.toArray(byAge).map((person) => person.name) // => ["Bob", "Alice", "Charlie"]

// Sort by name
const byName = Chunk.sortWith(people, (person) => person.name, Order.String)
Chunk.toArray(byName).map((person) => person.name) // => ["Alice", "Bob", "Charlie"]

// Sort by string length
const words = Chunk.make("a", "abc", "ab")
Chunk.toArray(Chunk.sortWith(words, (word) => word.length, Order.Number)) // => ["a", "ab", "abc"]
```

## splitAt

**Splitting at an index**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5, 6)
const [before, after] = Chunk.splitAt(chunk, 3)
Chunk.toArray(before) // => [1, 2, 3]
Chunk.toArray(after) // => [4, 5, 6]

// Split at index 0
const [empty, all] = Chunk.splitAt(chunk, 0)
Chunk.toArray(empty) // => []
Chunk.toArray(all) // => [1, 2, 3, 4, 5, 6]

// Split beyond length
const [allElements, empty2] = Chunk.splitAt(chunk, 10)
Chunk.toArray(allElements) // => [1, 2, 3, 4, 5, 6]
Chunk.toArray(empty2) // => []
```

## splitNonEmptyAt

**Splitting non-empty chunks at an index**

```efx
import { Chunk } from "effect"

const nonEmptyChunk = Chunk.make(1, 2, 3, 4, 5, 6)
const [before, after] = Chunk.splitNonEmptyAt(nonEmptyChunk, 3)
Chunk.toArray(before) // => [1, 2, 3]
Chunk.toArray(after) // => [4, 5, 6]

// Split at 1 (minimum)
const [first, rest] = Chunk.splitNonEmptyAt(nonEmptyChunk, 1)
Chunk.toArray(first) // => [1]
Chunk.toArray(rest) // => [2, 3, 4, 5, 6]

// The first part is guaranteed to be NonEmptyChunk
// while the second part may be empty
```

## split

**Splitting chunks into groups**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5, 6, 7, 8, 9)
const chunks = Chunk.split(chunk, 3)
Chunk.toArray(chunks).map(Chunk.toArray) // => [[1, 2, 3], [4, 5, 6], [7, 8, 9]]

// Uneven split
const chunk2 = Chunk.make(1, 2, 3, 4, 5, 6, 7, 8)
const chunks2 = Chunk.split(chunk2, 3)
Chunk.toArray(chunks2).map(Chunk.toArray) // => [[1, 2, 3], [4, 5, 6], [7, 8]]

// Split into 1 chunk
const chunks3 = Chunk.split(chunk, 1)
Chunk.toArray(chunks3).map(Chunk.toArray) // => [[1, 2, 3, 4, 5, 6, 7, 8, 9]]
```

## splitWhere

**Splitting at a matching element**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5, 6)
const [before, fromMatch] = Chunk.splitWhere(chunk, (n) => n > 3)
Chunk.toArray(before) // => [1, 2, 3]
Chunk.toArray(fromMatch) // => [4, 5, 6]

// No match found
const [all, empty] = Chunk.splitWhere(chunk, (n) => n > 10)
Chunk.toArray(all) // => [1, 2, 3, 4, 5, 6]
Chunk.toArray(empty) // => []

// Match on first element
const [emptyBefore, allFromFirst] = Chunk.splitWhere(chunk, (n) => n === 1)
Chunk.toArray(emptyBefore) // => []
Chunk.toArray(allFromFirst) // => [1, 2, 3, 4, 5, 6]
```

## tail

**Getting the tail safely**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4)
Chunk.tail(chunk) // => Option.some(Chunk.make(2, 3, 4))

const singleElement = Chunk.make(1)
Chunk.tail(singleElement) // => Option.some(Chunk.empty())

Chunk.tail(Chunk.empty<number>()) // => Option.none()
```

## tailNonEmpty

**Getting the tail of a non-empty chunk**

```efx
import { Chunk } from "effect"

const nonEmptyChunk = Chunk.make(1, 2, 3, 4)
Chunk.toArray(Chunk.tailNonEmpty(nonEmptyChunk)) // => [2, 3, 4]

const singleElement = Chunk.make(1)
Chunk.toArray(Chunk.tailNonEmpty(singleElement)) // => []

// Type safety: this function only accepts NonEmptyChunk
// Chunk.tailNonEmpty(Chunk.empty()) // TypeScript error
```

## takeRight

**Taking elements from the end**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5, 6)
Chunk.toArray(Chunk.takeRight(chunk, 3)) // => [4, 5, 6]

// Take more than available
Chunk.toArray(Chunk.takeRight(chunk, 10)) // => [1, 2, 3, 4, 5, 6]

// Take zero
Chunk.toArray(Chunk.takeRight(chunk, 0)) // => []
```

## takeWhile

**Taking elements while a predicate matches**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 3, 2, 1)
Chunk.toArray(Chunk.takeWhile(chunk, (n) => n < 4)) // => [1, 2, 3]

// Empty if first element doesn't match
Chunk.toArray(Chunk.takeWhile(chunk, (n) => n > 5)) // => []

// Takes all if all match
const small = Chunk.make(1, 2, 3)
Chunk.toArray(Chunk.takeWhile(small, (n) => n < 10)) // => [1, 2, 3]
```

## union

**Unioning chunks**

```efx
import { Chunk } from "effect"

const chunk1 = Chunk.make(1, 2, 3)
const chunk2 = Chunk.make(3, 4, 5)
Chunk.toArray(Chunk.union(chunk1, chunk2)) // => [1, 2, 3, 4, 5]

// Handles duplicates within the same chunk
const withDupes1 = Chunk.make(1, 1, 2)
const withDupes2 = Chunk.make(2, 3, 3)
Chunk.toArray(Chunk.union(withDupes1, withDupes2)) // => [1, 2, 3]
```

## dedupe

**Removing duplicate values**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 2, 3, 1, 4, 3)
Chunk.toArray(Chunk.dedupe(chunk)) // => [1, 2, 3, 4]

// Empty chunk
const empty = Chunk.empty<number>()
Chunk.toArray(Chunk.dedupe(empty)) // => []

// No duplicates
const unique = Chunk.make(1, 2, 3)
Chunk.toArray(Chunk.dedupe(unique)) // => [1, 2, 3]
```

## dedupeAdjacent

**Removing adjacent duplicates**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 1, 2, 2, 2, 3, 1, 1)
Chunk.toArray(Chunk.dedupeAdjacent(chunk)) // => [1, 2, 3, 1]

// Only removes adjacent duplicates, not all duplicates
const mixed = Chunk.make("a", "a", "b", "a", "a")
Chunk.toArray(Chunk.dedupeAdjacent(mixed)) // => ["a", "b", "a"]
```

## unzip

**Unzipping pairs**

```efx
import { Chunk } from "effect"

const pairs = Chunk.make(
  [1, "a"] as const,
  [2, "b"] as const,
  [3, "c"] as const
)
const [numbers, letters] = Chunk.unzip(pairs)
Chunk.toArray(numbers) // => [1, 2, 3]
Chunk.toArray(letters) // => ["a", "b", "c"]

// Empty chunk
const empty = Chunk.empty<[number, string]>()
const [emptyNums, emptyStrs] = Chunk.unzip(empty)
Chunk.toArray(emptyNums) // => []
Chunk.toArray(emptyStrs) // => []
```

## zipWith

**Zipping chunks with a function**

```efx
import { Chunk } from "effect"

const numbers = Chunk.make(1, 2, 3)
const letters = Chunk.make("a", "b", "c")
Chunk.toArray(Chunk.zipWith(numbers, letters, (n, l) => `${n}-${l}`)) // => ["1-a", "2-b", "3-c"]

// Different lengths - takes minimum
const short = Chunk.make(1, 2)
const long = Chunk.make("a", "b", "c", "d")
Chunk.toArray(Chunk.zipWith(short, long, (n, l) => [n, l])) // => [[1, "a"], [2, "b"]]
```

## zip

**Zipping chunks**

```efx
import { Chunk } from "effect"

const numbers = Chunk.make(1, 2, 3)
const letters = Chunk.make("a", "b", "c")
Chunk.toArray(Chunk.zip(numbers, letters)) // => [[1, "a"], [2, "b"], [3, "c"]]

// Different lengths - takes minimum length
const short = Chunk.make(1, 2)
const long = Chunk.make("a", "b", "c", "d")
Chunk.toArray(Chunk.zip(short, long)) // => [[1, "a"], [2, "b"]]
```

## remove

**Removing an element**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make("a", "b", "c", "d")
Chunk.toArray(Chunk.remove(chunk, 1)) // => ["a", "c", "d"]

// Remove first element
Chunk.toArray(Chunk.remove(chunk, 0)) // => ["b", "c", "d"]

// Index out of bounds returns same chunk
Chunk.toArray(Chunk.remove(chunk, 10)) // => ["a", "b", "c", "d"]
```

## modify

**Modifying an element**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4)
Chunk.modify(chunk, 1, (n) => n * 10) // => Option.some(Chunk.make(1, 20, 3, 4))

// Index out of bounds returns None
chunk.pipe(Chunk.modify(10, (n) => n * 10)) // => Option.none()

// Negative index returns None
chunk.pipe(Chunk.modify(-1, (n) => n * 10)) // => Option.none()
```

## replace

**Replacing an element**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make("a", "b", "c", "d")
Chunk.replace(chunk, 1, "X") // => Option.some(Chunk.make("a", "X", "c", "d"))

// Index out of bounds returns None
chunk.pipe(Chunk.replace(10, "Y")) // => Option.none()

// Negative index returns None
chunk.pipe(Chunk.replace(-1, "Z")) // => Option.none()
```

## makeBy

**Generating chunks from indices**

```efx
import { Chunk } from "effect"

Chunk.toArray(Chunk.makeBy(5, (i) => i * 2)) // => [0, 2, 4, 6, 8]
```

## range

**Creating a range**

```efx
import { Chunk } from "effect"

Chunk.toArray(Chunk.range(1, 5)) // => [1, 2, 3, 4, 5]
```

## contains

**Checking membership**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.contains(chunk, 3) // => true
Chunk.contains(chunk, 6) // => false

// Works with strings
const words = Chunk.make("apple", "banana", "cherry")
Chunk.contains(words, "banana") // => true
Chunk.contains(words, "grape") // => false

// Empty chunk
Chunk.contains(Chunk.empty<number>(), 1) // => false
```

## containsWith

**Checking membership with custom equivalence**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make({ id: 1, name: "Alice" }, { id: 2, name: "Bob" })

// Custom equivalence by id
const containsById = Chunk.containsWith<{ id: number; name: string }>((a, b) =>
  a.id === b.id
)
containsById(chunk, { id: 1, name: "Different" }) // => true
containsById(chunk, { id: 3, name: "Charlie" }) // => false

// Case-insensitive string comparison
const words = Chunk.make("Apple", "Banana", "Cherry")
const containsCaseInsensitive = Chunk.containsWith<string>((a, b) =>
  a.toLowerCase() === b.toLowerCase()
)
containsCaseInsensitive(words, "apple") // => true
containsCaseInsensitive(words, "grape") // => false
```

## findFirst

**Finding the first matching element**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.findFirst(chunk, (n) => n > 3) // => Option.some(4)

// No match found
Chunk.findFirst(chunk, (n) => n > 10) // => Option.none()

// With type refinement
const mixed = Chunk.make(1, "hello", 2, "world", 3)
const firstString = Chunk.findFirst(
  mixed,
  (x): x is string => typeof x === "string"
)
firstString // => Option.some("hello")
```

## findFirstIndex

**Finding the first matching index**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.findFirstIndex(chunk, (n) => n > 3) // => Option.some(3)

// No match found
Chunk.findFirstIndex(chunk, (n) => n > 10) // => Option.none()

// Find first even number
Chunk.findFirstIndex(chunk, (n) => n % 2 === 0) // => Option.some(1)
```

## findLast

**Finding the last matching element**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.findLast(chunk, (n) => n < 4) // => Option.some(3)

// No match found
Chunk.findLast(chunk, (n) => n > 10) // => Option.none()

// Find last even number
Chunk.findLast(chunk, (n) => n % 2 === 0) // => Option.some(4)
```

## findLastIndex

**Finding the last matching index**

```efx
import { Chunk, Option } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.findLastIndex(chunk, (n) => n < 4) // => Option.some(2)

// No match found
Chunk.findLastIndex(chunk, (n) => n > 10) // => Option.none()

// Find last even number index
Chunk.findLastIndex(chunk, (n) => n % 2 === 0) // => Option.some(3)
```

## every

**Checking every element**

```efx
import { Chunk } from "effect"

const allPositive = Chunk.make(1, 2, 3, 4, 5)
Chunk.every(allPositive, (n) => n > 0) // => true
Chunk.every(allPositive, (n) => n > 3) // => false

// Empty chunk returns true
Chunk.every(Chunk.empty<number>(), (n) => n > 0) // => true

// Type refinement
const mixed = Chunk.make(1, 2, 3)
if (Chunk.every(mixed, (x): x is number => typeof x === "number")) {
  // mixed is now typed as Chunk<number>
}
```

## some

**Checking for some matching element**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.some(chunk, (n) => n > 4) // => true
Chunk.some(chunk, (n) => n > 10) // => false

// Empty chunk returns false
Chunk.some(Chunk.empty<number>(), (n) => n > 0) // => false

// Check for specific value
const words = Chunk.make("apple", "banana", "cherry")
Chunk.some(words, (word) => word.includes("ban")) // => true
```

## join

**Joining chunks into a string**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make("apple", "banana", "cherry")
Chunk.join(chunk, ", ") // => "apple, banana, cherry"

// With different separator
Chunk.join(chunk, " | ") // => "apple | banana | cherry"

// Empty chunk
Chunk.join(Chunk.empty<string>(), ", ") // => ""

// Single element
Chunk.join(Chunk.make("hello"), ", ") // => "hello"
```

## reduce

**Reducing from the left**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4, 5)
Chunk.reduce(chunk, 0, (acc, n) => acc + n) // => 15

// String concatenation with index
const words = Chunk.make("a", "b", "c")
Chunk.reduce(words, "", (acc, word, i) => acc + `${i}:${word} `).trimEnd() // => "0:a 1:b 2:c"

// Find maximum
Chunk.reduce(chunk, -Infinity, (acc, n) => Math.max(acc, n)) // => 5
```

## reduceRight

**Reducing from the right**

```efx
import { Chunk } from "effect"

const chunk = Chunk.make(1, 2, 3, 4)
Chunk.reduceRight(chunk, 0, (acc, n) => acc + n) // => 10

// String building (right to left)
const words = Chunk.make("a", "b", "c")
Chunk.reduceRight(
  words,
  "",
  (acc, word, i) => acc + `${i}:${word} `
).trim() // => "2:c 1:b 0:a"

// Subtract from right to left
Chunk.reduceRight(chunk, 0, (acc, n) => n - acc) // => -2
```

## differenceWith

**Computing difference with custom equivalence**

```efx
import { Chunk } from "effect"

const chunk1 = Chunk.make({ id: 1, name: "Alice" }, { id: 2, name: "Bob" })
const chunk2 = Chunk.make({ id: 1, name: "Alice" }, { id: 3, name: "Charlie" })

// Custom equivalence by id
const byId = Chunk.differenceWith<{ id: number; name: string }>((a, b) =>
  a.id === b.id
)
Chunk.toArray(byId(chunk1, chunk2)) // => [{ id: 2, name: "Bob" }]

// String comparison case-insensitive
const words1 = Chunk.make("Apple", "Banana", "Cherry")
const words2 = Chunk.make("apple", "grape")
const caseInsensitive = Chunk.differenceWith<string>((a, b) =>
  a.toLowerCase() === b.toLowerCase()
)
Chunk.toArray(caseInsensitive(words1, words2)) // => ["Banana", "Cherry"]
```

## difference

**Computing chunk difference**

```efx
import { Chunk } from "effect"

const chunk1 = Chunk.make(1, 2, 3, 4, 5)
const chunk2 = Chunk.make(3, 4, 6, 7)
Chunk.toArray(Chunk.difference(chunk1, chunk2)) // => [1, 2, 5]

// String difference
const words1 = Chunk.make("apple", "banana", "cherry")
const words2 = Chunk.make("banana", "grape")
Chunk.toArray(Chunk.difference(words1, words2)) // => ["apple", "cherry"]

// Empty second chunk returns original
Chunk.toArray(Chunk.difference(chunk1, Chunk.empty<number>())) // => [1, 2, 3, 4, 5]
```
