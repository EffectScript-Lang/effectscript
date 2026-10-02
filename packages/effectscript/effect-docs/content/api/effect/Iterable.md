# effect/Iterable

The examples in the JSDoc of `packages/effect/src/Iterable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## makeBy

**Generating values by index**

```efx
import { Iterable } from "effect"

// Generate first 5 even numbers
const evens = Iterable.makeBy((n) => n * 2, { length: 5 })
Array.from(evens) // => [0, 2, 4, 6, 8]

// Generate squares
const squares = Iterable.makeBy((n) => n * n, { length: 4 })
Array.from(squares) // => [0, 1, 4, 9]

// Infinite sequence (be careful when consuming!)
const naturals = Iterable.makeBy((n) => n)
const first10 = Iterable.take(naturals, 10)
Array.from(first10) // => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

## range

**Creating a range**

```efx
import { Iterable } from "effect"

Array.from(Iterable.range(1, 3)) // => [1, 2, 3]
```

## replicate

**Repeating a value**

```efx
import { Iterable } from "effect"

Array.from(Iterable.replicate("a", 3)) // => ["a", "a", "a"]
```

## fromRecord

**Converting a record to entries**

```efx
import { Iterable } from "effect"

const x = { a: 1, b: 2, c: 3 }
Array.from(Iterable.fromRecord(x)) // => [["a", 1], ["b", 2], ["c", 3]]
```

## prepend

**Prepending an element**

```efx
import { Iterable } from "effect"

const numbers = [2, 3, 4]
const withOne = Iterable.prepend(numbers, 1)
Array.from(withOne) // => [1, 2, 3, 4]

// Works with any iterable
const letters = "abc"
const withZ = Iterable.prepend(letters, "z")
Array.from(withZ) // => ["z", "a", "b", "c"]
```

## prependAll

**Prepending another iterable**

```efx
import { Iterable } from "effect"

Array.from(Iterable.prependAll([1, 2], ["a", "b"])) // => ["a", "b", 1, 2]
```

## append

**Appending an element**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3]
Array.from(Iterable.append(numbers, 4)) // => [1, 2, 3, 4]
```

## appendAll

**Concatenating iterables**

```efx
import { Iterable } from "effect"

Array.from(Iterable.appendAll([1, 2, 3], [4, 5, 6])) // => [1, 2, 3, 4, 5, 6]

// Works with different iterable types
const numbers = [1, 2]
const letters = "abc"
const mixed = Iterable.appendAll(numbers, letters)
Array.from(mixed) // => [1, 2, "a", "b", "c"]

// Lazy evaluation - only consumes what's needed
const infinite = Iterable.range(1)
const finite = [0, -1, -2]
Array.from(Iterable.take(Iterable.appendAll(finite, infinite), 5)) // => [0, -1, -2, 1, 2]
```

## scan

**Tracking running results**

```efx
import { Iterable } from "effect"

// Running sum of numbers
const numbers = [1, 2, 3, 4, 5]
const runningSum = Iterable.scan(numbers, 0, (acc, n) => acc + n)
Array.from(runningSum) // => [0, 1, 3, 6, 10, 15]

// Build strings progressively
const letters = ["a", "b", "c"]
const progressive = Iterable.scan(letters, "", (acc, letter) => acc + letter)
Array.from(progressive) // => ["", "a", "ab", "abc"]

// Track maximum values seen so far
const values = [3, 1, 4, 1, 5, 9, 2]
const runningMax = Iterable.scan(values, -Infinity, Math.max)
Array.from(runningMax) // => [-Infinity, 3, 3, 4, 4, 5, 9, 9]
```

## isEmpty

**Checking for emptiness**

```efx
import { Iterable } from "effect"

Iterable.isEmpty([]) // => true
Iterable.isEmpty([1, 2, 3]) // => false
```

## size

**Counting iterable elements**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3, 4, 5]
Iterable.size(numbers) // => 5

const empty = Iterable.empty<number>()
Iterable.size(empty) // => 0

// Works with any iterable
const letters = "hello"
Iterable.size(letters) // => 5

// Note: This consumes the entire iterable
const range = Iterable.range(1, 100)
Iterable.size(range) // => 100
```

## head

**Getting the first element**

```efx
import { Iterable, Option } from "effect"

const numbers = [1, 2, 3]
Iterable.head(numbers) // => Option.some(1)

const empty = Iterable.empty<number>()
Iterable.head(empty) // => Option.none()

// Safe way to get first element
const firstEven = Iterable.head(
  Iterable.filter([1, 3, 4, 5], (x) => x % 2 === 0)
)
firstEven // => Option.some(4)

// Use with Option methods
const doubled = Option.map(Iterable.head([5, 10, 15]), (x) => x * 2)
doubled // => Option.some(10)
```

