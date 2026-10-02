# effect/MutableHashSet

The examples in the JSDoc of `packages/effect/src/MutableHashSet.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## MutableHashSet

**Using a mutable hash set**

```efx
import { MutableHashSet } from "effect"

// Create a mutable hash set
const set: MutableHashSet.MutableHashSet<string> = MutableHashSet.make(
  "apple",
  "banana"
)

// Add elements
MutableHashSet.add(set, "cherry")

// Check if elements exist
MutableHashSet.has(set, "apple") // => true
MutableHashSet.has(set, "grape") // => false

// Collect the iterator values
Array.from(set) // => ["apple", "banana", "cherry"]

// Get size
MutableHashSet.size(set) // => 3
```

## empty

**Creating an empty set**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.empty<string>()

// Add some values
MutableHashSet.add(set, "apple")
MutableHashSet.add(set, "banana")
MutableHashSet.add(set, "apple") // Duplicate, no effect

MutableHashSet.size(set) // => 2
Array.from(set) // => ["apple", "banana"]
```

## fromIterable

**Creating a set from an iterable**

```efx
import { MutableHashSet } from "effect"

const values = ["apple", "banana", "apple", "cherry", "banana"]
const set = MutableHashSet.fromIterable(values)

MutableHashSet.size(set) // => 3
Array.from(set) // => ["apple", "banana", "cherry"]

// Works with any iterable
MutableHashSet.size(MutableHashSet.fromIterable(new Set([1, 2, 3]))) // => 3

// From string characters
Array.from(MutableHashSet.fromIterable("hello")) // => ["h", "e", "l", "o"]
```

## make

**Creating a set from values**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.make("apple", "banana", "apple", "cherry")

MutableHashSet.size(set) // => 3
Array.from(set) // => ["apple", "banana", "cherry"]

// With numbers
const numbers = MutableHashSet.make(1, 2, 3, 2, 1)
MutableHashSet.size(numbers) // => 3
Array.from(numbers) // => [1, 2, 3]

// Mixed types
MutableHashSet.size(MutableHashSet.make("hello", 42, true, "hello")) // => 3
```

## add

**Adding values**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.empty<string>()

// Add new values
MutableHashSet.add(set, "apple")
MutableHashSet.add(set, "banana")

MutableHashSet.size(set) // => 2
MutableHashSet.has(set, "apple") // => true

// Add duplicate (no effect)
MutableHashSet.add(set, "apple")
MutableHashSet.size(set) // => 2

// Pipe-able version
const addFruit = MutableHashSet.add("cherry")
addFruit(set)
MutableHashSet.size(set) // => 3
```

## has

**Checking for a value**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.make("apple", "banana", "cherry")

MutableHashSet.has(set, "apple") // => true
MutableHashSet.has(set, "grape") // => false

// Pipe-able version
const hasApple = MutableHashSet.has("apple")
hasApple(set) // => true

// Check after adding
MutableHashSet.add(set, "grape")
MutableHashSet.has(set, "grape") // => true
```

## remove

**Removing a value**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.make("apple", "banana", "cherry")

MutableHashSet.size(set) // => 3

// Remove existing value
MutableHashSet.remove(set, "banana")
MutableHashSet.size(set) // => 2
MutableHashSet.has(set, "banana") // => false

// Remove non-existent value (no effect)
MutableHashSet.remove(set, "grape")
MutableHashSet.size(set) // => 2

// Pipe-able version
const removeFruit = MutableHashSet.remove("apple")
removeFruit(set)
MutableHashSet.size(set) // => 1
```

## size

**Checking set size**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.empty<string>()
MutableHashSet.size(set) // => 0

MutableHashSet.add(set, "apple")
MutableHashSet.add(set, "banana")
MutableHashSet.add(set, "apple") // Duplicate
MutableHashSet.size(set) // => 2

MutableHashSet.remove(set, "apple")
MutableHashSet.size(set) // => 1

MutableHashSet.clear(set)
MutableHashSet.size(set) // => 0
```

## clear

**Clearing all values**

```efx
import { MutableHashSet } from "effect"

const set = MutableHashSet.make("apple", "banana", "cherry")

MutableHashSet.size(set) // => 3

// Clear all values
MutableHashSet.clear(set)

MutableHashSet.size(set) // => 0
MutableHashSet.has(set, "apple") // => false
Array.from(set) // => []

// Can still add new values after clearing
MutableHashSet.add(set, "new")
MutableHashSet.size(set) // => 1
```
