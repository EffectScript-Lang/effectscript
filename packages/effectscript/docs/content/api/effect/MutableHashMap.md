# effect/MutableHashMap

The examples in the JSDoc of `packages/effect/src/MutableHashMap.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## MutableHashMap

**Using a mutable hash map**

```efx
import { MutableHashMap } from "effect"

// Create a mutable hash map with string keys and number values
const map: MutableHashMap.MutableHashMap<string, number> = MutableHashMap
  .empty()

// Add some data
MutableHashMap.set(map, "count", 42)
MutableHashMap.set(map, "total", 100)

Array.from(map) // => [["count", 42], ["total", 100]]
```

## empty

**Creating an empty map**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.empty<string, number>()

// Add some entries
MutableHashMap.set(map, "key1", 42)
MutableHashMap.set(map, "key2", 100)

MutableHashMap.size(map) // => 2
```

## make

**Creating a map from entries**

```efx
import { MutableHashMap, Option } from "effect"

const map = MutableHashMap.make(
  ["key1", 42],
  ["key2", 100],
  ["key3", 200]
)

MutableHashMap.get(map, "key1") // => Option.some(42)
MutableHashMap.size(map) // => 3
```

## fromIterable

**Creating a map from an iterable**

```efx
import { MutableHashMap, Option } from "effect"

const entries = [
  ["apple", 1],
  ["banana", 2],
  ["cherry", 3]
] as const

const map = MutableHashMap.fromIterable(entries)

MutableHashMap.get(map, "banana") // => Option.some(2)
MutableHashMap.size(map) // => 3

// Works with any iterable
const fromMap = MutableHashMap.fromIterable(new Map([["x", 10], ["y", 20]]))
MutableHashMap.get(fromMap, "x") // => Option.some(10)
```

## get

**Getting a value**

```efx
import { MutableHashMap, Option } from "effect"

const map = MutableHashMap.make(["key1", 42], ["key2", 100])

MutableHashMap.get(map, "key1") // => Option.some(42)
MutableHashMap.get(map, "key3") // => Option.none()

// Pipe-able version
MutableHashMap.get("key1")(map) // => Option.some(42)
```

## keys

**Reading keys**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.make(
  ["apple", 1],
  ["banana", 2],
  ["cherry", 3]
)

Array.from(MutableHashMap.keys(map)) // => ["apple", "banana", "cherry"]
```

## values

**Reading values**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.make(
  ["apple", 1],
  ["banana", 2],
  ["cherry", 3]
)

const allValues = Array.from(MutableHashMap.values(map)) // => [1, 2, 3]

// Useful for calculations
allValues.reduce((sum, value) => sum + value, 0) // => 6

// Filter values
allValues.filter((value) => value > 1) // => [2, 3]
```

## has

**Checking for a key**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.make(["key1", 42], ["key2", 100])

MutableHashMap.has(map, "key1") // => true
MutableHashMap.has(map, "key3") // => false

// Pipe-able version
MutableHashMap.has("key1")(map) // => true
```

## set

**Setting key-value pairs**

```efx
import { MutableHashMap, Option } from "effect"

const map = MutableHashMap.empty<string, number>()

// Add new entries
MutableHashMap.set(map, "key1", 42)
MutableHashMap.set(map, "key2", 100)

MutableHashMap.get(map, "key1") // => Option.some(42)
MutableHashMap.size(map) // => 2

// Update existing entry
MutableHashMap.set(map, "key1", 999)
MutableHashMap.get(map, "key1") // => Option.some(999)

// Pipe-able version
MutableHashMap.set("key3", 300)(map)
MutableHashMap.size(map) // => 3
```

## modify

**Modifying existing values**

```efx
import { MutableHashMap, Option } from "effect"

const map = MutableHashMap.make(["count", 5], ["total", 100])

// Increment existing value
MutableHashMap.modify(map, "count", (n) => n + 1)
MutableHashMap.get(map, "count") // => Option.some(6)

// Double existing value
MutableHashMap.modify(map, "total", (n) => n * 2)
MutableHashMap.get(map, "total") // => Option.some(200)

// Try to modify non-existent key (no effect)
MutableHashMap.modify(map, "missing", (n) => n + 1)
MutableHashMap.has(map, "missing") // => false

// Pipe-able version
MutableHashMap.modify("count", (n: number) => n + 1)(map)
MutableHashMap.get(map, "count") // => Option.some(7)
```

## modifyAt

**Updating or removing a key**

```efx
import { MutableHashMap, Option } from "effect"

const map = MutableHashMap.make(["count", 5])

// Update existing key
MutableHashMap.modifyAt(
  map,
  "count",
  (option) => Option.map(option, (n) => n * 2)
)
MutableHashMap.get(map, "count") // => Option.some(10)

// Add new key
MutableHashMap.modifyAt(
  map,
  "new",
  (option) => Option.isNone(option) ? Option.some(42) : option
)
MutableHashMap.get(map, "new") // => Option.some(42)

// Remove key by returning None
MutableHashMap.modifyAt(map, "count", () => Option.none())
MutableHashMap.get(map, "count") // => Option.none()

// Conditional update
MutableHashMap.modifyAt(
  map,
  "new",
  (option) => Option.filter(option, (n) => n > 50) // Remove if <= 50
)
MutableHashMap.get(map, "new") // => Option.none()
```

## remove

**Removing a key**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.make(
  ["key1", 42],
  ["key2", 100],
  ["key3", 200]
)

MutableHashMap.size(map) // => 3

// Remove existing key
MutableHashMap.remove(map, "key2")
MutableHashMap.size(map) // => 2
MutableHashMap.has(map, "key2") // => false

// Remove non-existent key (no effect)
MutableHashMap.remove(map, "nonexistent")
MutableHashMap.size(map) // => 2

// Pipe-able version
MutableHashMap.remove("key1")(map)
MutableHashMap.size(map) // => 1
```

## clear

**Clearing all entries**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.make(
  ["key1", 42],
  ["key2", 100],
  ["key3", 200]
)

MutableHashMap.size(map) // => 3

// Clear all entries
MutableHashMap.clear(map)

MutableHashMap.size(map) // => 0
MutableHashMap.has(map, "key1") // => false

// Can still add new entries after clearing
MutableHashMap.set(map, "new", 999)
Array.from(map) // => [["new", 999]]
```

## size

**Checking map size**

```efx
import { MutableHashMap } from "effect"

const map = MutableHashMap.empty<string, number>()
MutableHashMap.size(map) // => 0

MutableHashMap.set(map, "key1", 42)
MutableHashMap.set(map, "key2", 100)
MutableHashMap.size(map) // => 2

MutableHashMap.remove(map, "key1")
MutableHashMap.size(map) // => 1

MutableHashMap.clear(map)
MutableHashMap.size(map) // => 0
```