## headUnsafe

**Getting the first element unsafely**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3]
Iterable.headUnsafe(numbers) // => 1

const letters = "hello"
Iterable.headUnsafe(letters) // => "h"

// Iterable.headUnsafe(Iterable.empty<number>())
// throws Error: "headUnsafe: empty iterable"

// Use only when you're certain the iterable is non-empty
const nonEmpty = Iterable.range(1, 10)
Iterable.headUnsafe(nonEmpty) // => 1
```

## take

**Taking from the start**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3, 4, 5]
const firstThree = Iterable.take(numbers, 3)
Array.from(firstThree) // => [1, 2, 3]

// Taking more than available returns all elements
const firstTen = Iterable.take(numbers, 10)
Array.from(firstTen) // => [1, 2, 3, 4, 5]

// Taking 0 or negative returns empty
const none = Iterable.take(numbers, 0)
Array.from(none) // => []

// Useful with infinite iterables
const naturals = Iterable.range(1)
const firstFive = Iterable.take(naturals, 5)
Array.from(firstFive) // => [1, 2, 3, 4, 5]
```

## takeWhile

**Taking while a predicate holds**

```efx
import { Iterable } from "effect"

const numbers = [2, 4, 6, 8, 3, 10, 12]
const evenPrefix = Iterable.takeWhile(numbers, (x) => x % 2 === 0)
Array.from(evenPrefix) // => [2, 4, 6, 8]

// With index
const letters = ["a", "b", "c", "d", "e"]
const firstThreeByIndex = Iterable.takeWhile(letters, (_, i) => i < 3)
Array.from(firstThreeByIndex) // => ["a", "b", "c"]

// Stops at first non-matching element
const mixed = [1, 3, 5, 4, 7, 9]
const oddPrefix = Iterable.takeWhile(mixed, (x) => x % 2 === 1)
Array.from(oddPrefix) // => [1, 3, 5]

// Type refinement
const values: Array<string | number> = ["a", "b", "c", 1, "d"]
const stringPrefix = Iterable.takeWhile(
  values,
  (x): x is string => typeof x === "string"
)
Array.from(stringPrefix) // => ["a", "b", "c"]
```

## drop

**Dropping from the start**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3, 4, 5]
const withoutFirstTwo = Iterable.drop(numbers, 2)
Array.from(withoutFirstTwo) // => [3, 4, 5]

// Dropping more than available returns empty
const withoutFirstTen = Iterable.drop(numbers, 10)
Array.from(withoutFirstTen) // => []

// Dropping 0 or negative returns all elements
const all = Iterable.drop(numbers, 0)
Array.from(all) // => [1, 2, 3, 4, 5]

// Combine with take for slicing
const slice = Iterable.take(Iterable.drop(numbers, 1), 3)
Array.from(slice) // => [2, 3, 4]
```

## findFirst

**Finding the first match**

```efx
import { Iterable, Option } from "effect"

const numbers = [1, 3, 4, 6, 8]
const firstEven = Iterable.findFirst(numbers, (x) => x % 2 === 0)
firstEven // => Option.some(4)

const firstGreaterThan10 = Iterable.findFirst(numbers, (x) => x > 10)
firstGreaterThan10 // => Option.none()

// With index
const letters = ["a", "b", "c", "d"]
const atEvenIndex = Iterable.findFirst(letters, (_, i) => i % 2 === 0)
atEvenIndex // => Option.some("a")

// Type refinement
const mixed: Array<string | number> = [1, "hello", 2, "world"]
const firstString = Iterable.findFirst(
  mixed,
  (x): x is string => typeof x === "string"
)
firstString // => Option.some("hello")

// Transform during search
const findSquareRoot = Iterable.findFirst([1, 4, 9, 16], (x) => {
  const sqrt = Math.sqrt(x)
  return Number.isInteger(sqrt) ? Option.some(sqrt) : Option.none()
})
findSquareRoot // => Option.some(1)
```

## findLast

**Finding the last match**

```efx
import { Iterable, Option } from "effect"

const numbers = [1, 3, 4, 6, 8, 2]
const lastEven = Iterable.findLast(numbers, (x) => x % 2 === 0)
lastEven // => Option.some(2)

const lastGreaterThan10 = Iterable.findLast(numbers, (x) => x > 10)
lastGreaterThan10 // => Option.none()

// With index
const letters = ["a", "b", "c", "d", "e"]
const lastAtEvenIndex = Iterable.findLast(letters, (_, i) => i % 2 === 0)
lastAtEvenIndex // => Option.some("e")

