# effect/Array

The examples in the JSDoc of `packages/effect/src/Array.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Array

**Accessing the Array constructor**

```efx
import { Array } from "effect"

Array.Array === globalThis.Array // => true
```

## NonEmptyReadonlyArray

**Typing a non-empty array**

```efx
import type { Array } from "effect"

const nonEmpty: Array.NonEmptyReadonlyArray<number> = [1, 2, 3]
const head: number = nonEmpty[0] // guaranteed to exist

head // => 1
```

## NonEmptyArray

**Typing a mutable non-empty array**

```efx
import type { Array } from "effect"

const nonEmpty: Array.NonEmptyArray<number> = [1, 2, 3]
nonEmpty.push(4)

nonEmpty // => [1, 2, 3, 4]
```

## make

**Creating an array from values**

```efx
import { Array } from "effect"

Array.make(1, 2, 3) // => [1, 2, 3]
```

## allocate

**Allocating a fixed-size array**

```efx
import { Array } from "effect"

Array.allocate<number>(3).length // => 3
```

## makeBy

**Generating values from indices**

```efx
import { Array } from "effect"

Array.makeBy(5, (n) => n * 2) // => [0, 2, 4, 6, 8]
```

## range

**Creating a range**

```efx
import { Array } from "effect"

Array.range(1, 3) // => [1, 2, 3]
```

## replicate

**Repeating a value**

```efx
import { Array } from "effect"

Array.replicate("a", 3) // => ["a", "a", "a"]
```

## fromIterable

**Converting a Set to an array**

```efx
import { Array } from "effect"

Array.fromIterable(new Set([1, 2, 3])) // => [1, 2, 3]
```

## ensure

**Normalizing input**

```efx
import { Array } from "effect"

Array.ensure("a") // => ["a"]
Array.ensure(["a", "b", "c"]) // => ["a", "b", "c"]
```

## fromRecord

**Converting a record to entries**

```efx
import { Array } from "effect"

Array.fromRecord({ a: 1, b: 2, c: 3 }) // => [["a", 1], ["b", 2], ["c", 3]]
```

## fromOption

**Converting an Option to an array**

```efx
import { Array, Option } from "effect"

Array.fromOption(Option.some(1)) // => [1]
Array.fromOption(Option.none()) // => []
```

## match

**Branching on emptiness**

```efx
import { Array } from "effect"

const describe = Array.match({
  onEmpty: () => "empty",
  onNonEmpty: ([head, ...tail]) => `head: ${head}, tail: ${tail.length}`
})

describe([]) // => "empty"
describe([1, 2, 3]) // => "head: 1, tail: 2"
```

## matchLeft

**Destructuring head and tail**

```efx
import { Array } from "effect"

const matchLeft = Array.matchLeft({
  onEmpty: () => "empty",
  onNonEmpty: (head, tail) => `head: ${head}, tail: ${tail.length}`
})

matchLeft([]) // => "empty"
matchLeft([1, 2, 3]) // => "head: 1, tail: 2"
```

## matchRight

**Destructuring init and last**

```efx
import { Array } from "effect"

const matchRight = Array.matchRight({
  onEmpty: () => "empty",
  onNonEmpty: (init, last) => `init: ${init.length}, last: ${last}`
})

matchRight([]) // => "empty"
matchRight([1, 2, 3]) // => "init: 2, last: 3"
```

## prepend

**Prepending an element**

```efx
import { Array } from "effect"

Array.prepend([2, 3, 4], 1) // => [1, 2, 3, 4]
```

## prependAll

**Prepending multiple elements**

```efx
import { Array } from "effect"

Array.prependAll([2, 3], [0, 1]) // => [0, 1, 2, 3]
```

## append

**Appending an element**

```efx
import { Array } from "effect"

Array.append([1, 2, 3], 4) // => [1, 2, 3, 4]
```

## appendAll

**Concatenating arrays**

```efx
import { Array } from "effect"

Array.appendAll([1, 2], [3, 4]) // => [1, 2, 3, 4]
```

## scan

**Running totals**

```efx
import { Array } from "effect"

Array.scan([1, 2, 3, 4], 0, (acc, value) => acc + value) // => [0, 1, 3, 6, 10]
```

## scanRight

**Scanning running totals in reverse**

```efx
import { Array } from "effect"

