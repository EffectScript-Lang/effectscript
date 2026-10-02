# effect/Trie

The examples in the JSDoc of `packages/effect/src/Trie.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Trie

**Using a trie for prefix search**

```efx
import { Option, Trie } from "effect"

// Create a trie with string-to-number mappings
const trie: Trie.Trie<number> = Trie.make(
  ["apple", 1],
  ["app", 2],
  ["application", 3],
  ["banana", 4]
)

// Get values by exact key
Trie.get(trie, "apple") // => Option.some(1)
Trie.get(trie, "grape") // => Option.none()

// Find all keys with a prefix
Array.from(Trie.keysWithPrefix(trie, "app")) // => ["app", "apple", "application"]

// Iterate over all entries (sorted alphabetically)
Array.from(trie) // => [["app", 2], ["apple", 1], ["application", 3], ["banana", 4]]

// Check if key exists
Trie.has(trie, "app") // => true

// Get size
Trie.size(trie) // => 4
```

## empty

**Creating an empty trie**

```efx
import { Trie } from "effect"

const trie = Trie.empty<string>()

Trie.size(trie) // => 0
Array.from(trie) // => []
```

## fromIterable

**Creating a trie from entries**

```efx
import { Trie } from "effect"

const iterable: Array<readonly [string, number]> = [["call", 0], ["me", 1], [
  "mind",
  2
], ["mid", 3]]
const trie = Trie.fromIterable(iterable)

// The entries in the `Trie` are extracted in alphabetical order, regardless of the insertion order
Array.from(trie) // => [["call", 0], ["me", 1], ["mid", 3], ["mind", 2]]
trie // => Trie.make(["call", 0], ["me", 1], ["mind", 2], ["mid", 3])
```

## make

**Constructing a trie from entries**

```efx
import { Trie } from "effect"

const trie = Trie.make(["ca", 0], ["me", 1])

Array.from(trie) // => [["ca", 0], ["me", 1]]
trie // => Trie.fromIterable([["ca", 0], ["me", 1]])
```

## insert

**Inserting entries**

```efx
import { Trie } from "effect"

const trie1 = Trie.empty<number>().pipe(
  Trie.insert("call", 0)
)
const trie2 = trie1.pipe(Trie.insert("me", 1))
const trie3 = trie2.pipe(Trie.insert("mind", 2))
const trie4 = trie3.pipe(Trie.insert("mid", 3))

Array.from(trie1) // => [["call", 0]]
Array.from(trie2) // => [["call", 0], ["me", 1]]
Array.from(trie3) // => [["call", 0], ["me", 1], ["mind", 2]]
Array.from(trie4) // => [["call", 0], ["me", 1], ["mid", 3], ["mind", 2]]
```

## keys

**Reading keys in alphabetical order**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("cab", 0),
  Trie.insert("abc", 1),
  Trie.insert("bca", 2)
)

Array.from(Trie.keys(trie)) // => ["abc", "bca", "cab"]
```

## values

**Reading values by key order**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1),
  Trie.insert("and", 2)
)

Array.from(Trie.values(trie)) // => [2, 0, 1]
```

## entries

**Reading entries in alphabetical order**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1)
)

Array.from(Trie.entries(trie)) // => [["call", 0], ["me", 1]]
```

## toEntries

**Converting entries to an array**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1)
)
Trie.toEntries(trie) // => [["call", 0], ["me", 1]]
```

## keysWithPrefix

**Finding keys with a prefix**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("she", 0),
  Trie.insert("shells", 1),
  Trie.insert("sea", 2),
  Trie.insert("shore", 3)
)

Array.from(Trie.keysWithPrefix(trie, "she")) // => ["she", "shells"]
```

## valuesWithPrefix

**Finding values with a prefix**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("she", 0),
  Trie.insert("shells", 1),
  Trie.insert("sea", 2),
  Trie.insert("shore", 3)
)

Array.from(Trie.valuesWithPrefix(trie, "she")) // => [0, 1]
```

## entriesWithPrefix

**Finding entries with a prefix**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("she", 0),
  Trie.insert("shells", 1),
  Trie.insert("sea", 2),
  Trie.insert("shore", 3)
)

Array.from(Trie.entriesWithPrefix(trie, "she")) // => [["she", 0], ["shells", 1]]
```

## toEntriesWithPrefix

**Converting prefixed entries to an array**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("sea", 2),
  Trie.insert("she", 3)
)