// Type refinement
const mixed: Array<string | number> = [1, "hello", 2, "world", 3]
const lastString = Iterable.findLast(
  mixed,
  (x): x is string => typeof x === "string"
)
lastString // => Option.some("world")
```

## zip

**Zipping iterables**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3]
const letters = ["a", "b", "c"]
const zipped = Iterable.zip(numbers, letters)
Array.from(zipped) // => [[1, "a"], [2, "b"], [3, "c"]]

// Different lengths - shorter one determines result length
const short = [1, 2]
const long = ["a", "b", "c", "d"]
const partial = Iterable.zip(short, long)
Array.from(partial) // => [[1, "a"], [2, "b"]]

// Works with any iterables
const range = Iterable.range(1, 3)
const word = "abc"
const mixed = Iterable.zip(range, word)
Array.from(mixed) // => [[1, "a"], [2, "b"], [3, "c"]]

// Create indexed pairs
const values = ["apple", "banana", "cherry"]
const indices = Iterable.range(0, 2)
const indexed = Iterable.zip(indices, values)
Array.from(indexed) // => [[0, "apple"], [1, "banana"], [2, "cherry"]]
```

## zipWith

**Zipping with a combining function**

```efx
import { Iterable } from "effect"

// Add corresponding elements
const a = [1, 2, 3, 4]
const b = [10, 20, 30, 40]
const sums = Iterable.zipWith(a, b, (x, y) => x + y)
Array.from(sums) // => [11, 22, 33, 44]

// Combine strings
const firstNames = ["John", "Jane", "Bob"]
const lastNames = ["Doe", "Smith", "Johnson"]
const fullNames = Iterable.zipWith(
  firstNames,
  lastNames,
  (first, last) => `${first} ${last}`
)
Array.from(fullNames) // => ["John Doe", "Jane Smith", "Bob Johnson"]

// Different lengths - stops at shorter
const short = [1, 2]
const long = ["a", "b", "c", "d"]
const combined = Iterable.zipWith(
  short,
  long,
  (num, letter) => `${num}${letter}`
)
Array.from(combined) // => ["1a", "2b"]

// Complex transformations
const prices = [10.99, 25.50, 5.00]
const quantities = [2, 1, 3]
const totals = Iterable.zipWith(prices, quantities, (price, qty) => {
  return Math.round(price * qty * 100) / 100 // round to 2 decimal places
})
Array.from(totals) // => [21.98, 25.5, 15]
```

## intersperse

**Interspersing separators**

```efx
import { Iterable } from "effect"

// Join numbers with separator
const numbers = [1, 2, 3, 4]
const withCommas = Iterable.intersperse(numbers, ",")
Array.from(withCommas) // => [1, ",", 2, ",", 3, ",", 4]

// Join words with spaces
const words = ["hello", "world", "from", "effect"]
const sentence = Iterable.intersperse(words, " ")
Array.from(sentence).join("") // => "hello world from effect"

// Empty iterable remains empty
const empty = Iterable.empty<string>()
const stillEmpty = Iterable.intersperse(empty, "-")
Array.from(stillEmpty) // => []

// Single element has no separators added
const single = [42]
const noSeparator = Iterable.intersperse(single, "|")
Array.from(noSeparator) // => [42]

// Build CSS-like strings
const styles = ["color: red", "font-size: 14px", "margin: 10px"]
const css = Iterable.intersperse(styles, "; ")
Array.from(css).join("") // => "color: red; font-size: 14px; margin: 10px"
```

## containsWith

**Checking membership with custom equivalence**

```efx
import { Iterable } from "effect"

// Custom equivalence for objects
const byId = (a: { id: number }, b: { id: number }) => a.id === b.id
const containsById = Iterable.containsWith(byId)

const users = [{ id: 1 }, { id: 2 }]
const hasUser1 = containsById(users, { id: 1 })
hasUser1 // => true

// Case-insensitive string comparison
const caseInsensitive = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()
const containsCaseInsensitive = Iterable.containsWith(caseInsensitive)

const words = ["Hello", "World"]
const hasHello = containsCaseInsensitive(words, "hello")
hasHello // => true

// Approximate number comparison
const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.1
const containsApprox = Iterable.containsWith(approxEqual)

const values = [1.0, 2.0, 3.0]
const hasAlmostTwo = containsApprox(values, 2.05)
hasAlmostTwo // => true
```

## contains

**Checking membership**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3, 4, 5]
Iterable.contains(numbers, 3) // => true
Iterable.contains(numbers, 6) // => false

const letters = "hello"
Iterable.contains(letters, "l") // => true
Iterable.contains(letters, "x") // => false