Array.scanRight([1, 2, 3, 4], 0, (acc, value) => acc + value) // => [10, 9, 7, 4, 0]
```

## isArray

**Type-guarding an unknown value**

```efx
import { Array } from "effect"

Array.isArray(null) // => false
Array.isArray([1, 2, 3]) // => true
```

## isArrayEmpty

**Checking for an empty array**

```efx
import { Array } from "effect"

Array.isArrayEmpty([]) // => true
Array.isArrayEmpty([1, 2, 3]) // => false
```

## isReadonlyArrayEmpty

**Checking for an empty readonly array**

```efx
import { Array } from "effect"

Array.isReadonlyArrayEmpty([]) // => true
Array.isReadonlyArrayEmpty([1, 2, 3]) // => false
```

## isArrayNonEmpty

**Checking for a non-empty array**

```efx
import { Array } from "effect"

Array.isArrayNonEmpty([]) // => false
Array.isArrayNonEmpty([1, 2, 3]) // => true
```

## isReadonlyArrayNonEmpty

**Checking for a non-empty readonly array**

```efx
import { Array } from "effect"

Array.isReadonlyArrayNonEmpty([]) // => false
Array.isReadonlyArrayNonEmpty([1, 2, 3]) // => true
```

## length

**Getting the length**

```efx
import { Array } from "effect"

Array.length([1, 2, 3]) // => 3
```

## get

**Accessing indexes safely**

```efx
import { Array, Option } from "effect"

Array.get([1, 2, 3], 1) // => Option.some(2)
Array.get([1, 2, 3], 10) // => Option.none()
```

## getUnsafe

**Accessing indexes unsafely**

```efx
import { Array } from "effect"

Array.getUnsafe([1, 2, 3], 1) // => 2
// Array.getUnsafe([1, 2, 3], 10) // throws Error
```

## unprepend

**Destructuring head and tail**

```efx
import { Array } from "effect"

Array.unprepend([1, 2, 3, 4]) // => [1, [2, 3, 4]]
```

## unappend

**Destructuring init and last**

```efx
import { Array } from "effect"

Array.unappend([1, 2, 3, 4]) // => [[1, 2, 3], 4]
```

## head

**Getting the first element**

```efx
import { Array, Option } from "effect"

Array.head([1, 2, 3]) // => Option.some(1)
Array.head([]) // => Option.none()
```

## headNonEmpty

**Getting the head of a non-empty array**

```efx
import { Array } from "effect"

Array.headNonEmpty([1, 2, 3, 4]) // => 1
```

## last

**Getting the last element**

```efx
import { Array, Option } from "effect"

Array.last([1, 2, 3]) // => Option.some(3)
Array.last([]) // => Option.none()
```

## lastNonEmpty

**Getting the last of a non-empty array**

```efx
import { Array } from "effect"

Array.lastNonEmpty([1, 2, 3, 4]) // => 4
```

## tail

**Getting the tail**

```efx
import { Array, Option } from "effect"

Array.tail([1, 2, 3, 4]) // => Option.some([2, 3, 4])
Array.tail([]) // => Option.none()
```

## tailNonEmpty

**Getting the tail of a non-empty array**

```efx
import { Array } from "effect"

Array.tailNonEmpty([1, 2, 3, 4]) // => [2, 3, 4]
```

## init

**Getting init**

```efx
import { Array, Option } from "effect"

Array.init([1, 2, 3, 4]) // => Option.some([1, 2, 3])
Array.init([]) // => Option.none()
```

## initNonEmpty

**Getting init of a non-empty array**

```efx
import { Array } from "effect"

Array.initNonEmpty([1, 2, 3, 4]) // => [1, 2, 3]
```

## take

**Taking from the start**

```efx
import { Array } from "effect"

Array.take([1, 2, 3, 4, 5], 3) // => [1, 2, 3]
```

## takeRight

**Taking from the end**

```efx
import { Array } from "effect"

Array.takeRight([1, 2, 3, 4, 5], 3) // => [3, 4, 5]
```

## takeWhile

**Taking while condition holds**

```efx
import { Array } from "effect"

