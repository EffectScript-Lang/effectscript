# effect/TxHashSet

The examples in the JSDoc of `packages/effect/src/TxHashSet.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxHashSet

**Using transactional hash sets**

```efx

const program = effect {
  // Create a transactional hash set
  const txSet = await TxHashSet.make("apple", "banana", "cherry")

  // Single operations are automatically transactional
  await TxHashSet.add(txSet, "grape")
  await TxHashSet.has(txSet, "apple") // => true

  // Multi-step atomic operations
  await tx(
    effect {
      const hasCherry = await TxHashSet.has(txSet, "cherry")
      if (hasCherry) {
        await TxHashSet.remove(txSet, "cherry")
        await TxHashSet.add(txSet, "orange")
      }
    }
  )

  await TxHashSet.size(txSet) // => 4
}

await runPromise(program)
```

**Extracting value types inside transactions**

```efx

const program = effect {
  // Create a transactional color set
  const colors = await TxHashSet.make("red", "green", "blue")

  // Extract the value type for reuse
  type Color = TxHashSet.TxHashSet.Value<typeof colors> // string

  // Use extracted type in functions
  const addColor = (color: Color) => TxHashSet.add(colors, color)

  await addColor("yellow")
  await TxHashSet.has(colors, "yellow") // => true
}

await runPromise(program)
```

## TxHashSet.Value

**Extracting a TxHashSet value type**

```efx
import type { TxHashSet } from "effect"

type FruitSet = TxHashSet.TxHashSet<"apple" | "banana" | "cherry">

// Extract the value type
type Fruit = TxHashSet.TxHashSet.Value<FruitSet> // "apple" | "banana" | "cherry"

const processFruit = (fruit: Fruit) => {
  return `Processing ${fruit}`
}

processFruit("apple") // => "Processing apple"
```

## empty

**Creating an empty transactional hash set**

```efx

const program = effect {
  const txSet = await TxHashSet.empty<string>()

  await TxHashSet.size(txSet) // => 0
  await TxHashSet.isEmpty(txSet) // => true

  // Add some values
  await TxHashSet.add(txSet, "hello")
  await TxHashSet.add(txSet, "world")
  await TxHashSet.size(txSet) // => 2
}

await runPromise(program)
```

## make

**Creating transactional hash sets from values**

```efx

const program = effect {
  const fruits = await TxHashSet.make("apple", "banana", "cherry")
  await TxHashSet.size(fruits) // => 3

  const numbers = await TxHashSet.make(1, 2, 3, 2, 1) // Duplicates ignored
  await TxHashSet.size(numbers) // => 3

  const mixed = await TxHashSet.make("hello", 42, true)
  await TxHashSet.size(mixed) // => 3
}

await runPromise(program)
```

## fromIterable

**Creating a transactional hash set from an iterable**

```efx

const program = effect {
  const fromArray = await TxHashSet.fromIterable(["a", "b", "c", "b", "a"])
  await TxHashSet.size(fromArray) // => 3

  const fromSet = await TxHashSet.fromIterable(new Set([1, 2, 3]))
  await TxHashSet.size(fromSet) // => 3

  const fromString = await TxHashSet.fromIterable("hello")
  Array.from(await TxHashSet.toHashSet(fromString)).sort() // => ["e", "h", "l", "o"]
}

await runPromise(program)
```

## fromHashSet

**Creating a transactional hash set from a HashSet**

```efx

const program = effect {
  const hashSet = HashSet.make("x", "y", "z")
  const txSet = await TxHashSet.fromHashSet(hashSet)

  await TxHashSet.size(txSet) // => 3
  await TxHashSet.has(txSet, "y") // => true

  // Original hashSet is unchanged when txSet is modified
  await TxHashSet.add(txSet, "w")
  HashSet.size(hashSet) // => 3
  await TxHashSet.size(txSet) // => 4
}

await runPromise(program)
```

## isTxHashSet

**Checking for a TxHashSet**

```efx