// Works with any iterable
const range = Iterable.range(1, 100)
Iterable.contains(range, 50) // => true
Iterable.contains(range, 150) // => false

// Curried version
const containsThree = Iterable.contains(3)
containsThree([1, 2, 3]) // => true
containsThree([4, 5, 6]) // => false
```

## chunksOf

**Chunking an iterable**

```efx
import { Iterable } from "effect"

const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const chunks = Iterable.chunksOf(numbers, 3)
Array.from(chunks) // => [[1, 2, 3], [4, 5, 6], [7, 8, 9]]

// Last chunk can be shorter
const uneven = [1, 2, 3, 4, 5, 6, 7]
const chunks2 = Iterable.chunksOf(uneven, 3)
Array.from(chunks2) // => [[1, 2, 3], [4, 5, 6], [7]]

// Chunk size larger than iterable
const small = [1, 2]
const chunks3 = Iterable.chunksOf(small, 5)
Array.from(chunks3) // => [[1, 2]]

// Process data in batches
const data = Iterable.range(1, 100)
const batches = Iterable.chunksOf(data, 10)
const batchSums = Iterable.map(
  batches,
  (batch) => Iterable.reduce(batch, 0, (sum, n) => sum + n)
)
Array.from(Iterable.take(batchSums, 3)) // => [55, 155, 255]
```

## groupWith

**Grouping consecutive elements with custom equivalence**

```efx
import { Iterable } from "effect"

// Group consecutive equal numbers
const numbers = [1, 1, 2, 2, 2, 3, 1, 1]
const grouped = Iterable.groupWith(numbers, (a, b) => a === b)
Array.from(grouped) // => [[1, 1], [2, 2, 2], [3], [1, 1]]

// Case-insensitive grouping of strings
const words = ["Apple", "APPLE", "banana", "Banana", "cherry"]
const caseInsensitive = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()
const groupedWords = Iterable.groupWith(words, caseInsensitive)
Array.from(groupedWords) // => [["Apple", "APPLE"], ["banana", "Banana"], ["cherry"]]

// Group by approximate equality
const floats = [1.1, 1.12, 1.9, 2.01, 2.05, 3.5]
const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.2
const groupedFloats = Iterable.groupWith(floats, approxEqual)
Array.from(groupedFloats) // => [[1.1, 1.12], [1.9, 2.01, 2.05], [3.5]]

// Only groups consecutive elements
const scattered = [1, 2, 1, 2, 1]
const scatteredGroups = Iterable.groupWith(scattered, (a, b) => a === b)
Array.from(scatteredGroups) // => [[1], [2], [1], [2], [1]]
```

## group

**Grouping consecutive elements**

```efx
import { Iterable } from "effect"

const numbers = [1, 1, 2, 2, 2, 3, 1, 1]
const grouped = Iterable.group(numbers)
Array.from(grouped) // => [[1, 1], [2, 2, 2], [3], [1, 1]]

const letters = "aabbccaa"
const groupedLetters = Iterable.group(letters)
Array.from(groupedLetters) // => [["a", "a"], ["b", "b"], ["c", "c"], ["a", "a"]]

// Works with objects using deep equality
const objects = [
  { type: "A", value: 1 },
  { type: "A", value: 1 },
  { type: "B", value: 2 },
  { type: "A", value: 1 }
]
const groupedObjects = Iterable.group(objects)
Array.from(groupedObjects).length // => 3
// Note: Only consecutive equal objects are grouped together
```

## groupBy

**Grouping by a key**

```efx
import { Iterable } from "effect"

// Group by string length
const words = ["a", "bb", "ccc", "dd", "eee", "f"]
const byLength = Iterable.groupBy(words, (word) => word.length.toString())
byLength // => { "1": ["a", "f"], "2": ["bb", "dd"], "3": ["ccc", "eee"] }

// Group by first letter
const names = ["Alice", "Bob", "Charlie", "David", "Anna", "Betty"]
const byFirstLetter = Iterable.groupBy(names, (name) => name[0])
byFirstLetter // => { A: ["Alice", "Anna"], B: ["Bob", "Betty"], C: ["Charlie"], D: ["David"] }

// Group by category
const items = [
  { name: "apple", category: "fruit" },
  { name: "carrot", category: "vegetable" },
  { name: "banana", category: "fruit" },
  { name: "broccoli", category: "vegetable" }
]
const byCategory = Iterable.groupBy(items, (item) => item.category)
Object.keys(byCategory) // => ["fruit", "vegetable"]