Array.takeWhile([1, 3, 2, 4, 1, 2], (x) => x < 4) // => [1, 3, 2]
```

## span

**Splitting at predicate boundary**

```efx
import { Array } from "effect"

Array.span([1, 3, 2, 4, 5], (x) => x % 2 === 1) // => [[1, 3], [2, 4, 5]]
```

## drop

**Dropping from the start**

```efx
import { Array } from "effect"

Array.drop([1, 2, 3, 4, 5], 2) // => [3, 4, 5]
```

## dropRight

**Dropping from the end**

```efx
import { Array } from "effect"

Array.dropRight([1, 2, 3, 4, 5], 2) // => [1, 2, 3]
```

## dropWhile

**Dropping while condition holds**

```efx
import { Array } from "effect"

Array.dropWhile([1, 2, 3, 4, 5], (x) => x < 4) // => [4, 5]
```

## findFirstIndex

**Finding an index**

```efx
import { Array, Option } from "effect"

Array.findFirstIndex([5, 3, 8, 9], (x) => x > 5) // => Option.some(2)
```

## findLastIndex

**Finding the last matching index**

```efx
import { Array, Option } from "effect"

Array.findLastIndex([1, 3, 8, 9], (x) => x < 5) // => Option.some(1)
```

## findFirst

**Finding the first match**

```efx
import { Array, Option } from "effect"

Array.findFirst([1, 2, 3, 4, 5], (x) => x > 3) // => Option.some(4)
```

## findFirstWithIndex

**Finding element with its index**

```efx
import { Array, Option } from "effect"

Array.findFirstWithIndex([1, 2, 3, 4, 5], (x) => x > 3) // => Option.some([4, 3])
```

## findLast

**Finding the last match**

```efx
import { Array, Option } from "effect"

Array.findLast([1, 2, 3, 4, 5], (n) => n % 2 === 0) // => Option.some(4)
```

## insertAt

**Inserting at an index**

```efx
import { Array, Option } from "effect"

Array.insertAt(["a", "b", "c", "e"], 3, "d") // => Option.some(["a", "b", "c", "d", "e"])
```

## replace

**Replacing an element**

```efx
import { Array, Option } from "effect"

Array.replace([1, 2, 3], 1, 4) // => Option.some([1, 4, 3])
```

## modify

**Modifying an element**

```efx
import { Array, Option } from "effect"

const values = [1, 2, 3, 4]
const double = (n: number) => n * 2

Array.modify(values, 2, double) // => Option.some([1, 2, 6, 4])
Array.modify(values, 5, double) // => Option.none()
```

## remove

**Removing an element**

```efx
import { Array } from "effect"

Array.remove([1, 2, 3, 4], 2) // => [1, 2, 4]
Array.remove([1, 2, 3, 4], 5) // => [1, 2, 3, 4]
```

## reverse

**Reversing an array**

```efx
import { Array } from "effect"

Array.reverse([1, 2, 3, 4]) // => [4, 3, 2, 1]
```

## sort

**Sorting numbers**

```efx
import { Array, Order } from "effect"

Array.sort([3, 1, 4, 1, 5], Order.Number) // => [1, 1, 3, 4, 5]
```

## sortWith

**Sorting strings by length**

```efx
import { Array, Order } from "effect"

Array.sortWith(["aaa", "b", "cc"], (s) => s.length, Order.Number) // => ["b", "cc", "aaa"]
```

## sortBy

**Sorting by multiple keys**

```efx
import { Array } from "effect"

const users = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Charlie", age: 30 }
]

const sortedUsers = users
  |> Array.sortBy(
    Order.mapInput(Order.Number, (user: (typeof users)[number]) => user.age),
    Order.mapInput(Order.String, (user: (typeof users)[number]) => user.name)
  )

sortedUsers.map((user) => user.name).join(",") // => "Bob,Alice,Charlie"
```

## zip

**Zipping two arrays**

```efx
import { Array } from "effect"

Array.zip([1, 2, 3], ["a", "b"]) // => [[1, "a"], [2, "b"]]
```

## zipWith

**Zipping with addition**

```efx
import { Array } from "effect"