Trie.toEntriesWithPrefix(trie, "she") // => [["she", 3], ["shells", 0]]
```

## longestPrefixOf

**Finding the longest prefix**

```efx
import { Option, Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

Trie.longestPrefixOf(trie, "sell") // => Option.none()
Trie.longestPrefixOf(trie, "sells") // => Option.some(["sells", 1])
```

## size

**Getting the size**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("a", 0),
  Trie.insert("b", 1)
)

Trie.size(trie) // => 2
```

## get

**Looking up values safely**

```efx
import { Option, Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1),
  Trie.insert("mind", 2),
  Trie.insert("mid", 3)
)

Trie.get(trie, "call") // => Option.some(0)
Trie.get(trie, "me") // => Option.some(1)
Trie.get(trie, "mind") // => Option.some(2)
Trie.get(trie, "mid") // => Option.some(3)
Trie.get(trie, "cale") // => Option.none()
Trie.get(trie, "ma") // => Option.none()
Trie.get(trie, "midn") // => Option.none()
Trie.get(trie, "mea") // => Option.none()
```

## has

**Checking key membership**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1),
  Trie.insert("mind", 2),
  Trie.insert("mid", 3)
)

Trie.has(trie, "call") // => true
Trie.has(trie, "me") // => true
Trie.has(trie, "mind") // => true
Trie.has(trie, "mid") // => true
Trie.has(trie, "cale") // => false
Trie.has(trie, "ma") // => false
Trie.has(trie, "midn") // => false
Trie.has(trie, "mea") // => false
```

## isEmpty

**Checking whether a trie is empty**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>()
const trie1 = trie.pipe(Trie.insert("ma", 0))

Trie.isEmpty(trie) // => true
Trie.isEmpty(trie1) // => false
```

## getUnsafe

**Looking up values unsafely**

```efx
import { Result, Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1)
)

Result.try({
  try: () => Trie.getUnsafe(trie, "mae"),
  catch: (error) => (error as Error).message
}) // => Result.fail("Expected trie to contain key")
```

## remove

**Removing entries**

```efx
import { Option, Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("call", 0),
  Trie.insert("me", 1),
  Trie.insert("mind", 2),
  Trie.insert("mid", 3)
)

const trie1 = trie.pipe(Trie.remove("call"))
const trie2 = trie1.pipe(Trie.remove("mea"))

Trie.get(trie, "call") // => Option.some(0)
Trie.get(trie1, "call") // => Option.none()
Trie.get(trie2, "call") // => Option.none()
```

## reduce

**Reducing entries**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

trie.pipe(Trie.reduce(0, (acc, n) => acc + n)) // => 3
trie.pipe(Trie.reduce(10, (acc, n) => acc + n)) // => 13
trie.pipe(Trie.reduce("", (acc, _, key) => acc + key)) // => "sellssheshells"
```

## map

**Mapping entries**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

Trie.map(trie, (v) => v + 1) // => Trie.make(["shells", 1], ["sells", 2], ["she", 3])
Trie.map(trie, (_, k) => k.length) // => Trie.make(["shells", 6], ["sells", 5], ["she", 3])
```

## filter

**Filtering entries**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

Trie.filter(trie, (v) => v > 1) // => Trie.make(["she", 2])
Trie.filter(trie, (_, k) => k.length > 3) // => Trie.make(["shells", 0], ["sells", 1])
```

## filterMap

**Filtering and mapping entries**

```efx
import { Result, Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

Trie.filterMap(trie, (v) => v > 1 ? Result.succeed(v) : Result.failVoid) // => Trie.make(["she", 2])
Trie.filterMap(
  trie,
  (v, k) => k.length > 3 ? Result.succeed(v) : Result.failVoid
) // => Trie.make(["shells", 0], ["sells", 1])
```

## compact

**Compacting optional values**

```efx
import { Option, Trie } from "effect"

const trie = Trie.empty<Option.Option<number>>().pipe(
  Trie.insert("shells", Option.some(0)),
  Trie.insert("sells", Option.none()),
  Trie.insert("she", Option.some(2))
)

Trie.compact(trie) // => Trie.make(["shells", 0], ["she", 2])
```

## forEach

**Iterating over entries**

```efx
import { Trie } from "effect"

let value = 0

Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2),
  Trie.forEach((n, key) => {
    value += n + key.length
  })
)

value // => 17
```

## modify

**Modifying an existing value**

```efx
import { Option, Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

trie.pipe(Trie.modify("she", (v) => v + 10), Trie.get("she")) // => Option.some(12)
trie.pipe(Trie.modify("me", (v) => v)) // => trie
```

## removeMany

**Removing multiple entries**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0),
  Trie.insert("sells", 1),
  Trie.insert("she", 2)
)

trie.pipe(Trie.removeMany(["she", "sells"])) // => Trie.make(["shells", 0])
```

## insertMany

**Inserting multiple entries**

```efx
import { Trie } from "effect"

const trie = Trie.empty<number>().pipe(
  Trie.insert("shells", 0)
)

trie.pipe(
  Trie.insertMany([["sells", 1], ["she", 2]])
) // => Trie.make(["shells", 0], ["sells", 1], ["she", 2])
```