// Group numbers by even/odd
const numbers = [1, 2, 3, 4, 5, 6]
const evenOdd = Iterable.groupBy(numbers, (n) => n % 2 === 0 ? "even" : "odd")
evenOdd // => { odd: [1, 3, 5], even: [2, 4, 6] }
```

## empty

**Creating an empty iterable**

```efx
import { Iterable } from "effect"

Array.from(Iterable.empty<string>()) // => []
```

## of

**Wrapping a single value**

```efx
import { Iterable } from "effect"

const single = Iterable.of(42)
Array.from(single) // => [42]

// Useful for creating homogeneous sequences
const sequences = [
  Iterable.of("hello"),
  Iterable.range(1, 3),
  Iterable.empty<string>()
]

// Can be used with flatMap for conditional inclusion
const numbers = [1, 2, 3, 4, 5]
const evensOnly = Iterable.flatMap(
  numbers,
  (n) => n % 2 === 0 ? Iterable.of(n) : Iterable.empty()
)
Array.from(evensOnly) // => [2, 4]
```

## map

**Mapping elements**

```efx
import { Iterable } from "effect"

// Transform numbers to their squares
const numbers = [1, 2, 3, 4, 5]
const squares = Iterable.map(numbers, (x) => x * x)
Array.from(squares) // => [1, 4, 9, 16, 25]

// Use index in transformation
const indexed = Iterable.map(["a", "b", "c"], (char, i) => `${i}: ${char}`)
Array.from(indexed) // => ["0: a", "1: b", "2: c"]

Array.from(Iterable.map(
  Iterable.map([1, 2, 3], (x) => x * 2),
  (x) => x + 1
)) // => [3, 5, 7]
```

## flatMap

**Flat mapping iterables**

```efx
import { Iterable } from "effect"

// Expand each number to a range
const numbers = [1, 2, 3]
const expanded = Iterable.flatMap(numbers, (n) => Iterable.range(1, n))
Array.from(expanded) // => [1, 1, 2, 1, 2, 3]

// Split strings into characters
const words = ["hi", "bye"]
const chars = Iterable.flatMap(words, (word) => word)
Array.from(chars) // => ["h", "i", "b", "y", "e"]

// Conditional expansion with empty iterables
const values = [1, 2, 3, 4, 5]
const evenMultiples = Iterable.flatMap(
  values,
  (n) => n % 2 === 0 ? [n, n * 2, n * 3] : []
)
Array.from(evenMultiples) // => [2, 4, 6, 4, 8, 12]

// Use index in transformation
const letters = ["a", "b", "c"]
const indexed = Iterable.flatMap(
  letters,
  (letter, i) => Iterable.replicate(letter, i + 1)
)
Array.from(indexed) // => ["a", "b", "b", "c", "c", "c"]
```

## flatten

**Flattening nested iterables**

```efx
import { Iterable } from "effect"

// Flatten nested arrays
const nested = [[1, 2], [3, 4], [5, 6]]
const flat = Iterable.flatten(nested)
Array.from(flat) // => [1, 2, 3, 4, 5, 6]

// Flatten different iterable types
const mixed: Array<Iterable<string>> = ["ab", "cd"]
const flatMixed = Iterable.flatten(mixed)
Array.from(flatMixed) // => ["a", "b", "c", "d"]

// Flatten deeply nested (only one level)
const deepNested = [[[1, 2]], [[3, 4]]]
const oneLevelFlat = Iterable.flatten(deepNested)
Array.from(oneLevelFlat) // => [[1, 2], [3, 4]]
// [[1, 2], [3, 4]] (still contains arrays)

// Empty iterables are handled correctly
const withEmpty = [[1, 2], [], [3, 4], []]
const flatWithEmpty = Iterable.flatten(withEmpty)
Array.from(flatWithEmpty) // => [1, 2, 3, 4]
```

## filterMap

**Filtering and transforming Result values**

```efx
import { Iterable, Result } from "effect"

// Parse strings to numbers, keeping only valid ones
const strings = ["1", "2", "invalid", "4", "not-a-number"]
const numbers = Iterable.filterMap(strings, (s) => {
  const num = parseInt(s)
  return isNaN(num) ? Result.failVoid : Result.succeed(num)
})
Array.from(numbers) // => [1, 2, 4]

// Extract specific properties from objects
const users = [
  { name: "Alice", age: 25, email: "alice@example.com" },
  { name: "Bob", age: 17, email: undefined },
  { name: "Charlie", age: 30, email: "charlie@example.com" },
  { name: "David", age: 16, email: undefined }
]
const adultEmails = Iterable.filterMap(
  users,
  (user) =>
    user.age >= 18 && user.email ? Result.succeed(user.email) : Result.failVoid
)
Array.from(adultEmails) // => ["alice@example.com", "charlie@example.com"]