const program = effect {
  const txSet = await TxHashSet.make(1, 2, 3)
  const hashSet = HashSet.make(1, 2, 3)
  const array = [1, 2, 3]

  TxHashSet.isTxHashSet(txSet) // => true
  TxHashSet.isTxHashSet(hashSet) // => false
  TxHashSet.isTxHashSet(array) // => false
  TxHashSet.isTxHashSet(null) // => false
}

await runPromise(program)
```

## add

**Adding values**

```efx

const program = effect {
  const txSet = await TxHashSet.make("a", "b")

  await TxHashSet.add(txSet, "c")
  await TxHashSet.size(txSet) // => 3
  await TxHashSet.has(txSet, "c") // => true

  // Adding existing value has no effect
  await TxHashSet.add(txSet, "a")
  await TxHashSet.size(txSet) // => 3
}

await runPromise(program)
```

## remove

**Removing values**

```efx

const program = effect {
  const txSet = await TxHashSet.make("a", "b", "c")

  await TxHashSet.remove(txSet, "b") // => true
  await TxHashSet.size(txSet) // => 2
  await TxHashSet.has(txSet, "b") // => false

  // Removing non-existent value returns false
  await TxHashSet.remove(txSet, "d") // => false
}

await runPromise(program)
```

## has

**Checking membership**

```efx

const program = effect {
  const txSet = await TxHashSet.make("apple", "banana", "cherry")

  await TxHashSet.has(txSet, "apple") // => true
  await TxHashSet.has(txSet, "grape") // => false

  // Works with any type that implements Equal
  class Person implements Equal.Equal {
    constructor(readonly name: string) {}

    [Equal.symbol](other: unknown) {
      return other instanceof Person && this.name === other.name
    }

    [Hash.symbol](): number {
      return Hash.string(this.name)
    }
  }

  const people = await TxHashSet.make(new Person("Alice"), new Person("Bob"))
  await TxHashSet.has(people, new Person("Alice")) // => true
}

await runPromise(program)
```

## size

**Getting the set size**

```efx

const program = effect {
  const empty = await TxHashSet.empty<string>()
  await TxHashSet.size(empty) // => 0

  const small = await TxHashSet.make("a", "b")
  await TxHashSet.size(small) // => 2

  const fromIterable = await TxHashSet.fromIterable(["x", "y", "z", "x", "y"])
  await TxHashSet.size(fromIterable) // => 3
}

await runPromise(program)
```

## isEmpty

**Checking whether a set is empty**

```efx

const program = effect {
  const empty = await TxHashSet.empty<string>()
  await TxHashSet.isEmpty(empty) // => true

  const nonEmpty = await TxHashSet.make("a")
  await TxHashSet.isEmpty(nonEmpty) // => false
}

await runPromise(program)
```

## isNonEmpty

**Checking whether a set is non-empty**

```efx

const program = effect {
  const empty = await TxHashSet.empty<string>()
  const emptyResult = await TxHashSet.isNonEmpty(empty)

  const nonEmpty = await TxHashSet.make("a")
  const nonEmptyResult = await TxHashSet.isNonEmpty(nonEmpty)
  return [emptyResult, nonEmptyResult] as const
}

await runPromise(program) // => [false, true]
```

## clear

**Clearing all values**

```efx

const program = effect {
  const txSet = await TxHashSet.make("a", "b", "c")
  await TxHashSet.size(txSet) // => 3

  await TxHashSet.clear(txSet)
  await TxHashSet.size(txSet) // => 0
  await TxHashSet.isEmpty(txSet) // => true
}

await runPromise(program)
```

## union

**Combining sets with union**

```efx

const program = effect {
  const set1 = await TxHashSet.make("a", "b")
  const set2 = await TxHashSet.make("b", "c")
  const combined = await TxHashSet.union(set1, set2)

  Array.from(await TxHashSet.toHashSet(combined)).sort() // => ["a", "b", "c"]
  await TxHashSet.size(combined) // => 3
}

await runPromise(program)
```

## intersection

**Finding common values**

```efx

