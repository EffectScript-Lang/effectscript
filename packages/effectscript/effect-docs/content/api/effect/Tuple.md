# effect/Tuple

The examples in the JSDoc of `packages/effect/src/Tuple.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## make

**Creating a tuple**

```efx
import { Tuple } from "effect"

Tuple.make(10, 20, "red") // => [10, 20, "red"]
```

## get

**Extracting an element by index**

```efx
import { pipe } from "effect"

Tuple.make(1, true, "hello") |> Tuple.get(2) // => "hello"
```

## pick

**Selecting elements by index**

```efx
import { Tuple } from "effect"

Tuple.pick(["a", "b", "c", "d"], [0, 2, 3]) // => ["a", "c", "d"]
```

## omit

**Removing elements by index**

```efx
import { Tuple } from "effect"

Tuple.omit(["a", "b", "c", "d"], [1, 3]) // => ["a", "c"]
```

## appendElement

**Appending an element**

```efx
import { pipe } from "effect"

Tuple.make(1, 2) |> Tuple.appendElement("end") // => [1, 2, "end"]
```

## appendElements

**Concatenating tuples**

```efx
import { pipe } from "effect"

Tuple.make(1, 2) |> Tuple.appendElements(["a", "b"] as const) // => [1, 2, "a", "b"]
```

## evolve

**Transforming selected elements**

```efx
import { pipe } from "effect"

Tuple.make("hello", 42, true)
  |> Tuple.evolve([
    (s) => s.toUpperCase(),
    (n) => n * 2
  ]) // => ["HELLO", 84, true]
```

## renameIndices

**Swapping elements**

```efx
import { pipe } from "effect"

Tuple.make("a", "b", "c")
  |> Tuple.renameIndices(["2", "1", "0"]) // => ["c", "b", "a"]
```

## map

**Wrapping every element in an array**

```efx
import { pipe } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
Tuple.make(1, "hello", true) |> Tuple.map(asArray) // => [[1], ["hello"], [true]]
```

## mapPick

**Wrapping only selected elements in arrays**

```efx
import { pipe } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
Tuple.make(1, "hello", true)
  |> Tuple.mapPick([0, 2], asArray) // => [[1], "hello", [true]]
```

## mapOmit

**Wrapping all elements except one in arrays**

```efx
import { pipe } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
Tuple.make(1, "hello", true)
  |> Tuple.mapOmit([1], asArray) // => [[1], "hello", [true]]
```

## makeEquivalence

**Comparing tuples for equivalence**

```efx
import { Equivalence, Tuple } from "effect"

const eq = Tuple.makeEquivalence([
  Equivalence.strictEqual<string>(),
  Equivalence.strictEqual<number>()
])

eq(["Alice", 30], ["Alice", 30]) // => true
eq(["Alice", 30], ["Bob", 30]) // => false
```

## makeOrder

**Ordering tuples**

```efx
import { Number, String, Tuple } from "effect"

const ord = Tuple.makeOrder([String.Order, Number.Order])

ord(["Alice", 30], ["Bob", 25]) // => -1
ord(["Alice", 30], ["Alice", 30]) // => 0
```

## isTupleOf

**Checking exact length**

```efx
import { Tuple } from "effect"

const arr: Array<number> = [1, 2, 3]
if (Tuple.isTupleOf(arr, 3)) {
  arr // => [1, 2, 3]
}
```

## isTupleOfAtLeast

**Checking minimum length**

```efx
import { Tuple } from "effect"

const arr: Array<number> = [1, 2, 3, 4]
if (Tuple.isTupleOfAtLeast(arr, 3)) {
  arr // => [1, 2, 3, 4]
}
```

## makeCombiner

**Combining tuple elements**

```efx
import { Number, String, Tuple } from "effect"

const C = Tuple.makeCombiner<readonly [number, string]>([
  Number.ReducerSum,
  String.ReducerConcat
])

C.combine([1, "hello"], [2, " world"]) // => [3, "hello world"]
```

## makeReducer

**Reducing a collection of tuples**

```efx
import { Number, String, Tuple } from "effect"

const R = Tuple.makeReducer<readonly [number, string]>([
  Number.ReducerSum,
  String.ReducerConcat
])

R.combineAll([
  [1, "a"],
  [2, "b"],
  [3, "c"]
]) // => [6, "abc"]
```