// Use index in transformation
const items = ["a", "b", "c", "d", "e"]
const evenIndexItems = Iterable.filterMap(
  items,
  (item, i) => i % 2 === 0 ? Result.succeed(`${i}: ${item}`) : Result.failVoid
)
Array.from(evenIndexItems) // => ["0: a", "2: c", "4: e"]
```

## filterMapWhile

**Filtering and transforming until failure**

```efx
import { Iterable, Result } from "effect"

// Parse numbers until we hit an invalid one
const strings = ["1", "2", "3", "invalid", "4", "5"]
const numbers = Iterable.filterMapWhile(strings, (s) => {
  const num = parseInt(s)
  return isNaN(num) ? Result.failVoid : Result.succeed(num)
})
Array.from(numbers) // => [1, 2, 3]

// Take elements while they meet a condition and transform them
const values = [2, 4, 6, 7, 8, 10]
const doubledEvens = Iterable.filterMapWhile(
  values,
  (n) => n % 2 === 0 ? Result.succeed(n * 2) : Result.failVoid
)
Array.from(doubledEvens) // => [4, 8, 12]

// Process with index until condition fails
const letters = ["a", "b", "c", "d", "e"]
const indexedUntilC = Iterable.filterMapWhile(
  letters,
  (letter, i) => letter !== "c" ? Result.succeed(`${i}: ${letter}`) : Result.failVoid
)
Array.from(indexedUntilC) // => ["0: a", "1: b"]
```

## getSomes

**Extracting Some values**

```efx
import { Iterable, Option } from "effect"

Array.from(Iterable.getSomes([Option.some(1), Option.none(), Option.some(2)])) // => [1, 2]
```

## getFailures

**Extracting failures**

```efx
import { Iterable, Result } from "effect"

Array.from(Iterable.getFailures([
  Result.succeed(1),
  Result.fail("err"),
  Result.succeed(2)
])) // => ["err"]
```

## getSuccesses

**Extracting successes**

```efx
import { Iterable, Result } from "effect"

Array.from(Iterable.getSuccesses([
  Result.succeed(1),
  Result.fail("err"),
  Result.succeed(2)
])) // => [1, 2]
```

## filter

**Filtering elements**

```efx
import { Iterable } from "effect"

// Filter even numbers
const numbers = [1, 2, 3, 4, 5, 6]
const evens = Iterable.filter(numbers, (x) => x % 2 === 0)
Array.from(evens) // => [2, 4, 6]

// Filter with index
const items = ["a", "b", "c", "d"]
const oddPositions = Iterable.filter(items, (_, i) => i % 2 === 1)
Array.from(oddPositions) // => ["b", "d"]

// Type refinement
const mixed: Array<string | number> = ["hello", 42, "world", 100]
const onlyStrings = Iterable.filter(
  mixed,
  (x): x is string => typeof x === "string"
)
Array.from(onlyStrings) // => ["hello", "world"]

// Combine with map
const processed = Iterable.map(
  Iterable.filter([1, 2, 3, 4, 5], (x) => x > 2),
  (x) => x * 10
)
Array.from(processed) // => [30, 40, 50]
```

## flatMapNullishOr

**Flat mapping nullable results**

```efx
import { Iterable } from "effect"

// Extract valid elements from nullable function results
const data = ["1", "2", "invalid", "4"]
const parsed = Iterable.flatMapNullishOr(data, (s) => {
  const num = parseInt(s)
  return isNaN(num) ? null : num * 2
})
Array.from(parsed) // => [2, 4, 8]

// Safe property access
const objects = [
  { nested: { value: 10 } },
  { nested: null },
  { nested: { value: 20 } },
  {}
]
const values = Iterable.flatMapNullishOr(objects, (obj) => obj.nested?.value)
Array.from(values) // => [10, 20]

// Working with Map.get (returns undefined for missing keys)
const map = new Map([
  ["a", 1],
  ["b", 2],
  ["c", 3]
])
const keys = ["a", "x", "b", "y", "c"]
const foundValues = Iterable.flatMapNullishOr(keys, (key) => map.get(key))
Array.from(foundValues) // => [1, 2, 3]
```

## some

**Checking whether some element matches**

```efx
import { Iterable } from "effect"

const numbers = [1, 3, 5, 7, 8]
const hasEven = Iterable.some(numbers, (x) => x % 2 === 0)
hasEven // => true

const allOdd = [1, 3, 5, 7]
const hasEvenInAllOdd = Iterable.some(allOdd, (x) => x % 2 === 0)
hasEvenInAllOdd // => false

// With index
const letters = ["a", "b", "c"]
const hasElementAtIndex2 = Iterable.some(letters, (_, i) => i === 2)
hasElementAtIndex2 // => true