Array.zipWith([1, 2, 3], [4, 5, 6], (a, b) => a + b) // => [5, 7, 9]
```

## unzip

**Unzipping pairs**

```efx
import { Array } from "effect"

Array.unzip([[1, "a"], [2, "b"], [3, "c"]]) // => [[1, 2, 3], ["a", "b", "c"]]
```

## intersperse

**Interspersing a separator**

```efx
import { Array } from "effect"

Array.intersperse([1, 2, 3], 0) // => [1, 0, 2, 0, 3]
```

## modifyHeadNonEmpty

**Modifying the head**

```efx
import { Array } from "effect"

Array.modifyHeadNonEmpty([1, 2, 3], (n) => n * 10) // => [10, 2, 3]
```

## setHeadNonEmpty

**Setting the head**

```efx
import { Array } from "effect"

Array.setHeadNonEmpty([1, 2, 3], 10) // => [10, 2, 3]
```

## modifyLastNonEmpty

**Modifying the last element**

```efx
import { Array } from "effect"

Array.modifyLastNonEmpty([1, 2, 3], (n) => n * 2) // => [1, 2, 6]
```

## setLastNonEmpty

**Setting the last element**

```efx
import { Array } from "effect"

Array.setLastNonEmpty([1, 2, 3], 4) // => [1, 2, 4]
```

## rotate

**Rotating elements**

```efx
import { Array } from "effect"

Array.rotate(["a", "b", "c", "d"], 2) // => ["c", "d", "a", "b"]
```

## containsWith

**Checking with custom equality**

```efx
import { Array, pipe } from "effect"

const containsNumber = Array.containsWith((a: number, b: number) => a === b)

pipe([1, 2, 3, 4], containsNumber(3)) // => true
```

## contains

**Checking membership**

```efx
import { Array, pipe } from "effect"

pipe(["a", "b", "c", "d"], Array.contains("c")) // => true
```

## chop

**Chopping an array**

```efx
import { Array } from "effect"

Array.chop([1, 2, 3, 4, 5], (as): [number, Array<number>] => [as[0] * 2, as.slice(1)]) // => [2, 4, 6, 8, 10]
```

## splitAt

**Splitting at an index**

```efx
import { Array } from "effect"

Array.splitAt([1, 2, 3, 4, 5], 3) // => [[1, 2, 3], [4, 5]]
```

## splitAtNonEmpty

**Splitting a non-empty array**

```efx
import { Array } from "effect"

Array.splitAtNonEmpty(["a", "b", "c", "d", "e"], 3) // => [["a", "b", "c"], ["d", "e"]]
```

## split

**Splitting into groups**

```efx
import { Array } from "effect"

Array.split([1, 2, 3, 4, 5, 6, 7, 8], 3) // => [[1, 2, 3], [4, 5, 6], [7, 8]]
```

## splitWhere

**Splitting at a condition**

```efx
import { Array } from "effect"

Array.splitWhere([1, 2, 3, 4, 5], (n) => n > 3) // => [[1, 2, 3], [4, 5]]
```

## copy

**Copying an array**

```efx
import { Array } from "effect"

const original = [1, 2, 3]
const copied = Array.copy(original)

copied // => [1, 2, 3]
original === copied // => false
```

## pad

**Padding an array**

```efx
import { Array } from "effect"

Array.pad([1, 2, 3], 6, 0) // => [1, 2, 3, 0, 0, 0]
```

## chunksOf

**Chunking an array**

```efx
import { Array } from "effect"

Array.chunksOf([1, 2, 3, 4, 5], 2) // => [[1, 2], [3, 4], [5]]
```

## window

**Creating sliding windows**

```efx
import { Array } from "effect"

const values = [1, 2, 3, 4, 5]

Array.window(values, 3) // => [[1, 2, 3], [2, 3, 4], [3, 4, 5]]
Array.window(values, 6) // => []
```

## groupWith

**Grouping consecutive equal elements**

```efx
import { Array } from "effect"

Array.groupWith(
  ["a", "a", "b", "b", "b", "c", "a"],
  (x, y) => x === y
) // => [["a", "a"], ["b", "b", "b"], ["c"], ["a"]]
```

## group

**Grouping adjacent equal elements**

```efx
import { Array } from "effect"

