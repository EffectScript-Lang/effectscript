# effect/HashSet

The examples in the JSDoc of `packages/effect/src/HashSet.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## HashSet

**Creating and updating a HashSet**

```efx
import { HashSet } from "effect"

// Create a HashSet
const set = HashSet.make("apple", "banana", "cherry")

// Check membership
HashSet.has(set, "apple") // => true
HashSet.has(set, "grape") // => false

// Add values (returns new HashSet)
const updated = HashSet.add(set, "grape")
updated // => HashSet.make("apple", "banana", "cherry", "grape")

// Remove values (returns new HashSet)
const smaller = HashSet.remove(set, "banana")
smaller // => HashSet.make("apple", "cherry")
```

**Extracting value types from a HashSet**

```efx
import { HashSet } from "effect"

// Create a concrete HashSet for type extraction
const fruits = HashSet.make("apple", "banana", "cherry")

// Extract the value type for reuse
type Fruit = HashSet.HashSet.Value<typeof fruits> // string

// Use extracted type in functions
const processFruit = (fruit: Fruit) => {
  return `Processing ${fruit}`
}
processFruit("apple") // => "Processing apple"
```

## HashSet.Value

**Extracting a HashSet value type**

```efx
import { HashSet } from "effect"

const numbers = HashSet.make(1, 2, 3, 4, 5)

// Extract the value type
type NumberType = HashSet.HashSet.Value<typeof numbers> // number

const processNumber = (n: NumberType) => n * 2
processNumber(3) // => 6
```

## empty

**Creating an empty HashSet**

```efx
import { HashSet } from "effect"

const set = HashSet.empty<string>()

HashSet.size(set) // => 0
HashSet.isEmpty(set) // => true

// Add some values
const withValues = HashSet.add(HashSet.add(set, "hello"), "world")
withValues // => HashSet.make("hello", "world")
```

## make

**Creating a HashSet from values**

```efx
import { HashSet } from "effect"

HashSet.make("apple", "banana", "cherry") // => HashSet.make("apple", "banana", "cherry")

HashSet.make(1, 2, 3, 2, 1) // => HashSet.make(1, 2, 3)

HashSet.make("hello", 42, true) // => HashSet.make("hello", 42, true)
```

## fromIterable

**Creating a HashSet from an iterable**

```efx
import { HashSet } from "effect"

HashSet.fromIterable(["a", "b", "c", "b", "a"]) // => HashSet.make("a", "b", "c")

HashSet.fromIterable(new Set([1, 2, 3])) // => HashSet.make(1, 2, 3)

HashSet.fromIterable("hello") // => HashSet.make("h", "e", "l", "o")
```

## isHashSet

**Checking for a HashSet**

```efx
import { HashSet } from "effect"

const set = HashSet.make(1, 2, 3)
const array = [1, 2, 3]

HashSet.isHashSet(set) // => true
HashSet.isHashSet(array) // => false
HashSet.isHashSet(null) // => false
```

## add

**Adding values to a HashSet**

```efx
import { HashSet } from "effect"

const set = HashSet.make("a", "b")
const withC = HashSet.add(set, "c")

set // => HashSet.make("a", "b")
withC // => HashSet.make("a", "b", "c")
HashSet.has(withC, "c") // => true

// Adding existing value has no effect
HashSet.add(set, "a") // => HashSet.make("a", "b")
```

## has

**Checking HashSet membership**

```efx
import { Equal, Hash, HashSet } from "effect"

// Works with any type that implements Equal

const set = HashSet.make("apple", "banana", "cherry")

HashSet.has(set, "apple") // => true
HashSet.has(set, "grape") // => false

class Person implements Equal.Equal {
  constructor(readonly name: string) {}

  [Equal.symbol](other: unknown) {
    return other instanceof Person && this.name === other.name
  }

  [Hash.symbol](): number {
    return Hash.string(this.name)
  }
}