// Early termination - stops at first match
const infiniteOdds = Iterable.filter(Iterable.range(1), (x) => x % 2 === 1)
const hasEvenInInfiniteOdds = Iterable.some(
  Iterable.take(infiniteOdds, 1000),
  (x) => x % 2 === 0
)
hasEvenInInfiniteOdds // => false

// Type guard usage
const mixed: Array<string | number> = [1, 2, "hello"]
const hasString = Iterable.some(
  mixed,
  (x): x is string => typeof x === "string"
)
hasString // => true
```

## unfold

**Unfolding state into values**

```efx
import { Iterable, Option } from "effect"

// Generate Fibonacci sequence
const fibonacci = Iterable.unfold([0, 1], ([a, b]) => Option.some([a, [b, a + b]]))
const first10Fib = Iterable.take(fibonacci, 10)
Array.from(first10Fib) // => [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]

// Generate powers of 2 up to a limit
const powersOf2 = Iterable.unfold(1, (n) => n <= 1000 ? Option.some([n, n * 2]) : Option.none())
Array.from(powersOf2) // => [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

// Generate countdown
const countdown = Iterable.unfold(5, (n) => n > 0 ? Option.some([n, n - 1]) : Option.none())
Array.from(countdown) // => [5, 4, 3, 2, 1]

// Generate collatz sequence
const collatz = Iterable.unfold(7, (n) => {
  if (n === 1) return Option.none()
  const next = n % 2 === 0 ? n / 2 : n * 3 + 1
  return Option.some([n, next])
})
Array.from(collatz) // => [7, 22, 11, 34, 17, 52, 26, 13, 40, 20, 10, 5, 16, 8, 4, 2]
```

## forEach

**Iterating with side effects**

```efx
import { Iterable } from "effect"

// Collect each visited element
const numbers = [1, 2, 3, 4, 5]
const visited: Array<number> = []
Iterable.forEach(numbers, (n) => visited.push(n))
visited // => [1, 2, 3, 4, 5]

// Use index in the callback
const letters = ["a", "b", "c"]
const indexed: Array<string> = []
Iterable.forEach(letters, (letter, i) => {
  indexed.push(`${i}: ${letter}`)
})
indexed // => ["0: a", "1: b", "2: c"]

// Side effects with any iterable
const results: Array<number> = []
Iterable.forEach(Iterable.range(1, 5), (n) => {
  results.push(n * n)
})
results // => [1, 4, 9, 16, 25]

// Process in chunks
const data = Iterable.chunksOf([1, 2, 3, 4, 5, 6], 2)
const processed: Array<Array<number>> = []
Iterable.forEach(data, (chunk) => {
  processed.push(Array.from(chunk))
})
processed // => [[1, 2], [3, 4], [5, 6]]
```

## reduce

**Reducing an iterable**

```efx
import { Iterable } from "effect"

// Sum all numbers
const numbers = [1, 2, 3, 4, 5]
const sum = Iterable.reduce(numbers, 0, (acc, n) => acc + n)
sum // => 15

// Find maximum value
const values = [3, 1, 4, 1, 5, 9, 2]
Iterable.reduce(values, -Infinity, (max, value) => Math.max(max, value)) // => 9

// Build an object from key-value pairs
const pairs = [["a", 1], ["b", 2], ["c", 3]] as const
const obj = Iterable.reduce(
  pairs,
  {} as Record<string, number>,
  (acc, [key, value]) => {
    acc[key] = value
    return acc
  }
)
obj // => { a: 1, b: 2, c: 3 }

// Use index in the reducer
const letters = ["a", "b", "c"]
const indexed = Iterable.reduce(
  letters,
  [] as Array<string>,
  (acc, letter, i) => {
    acc.push(`${i}: ${letter}`)
    return acc
  }
)
indexed // => ["0: a", "1: b", "2: c"]
```

## dedupeAdjacentWith

**Deduplicating adjacent elements with custom equivalence**

```efx
import { Iterable } from "effect"

// Remove adjacent duplicates with custom equality
const numbers = [1, 1, 2, 2, 3, 1, 1]
const dedupedNumbers = Iterable.dedupeAdjacentWith(numbers, (a, b) => a === b)
Array.from(dedupedNumbers) // => [1, 2, 3, 1]

// Case-insensitive deduplication
const words = ["Hello", "HELLO", "world", "World", "test"]
const caseInsensitive = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()
const dedupedWords = Iterable.dedupeAdjacentWith(words, caseInsensitive)
Array.from(dedupedWords) // => ["Hello", "world", "test"]