Array.group([1, 1, 2, 2, 2, 3, 1]) // => [[1, 1], [2, 2, 2], [3], [1]]
```

## groupBy

**Grouping by a property**

```efx
import { Array } from "effect"

const people = [
  { name: "Alice", group: "A" },
  { name: "Bob", group: "B" },
  { name: "Charlie", group: "A" }
]

Object.keys(Array.groupBy(people, (person) => person.group)).join(",") // => "A,B"
```

## unionWith

**Computing unions with custom equality**

```efx
import { Array } from "effect"

Array.unionWith([1, 2], [2, 3], (a, b) => a === b) // => [1, 2, 3]
```

## union

**Computing array unions**

```efx
import { Array } from "effect"

Array.union([1, 2], [2, 3]) // => [1, 2, 3]
```

## intersectionWith

**Computing intersections with custom equality**

```efx
import { Array } from "effect"

const array1 = [{ id: 1 }, { id: 2 }, { id: 3 }]
const array2 = [{ id: 3 }, { id: 4 }, { id: 1 }]
const isEquivalent = (a: { id: number }, b: { id: number }) => a.id === b.id

Array.intersectionWith(isEquivalent)(array2)(array1) // => [{ id: 1 }, { id: 3 }]
```

## intersection

**Computing array intersections**

```efx
import { Array } from "effect"

Array.intersection([1, 2, 3], [3, 4, 1]) // => [1, 3]
```

## differenceWith

**Computing differences with custom equality**

```efx
import { Array } from "effect"

Array.differenceWith<number>((a, b) => a === b)([1, 2, 3], [2, 3, 4]) // => [1]
```

## difference

**Computing array differences**

```efx
import { Array } from "effect"

Array.difference([1, 2, 3], [2, 3, 4]) // => [1]
```

## empty

**Creating an empty array**

```efx
import { Array } from "effect"

Array.empty<number>() // => []
```

## of

**Creating a single-element array**

```efx
import { Array } from "effect"

Array.of(1) // => [1]
```

## ReadonlyArray.Infer

**Inferring an element type**

```efx
import type { Array } from "effect"

type StringArrayType = Array.ReadonlyArray.Infer<ReadonlyArray<string>>
// StringArrayType is string
```

## ReadonlyArray.With

**Preserving non-emptiness**

```efx
import type { Array } from "effect"

type Result = Array.ReadonlyArray.With<readonly [number], string>
// Result is NonEmptyArray<string>
```

## ReadonlyArray.OrNonEmpty

**Preserving non-emptiness from either input**

```efx
import type { Array } from "effect"

type Result = Array.ReadonlyArray.OrNonEmpty<
  readonly [number],
  ReadonlyArray<string>,
  number
>
// Result is NonEmptyArray<number>
```

## ReadonlyArray.AndNonEmpty

**Preserving non-emptiness from both inputs**

```efx
import type { Array } from "effect"

type Result = Array.ReadonlyArray.AndNonEmpty<
  readonly [number],
  readonly [string],
  boolean
>
// Result is NonEmptyArray<boolean>
```

## ReadonlyArray.Flatten

**Flattening nested array types**

```efx
import type { Array } from "effect"

type Nested = ReadonlyArray<ReadonlyArray<number>>
type Flattened = Array.ReadonlyArray.Flatten<Nested>
// Flattened is Array<number>
```

## map

**Doubling values**

```efx
import { Array } from "effect"

Array.map([1, 2, 3], (x) => x * 2) // => [2, 4, 6]
```

## flatMap

**Flat mapping an array**

```efx
import { Array } from "effect"

Array.flatMap([1, 2, 3], (x) => [x, x * 2]) // => [1, 2, 2, 4, 3, 6]
```

## flatten

**Flattening nested arrays**

```efx
import { Array } from "effect"

Array.flatten([[1, 2], [], [3, 4], [], [5, 6]]) // => [1, 2, 3, 4, 5, 6]
```

## getSomes

**Extracting Some values**

```efx
import { Array, Option } from "effect"

Array.getSomes([Option.some(1), Option.none(), Option.some(2)]) // => [1, 2]
```

## getFailures

**Extracting failures**

```efx
import { Array, Result } from "effect"

