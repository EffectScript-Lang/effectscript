# effect/MutableList

The examples in the JSDoc of `packages/effect/src/MutableList.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## MutableList

**Creating and consuming a mutable list**

```efx
import { MutableList } from "effect"

const list: MutableList.MutableList<number> = MutableList.make()
MutableList.append(list, 1)
MutableList.append(list, 2)
MutableList.prepend(list, 0)

MutableList.takeAll(list) // => [0, 1, 2]
list.length // => 0
```

## MutableList.Bucket

**Inspecting buckets**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.append(list, 1)
MutableList.append(list, 2)

const bucket: MutableList.MutableList.Bucket<number> = list.head!

bucket.array // => [1, 2]
bucket.offset // => 0
bucket.mutable // => true
bucket.next === undefined // => true
```

## Empty

**Checking for empty results**

```efx
import { MutableList } from "effect"

const list = MutableList.make<string>()

MutableList.take(list) === MutableList.Empty // => true
```

**Handling empty results type-safely**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()

const takeAndDouble = (queue: MutableList.MutableList<number>): number | null => {
  const item: number | MutableList.Empty = MutableList.take(queue)
  return item === MutableList.Empty ? null : item * 2
}

takeAndDouble(list) // => null
MutableList.append(list, 5)
takeAndDouble(list) // => 10
```

## make

**Creating an empty mutable list**

```efx
import { MutableList } from "effect"

const list = MutableList.make<string>()

list.length // => 0
MutableList.append(list, "first")
MutableList.take(list) // => "first"
list.length // => 0
```

## append

**Appending elements**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.append(list, 1)
MutableList.append(list, 2)
MutableList.append(list, 3)

MutableList.toArray(list) // => [1, 2, 3]
list.length // => 3
```

## prepend

**Prepending elements**

```efx
import { MutableList } from "effect"

const list = MutableList.make<string>()
MutableList.append(list, "last")
MutableList.prepend(list, "third")
MutableList.prepend(list, "second")
MutableList.prepend(list, "first")

MutableList.toArray(list) // => ["first", "second", "third", "last"]
```

## prependAll

**Prepending multiple elements**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.append(list, 4)
MutableList.append(list, 5)
MutableList.prependAll(list, [1, 2, 3])

MutableList.toArray(list) // => [1, 2, 3, 4, 5]
```

## prependAllUnsafe

**Transferring an array when prepending**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.append(list, 4)
const items = [1, 2, 3]
MutableList.prependAllUnsafe(list, items, true)

MutableList.toArray(list) // => [1, 2, 3, 4]
```

## appendAll

**Appending multiple elements**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.append(list, 1)
MutableList.append(list, 2)

MutableList.appendAll(list, [3, 4, 5]) // => 3
MutableList.toArray(list) // => [1, 2, 3, 4, 5]
list.length // => 5
```

## appendAllUnsafe

**Transferring an array when appending**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.append(list, 1)
const items = [2, 3, 4]
MutableList.appendAllUnsafe(list, items, true) // => 3

MutableList.toArray(list) // => [1, 2, 3, 4]
```

## clear

**Clearing a mutable list**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.appendAll(list, [1, 2, 3, 4, 5])

MutableList.clear(list)

MutableList.toArray(list) // => []
list.length // => 0
MutableList.take(list) === MutableList.Empty // => true
```

## takeN

**Taking batches**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.appendAll(list, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

MutableList.takeN(list, 3) // => [1, 2, 3]
MutableList.toArray(list) // => [4, 5, 6, 7, 8, 9, 10]
list.length // => 7
```

## takeAll

**Draining all elements**

```efx
import { MutableList } from "effect"

const list = MutableList.make<string>()
MutableList.appendAll(list, ["apple", "banana", "cherry"])

MutableList.takeAll(list) // => ["apple", "banana", "cherry"]
list.length // => 0
```

## take

**Taking one element**

```efx
import { MutableList } from "effect"

const list = MutableList.make<string>()
MutableList.appendAll(list, ["first", "second", "third"])

MutableList.take(list) // => "first"
MutableList.toArray(list) // => ["second", "third"]
list.length // => 2
```

## filter

**Filtering in place**

```efx
import { MutableList } from "effect"

const list = MutableList.make<number>()
MutableList.appendAll(list, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

MutableList.filter(list, (n) => n % 2 === 0)

MutableList.toArray(list) // => [2, 4, 6, 8, 10]
```

## remove

**Removing matching values**

```efx
import { MutableList } from "effect"

const list = MutableList.make<string>()
MutableList.appendAll(list, ["apple", "banana", "apple", "cherry", "apple"])

MutableList.remove(list, "apple")

MutableList.toArray(list) // => ["banana", "cherry"]
```