// Deduplication by object property
const users = [
  { id: 1, name: "Alice" },
  { id: 1, name: "Alice Updated" }, // different name, same id
  { id: 2, name: "Bob" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" }
]
const byId = (a: typeof users[0], b: typeof users[0]) => a.id === b.id
const dedupedUsers = Iterable.dedupeAdjacentWith(users, byId)
Array.from(dedupedUsers, (user) => user.id) // => [1, 2, 3]

// Approximate numeric equality
const floats = [1.0, 1.01, 1.02, 2.0, 2.01, 3.0]
const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.1
const dedupedFloats = Iterable.dedupeAdjacentWith(floats, approxEqual)
Array.from(dedupedFloats) // => [1, 2, 3]
```

## dedupeAdjacent

**Deduplicating adjacent elements**

```efx
import { Iterable } from "effect"

// Remove adjacent duplicate numbers
const numbers = [1, 1, 2, 2, 2, 3, 1, 1]
const deduped = Iterable.dedupeAdjacent(numbers)
Array.from(deduped) // => [1, 2, 3, 1]

// Remove adjacent duplicate characters
const letters = "aabbccaa"
const dedupedLetters = Iterable.dedupeAdjacent(letters)
Array.from(dedupedLetters) // => ["a", "b", "c", "a"]

// Works with objects using deep equality
const objects = [
  { type: "A" },
  { type: "A" },
  { type: "B" },
  { type: "B" },
  { type: "A" }
]
const dedupedObjects = Iterable.dedupeAdjacent(objects)
Array.from(dedupedObjects, (object) => object.type) // => ["A", "B", "A"]

// Clean up streaming data
const sensorData = [100, 100, 100, 101, 101, 102, 102, 102, 100]
const cleanedData = Iterable.dedupeAdjacent(sensorData)
Array.from(cleanedData) // => [100, 101, 102, 100]
```

## cartesianWith

**Combining cartesian products**

```efx
import { Iterable } from "effect"

// Create coordinate pairs
const xs = [1, 2]
const ys = ["a", "b", "c"]
const coordinates = Iterable.cartesianWith(xs, ys, (x, y) => `(${x},${y})`)
Array.from(coordinates) // => ["(1,a)", "(1,b)", "(1,c)", "(2,a)", "(2,b)", "(2,c)"]

// Generate all combinations of options
const sizes = ["S", "M", "L"]
const colors = ["red", "blue"]
const products = Iterable.cartesianWith(
  sizes,
  colors,
  (size, color) => ({ size, color })
)
Array.from(products, ({ color, size }) => `${size}:${color}`) // => ["S:red", "S:blue", "M:red", "M:blue", "L:red", "L:blue"]

// Mathematical operations on all pairs
const a = [1, 2, 3]
const b = [10, 20]
const mathProducts = Iterable.cartesianWith(a, b, (x, y) => x * y)
Array.from(mathProducts) // => [10, 20, 20, 40, 30, 60]

// Create test data combinations
const userTypes = ["admin", "user"]
const features = ["read", "write", "delete"]
const testCases = Iterable.cartesianWith(
  userTypes,
  features,
  (user, feature) => `${user}_can_${feature}`
)
Array.from(testCases) // => ["admin_can_read", "admin_can_write", "admin_can_delete", "user_can_read", "user_can_write", "user_can_delete"]
```

## cartesian

**Generating cartesian pairs**

```efx
import { Iterable } from "effect"

// All pairs of numbers and letters
const numbers = [1, 2, 3]
const letters = ["a", "b"]
const pairs = Iterable.cartesian(numbers, letters)
Array.from(pairs) // => [[1, "a"], [1, "b"], [2, "a"], [2, "b"], [3, "a"], [3, "b"]]

// Generate coordinate grid
const x = [0, 1, 2]
const y = [0, 1]
const grid = Iterable.cartesian(x, y)
Array.from(grid) // => [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]

// All combinations for testing
const browsers = ["chrome", "firefox"]
const devices = ["desktop", "mobile", "tablet"]
const testMatrix = Iterable.cartesian(browsers, devices)
Array.from(testMatrix, ([browser, device]) => `${browser}:${device}`) // => ["chrome:desktop", "chrome:mobile", "chrome:tablet", "firefox:desktop", "firefox:mobile", "firefox:tablet"]

// Empty iterable results in empty cartesian product
const empty = Iterable.empty<number>()
const withEmpty = Iterable.cartesian([1, 2], empty)
Array.from(withEmpty) // => []
```

## countBy

**Counting matching elements**

```efx
import { Iterable } from "effect"

Iterable.countBy([1, 2, 3, 4, 5], (n) => n % 2 === 0) // => 2
```