Array.getFailures([Result.succeed(1), Result.fail("err"), Result.succeed(2)]) // => ["err"]
```

## getSuccesses

**Extracting successes**

```efx
import { Array, Result } from "effect"

Array.getSuccesses([Result.succeed(1), Result.fail("err"), Result.succeed(2)]) // => [1, 2]
```

## filterMap

**Filtering and transforming**

```efx
import { Array, Result } from "effect"

Array.filterMap([1, 2, 3, 4], (n) => n % 2 === 0 ? Result.succeed(n * 10) : Result.failVoid) // => [20, 40]
```

## filter

**Filtering even numbers**

```efx
import { Array } from "effect"

Array.filter([1, 2, 3, 4], (x) => x % 2 === 0) // => [2, 4]
```

## partition

**Partitioning with a filter**

```efx
import { Array, Result } from "effect"

Array.partition([1, -2, 3], (n, i) =>
  n > 0 ? Result.succeed(n + i) : Result.fail(`negative:${n}`)
) // => [[1, 5], ["negative:-2"]]
```

## separate

**Separating Results**

```efx
import { Array, Result } from "effect"

Array.separate([Result.succeed(1), Result.fail("error"), Result.succeed(2)]) // => [[1, 2], ["error"]]
```

## reduce

**Summing an array**

```efx
import { Array } from "effect"

Array.reduce([1, 2, 3], 0, (acc, n) => acc + n) // => 6
```

## reduceRight

**Folding from right to left**

```efx
import { Array } from "effect"

Array.reduceRight([1, 2, 3], 0, (acc, n) => acc + n) // => 6
```

## liftPredicate

**Wrapping values conditionally**

```efx
import { Array } from "effect"

const fromEven = Array.liftPredicate((n: number) => n % 2 === 0)

fromEven(1) // => []
fromEven(2) // => [2]
```

## liftOption

**Lifting an Option function**

```efx
import { Array, Option } from "effect"

const parseNumber = Array.liftOption((s: string) => {
  const n = Number(s)
  return isNaN(n) ? Option.none() : Option.some(n)
})

parseNumber("123") // => [123]
parseNumber("abc") // => []
```

## fromNullishOr

**Converting nullable values to an array**

```efx
import { Array } from "effect"

Array.fromNullishOr(1) // => [1]
Array.fromNullishOr(null) // => []
Array.fromNullishOr(undefined) // => []
```

## liftNullishOr

**Lifting a nullable function**

```efx
import { Array } from "effect"

const parseNumber = Array.liftNullishOr((s: string) => {
  const n = Number(s)
  return isNaN(n) ? null : n
})

parseNumber("123") // => [123]
parseNumber("abc") // => []
```

## flatMapNullishOr

**Flat mapping with nullable values**

```efx
import { Array } from "effect"

Array.flatMapNullishOr([1, 2, 3], (n) => (n % 2 === 0 ? null : n)) // => [1, 3]
```

## liftResult

**Lifting a Result function**

```efx
import { Array, Result } from "effect"

const parseNumber = (s: string): Result.Result<number, Error> =>
  isNaN(Number(s))
    ? Result.fail(new Error("Not a number"))
    : Result.succeed(Number(s))

const liftedParseNumber = Array.liftResult(parseNumber)

liftedParseNumber("42") // => [42]
liftedParseNumber("not a number") // => []
```

## every

**Testing all elements**

```efx
import { Array } from "effect"

Array.every([2, 4, 6], (x) => x % 2 === 0) // => true
Array.every([2, 3, 6], (x) => x % 2 === 0) // => false
```

## some

**Testing for any match**

```efx
import { Array } from "effect"

Array.some([1, 3, 4], (x) => x % 2 === 0) // => true
Array.some([1, 3, 5], (x) => x % 2 === 0) // => false
```

## extend

**Computing suffix lengths**

```efx
import { Array } from "effect"

Array.extend([1, 2, 3], (as) => as.length) // => [3, 2, 1]
```

## min

**Finding the minimum**

```efx
import { Array, Order } from "effect"

Array.min([3, 1, 2], Order.Number) // => 1
```

## max

**Finding the maximum**

```efx
import { Array, Order } from "effect"