const people = HashSet.make(new Person("Alice"), new Person("Bob"))
HashSet.has(people, new Person("Alice")) // => true
```

## remove

**Removing values from a HashSet**

```efx
import { HashSet } from "effect"

const set = HashSet.make("a", "b", "c")
const withoutB = HashSet.remove(set, "b")

set // => HashSet.make("a", "b", "c")
withoutB // => HashSet.make("a", "c")
HashSet.has(withoutB, "b") // => false

// Removing non-existent value has no effect
HashSet.remove(set, "d") // => HashSet.make("a", "b", "c")
```

## size

**Getting the HashSet size**

```efx
import { HashSet } from "effect"

HashSet.size(HashSet.empty<string>()) // => 0

HashSet.size(HashSet.make("a", "b")) // => 2

HashSet.size(HashSet.fromIterable(["x", "y", "z", "x", "y"])) // => 3
```

## isEmpty

**Checking whether a HashSet is empty**

```efx
import { HashSet } from "effect"

HashSet.isEmpty(HashSet.empty<string>()) // => true

HashSet.isEmpty(HashSet.make("a")) // => false
```

## union

**Combining HashSets**

```efx
import { HashSet } from "effect"

HashSet.union(HashSet.make("a", "b"), HashSet.make("b", "c")) // => HashSet.make("a", "b", "c")
```

## intersection

**Finding common HashSet values**

```efx
import { HashSet } from "effect"

HashSet.intersection(HashSet.make("a", "b", "c"), HashSet.make("b", "c", "d")) // => HashSet.make("b", "c")
```

## difference

**Finding HashSet differences**

```efx
import { HashSet } from "effect"

HashSet.difference(HashSet.make("a", "b", "c"), HashSet.make("b", "d")) // => HashSet.make("a", "c")
```

## isSubset

**Checking subset relationships**

```efx
import { HashSet } from "effect"

const small = HashSet.make("a", "b")
const large = HashSet.make("a", "b", "c", "d")
const other = HashSet.make("x", "y")

HashSet.isSubset(small, large) // => true
HashSet.isSubset(large, small) // => false
HashSet.isSubset(small, other) // => false
HashSet.isSubset(small, small) // => true
```

## map

**Mapping HashSet values**

```efx
import { HashSet } from "effect"

const numbers = HashSet.make(1, 2, 3)
const doubled = HashSet.map(numbers, (n) => n * 2)

doubled // => HashSet.make(2, 4, 6)

// Mapping can reduce size if function produces duplicates
const strings = HashSet.make("apple", "banana", "cherry")
const lengths = HashSet.map(strings, (s) => s.length)
lengths // => HashSet.make(5, 6)
```

## filter

**Filtering HashSet values**

```efx
import { HashSet } from "effect"

HashSet.filter(HashSet.make(1, 2, 3, 4, 5, 6), (n) => n % 2 === 0) // => HashSet.make(2, 4, 6)
```

## some

**Testing whether some values match**

```efx
import { HashSet } from "effect"

const numbers = HashSet.make(1, 2, 3, 4, 5)

HashSet.some(numbers, (n) => n > 3) // => true
HashSet.some(numbers, (n) => n > 10) // => false

HashSet.some(HashSet.empty<number>(), (n) => n > 0) // => false
```

## every

**Testing whether every value matches**

```efx
import { HashSet } from "effect"

const numbers = HashSet.make(2, 4, 6, 8)

HashSet.every(numbers, (n) => n % 2 === 0) // => true
HashSet.every(numbers, (n) => n > 5) // => false

HashSet.every(HashSet.empty<number>(), (n) => n > 0) // => true
```

## reduce

**Reducing HashSet values**

```efx
import { HashSet } from "effect"

const numbers = HashSet.make(1, 2, 3, 4, 5)
HashSet.reduce(numbers, 0, (acc, n) => acc + n) // => 15
```