const program = effect {
  const set1 = await TxHashSet.make("a", "b", "c")
  const set2 = await TxHashSet.make("b", "c", "d")
  const common = await TxHashSet.intersection(set1, set2)

  Array.from(await TxHashSet.toHashSet(common)).sort() // => ["b", "c"]
  await TxHashSet.size(common) // => 2
}

await runPromise(program)
```

## difference

**Finding values absent from another set**

```efx

const program = effect {
  const set1 = await TxHashSet.make("a", "b", "c")
  const set2 = await TxHashSet.make("b", "d")
  const diff = await TxHashSet.difference(set1, set2)

  Array.from(await TxHashSet.toHashSet(diff)).sort() // => ["a", "c"]
  await TxHashSet.size(diff) // => 2
}

await runPromise(program)
```

## isSubset

**Checking subset relationships**

```efx

const program = effect {
  const small = await TxHashSet.make("a", "b")
  const large = await TxHashSet.make("a", "b", "c", "d")
  const other = await TxHashSet.make("x", "y")

  await TxHashSet.isSubset(small, large) // => true
  await TxHashSet.isSubset(large, small) // => false
  await TxHashSet.isSubset(small, other) // => false
  await TxHashSet.isSubset(small, small) // => true
}

await runPromise(program)
```

## some

**Testing whether some values match**

```efx

const program = effect {
  const numbers = await TxHashSet.make(1, 2, 3, 4, 5)

  await TxHashSet.some(numbers, (n) => n > 3) // => true
  await TxHashSet.some(numbers, (n) => n > 10) // => false

  const empty = await TxHashSet.empty<number>()
  await TxHashSet.some(empty, (n) => n > 0) // => false
}

await runPromise(program)
```

## every

**Testing whether every value matches**

```efx

const program = effect {
  const numbers = await TxHashSet.make(2, 4, 6, 8)

  await TxHashSet.every(numbers, (n) => n % 2 === 0) // => true
  await TxHashSet.every(numbers, (n) => n > 5) // => false

  const empty = await TxHashSet.empty<number>()
  await TxHashSet.every(empty, (n) => n > 0) // => true
}

await runPromise(program)
```

## map

**Mapping values**

```efx

const program = effect {
  const numbers = await TxHashSet.make(1, 2, 3)
  const doubled = await TxHashSet.map(numbers, (n) => n * 2)

  Array.from(await TxHashSet.toHashSet(doubled)).sort() // => [2, 4, 6]
  await TxHashSet.size(doubled) // => 3

  // Mapping can reduce size if function produces duplicates
  const strings = await TxHashSet.make("apple", "banana", "cherry")
  const lengths = await TxHashSet.map(strings, (s) => s.length)
  Array.from(await TxHashSet.toHashSet(lengths)).sort() // => [5, 6]
}

await runPromise(program)
```

## filter

**Filtering values**

```efx

const program = effect {
  const numbers = await TxHashSet.make(1, 2, 3, 4, 5, 6)
  const evens = await TxHashSet.filter(numbers, (n) => n % 2 === 0)

  Array.from(await TxHashSet.toHashSet(evens)).sort() // => [2, 4, 6]
  await TxHashSet.size(evens) // => 3
}

await runPromise(program)
```

## reduce

**Reducing values**

```efx

const program = effect {
  const numbers = await TxHashSet.make(1, 2, 3, 4, 5)
  await TxHashSet.reduce(numbers, 0, (acc, n) => acc + n) // => 15

  const strings = await TxHashSet.make("a", "b", "c")
  String(await TxHashSet.reduce(strings, "", (acc, s) => acc + s)).split("").sort().join("") // => "abc"
}

await runPromise(program)
```

## toHashSet

**Taking a HashSet snapshot**

```efx

const program = effect {
  const txSet = await TxHashSet.make("x", "y", "z")
  const hashSet = await TxHashSet.toHashSet(txSet)

  HashSet.size(hashSet) // => 3
  HashSet.has(hashSet, "y") // => true

  // hashSet is a snapshot - modifications to txSet don't affect it
  await TxHashSet.add(txSet, "w")
  HashSet.size(hashSet) // => 3
  await TxHashSet.size(txSet) // => 4
}

await runPromise(program)
```