Array.max([3, 1, 2], Order.Number) // => 3
```

## unfold

**Generating a sequence**

```efx
import { Array, Option } from "effect"

Array.unfold(1, (n) => n <= 5 ? Option.some([n, n + 1]) : Option.none()) // => [1, 2, 3, 4, 5]
```

## makeOrder

**Comparing arrays**

```efx
import { Array, Order } from "effect"

const arrayOrder = Array.makeOrder(Order.Number)

arrayOrder([1, 2], [1, 3]) // => -1
```

## makeEquivalence

**Comparing arrays for equality**

```efx
import { Array } from "effect"

const eq = Array.makeEquivalence<number>((a, b) => a === b)

eq([1, 2, 3], [1, 2, 3]) // => true
```

## forEach

**Iterating with side-effects**

```efx
import { Array } from "effect"

const visited: Array<number> = []
Array.forEach([1, 2, 3], (n) => visited.push(n))

visited // => [1, 2, 3]
```

## dedupeWith

**Deduplicating with custom equality**

```efx
import { Array } from "effect"

Array.dedupeWith([1, 2, 2, 3, 3, 3], (a, b) => a === b) // => [1, 2, 3]
```

## dedupe

**Removing duplicates**

```efx
import { Array } from "effect"

Array.dedupe([1, 2, 1, 3, 2, 4]) // => [1, 2, 3, 4]
```

## dedupeAdjacentWith

**Deduplicating adjacent elements**

```efx
import { Array } from "effect"

Array.dedupeAdjacentWith([1, 1, 2, 2, 3, 3], (a, b) => a === b) // => [1, 2, 3]
```

## dedupeAdjacent

**Removing adjacent duplicates**

```efx
import { Array } from "effect"

Array.dedupeAdjacent([1, 1, 2, 2, 3, 3]) // => [1, 2, 3]
```

## join

**Joining strings**

```efx
import { Array } from "effect"

Array.join(["a", "b", "c"], "-") // => "a-b-c"
```

## mapAccum

**Running sum alongside mapped values**

```efx
import { Array } from "effect"

Array.mapAccum([1, 2, 3], 0, (acc, n) => [acc + n, acc + n]) // => [6, [1, 3, 6]]
```

## cartesianWith

**Combining numbers and letters**

```efx
import { Array } from "effect"

Array.cartesianWith([1, 2], ["a", "b"], (a, b) => `${a}-${b}`) // => ["1-a", "1-b", "2-a", "2-b"]
```

## cartesian

**Generating all pairs from two arrays**

```efx
import { Array } from "effect"

Array.cartesian([1, 2], ["a", "b"]) // => [[1, "a"], [1, "b"], [2, "a"], [2, "b"]]
```

## Do

**Building array comprehensions with do notation**

```efx
import { Array } from "effect"

Array.Do
  |> Array.bind("x", () => [1, 3, 5])
  |> Array.bind("y", () => [2, 4, 6])
  |> Array.filter(({ x, y }) => x < y)
  |> Array.map(({ x, y }) => [x, y] as const) // => [[1, 2], [1, 4], [1, 6], [3, 4], [3, 6], [5, 6]]
```

## bind

**Binding two arrays**

```efx
import { Array } from "effect"

Array.Do
  |> Array.bind("x", () => [1, 2])
  |> Array.bind("y", () => ["a", "b"]) // => [{ x: 1, y: "a" }, { x: 1, y: "b" }, { x: 2, y: "a" }, { x: 2, y: "b" }]
```

## bindTo

**Naming an existing array**

```efx
import { Array } from "effect"

Array.bindTo([1, 2, 3], "x") // => [{ x: 1 }, { x: 2 }, { x: 3 }]
```

## let

**Adding a computed value**

```efx
import { Array } from "effect"

Array.Do
  |> Array.bind("x", () => [1, 2, 3])
  |> Array.let("doubled", ({ x }) => x * 2) // => [{ x: 1, doubled: 2 }, { x: 2, doubled: 4 }, { x: 3, doubled: 6 }]
```

## countBy

**Counting even numbers**

```efx
import { Array } from "effect"

Array.countBy([1, 2, 3, 4, 5], (n) => n % 2 === 0) // => 2
```
