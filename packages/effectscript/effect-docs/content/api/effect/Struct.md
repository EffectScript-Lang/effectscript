# effect/Struct

The examples in the JSDoc of `packages/effect/src/Struct.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Simplify

**Flattening an intersection**

```efx
import type { Struct } from "effect"

type Original = { a: string } & { b: number }

// Without Simplify, the type displays as `{ a: string } & { b: number }`
type Simplified = Struct.Simplify<Original>
// { a: string; b: number }

const witness: Simplified = { a: "value", b: 1 }
```

## Mutable

**Making a readonly type mutable**

```efx
import type { Struct } from "effect"

type ReadOnly = { readonly a: string; readonly b: number }
type Writable = Struct.Mutable<ReadOnly>
// { a: string; b: number }

const witness: Writable = { a: "value", b: 1 }
witness.b = 2
witness // => { a: "value", b: 2 }
```

## Assign

**Merging two types with overlapping keys**

```efx
import type { Struct } from "effect"

type A = { a: string; b: number }
type B = { b: boolean; c: string }
type Merged = Struct.Assign<A, B>
// { a: string; b: boolean; c: string }

const witness: Merged = { a: "value", b: true, c: "other" }
```

## get

**Extracting a property in a pipeline**

```efx
import { pipe, Struct } from "effect"

pipe({ name: "Alice", age: 30 }, Struct.get("name")) // => "Alice"
```

## keys

**Reading typed keys**

```efx
import { Struct } from "effect"

const user = { name: "Alice", age: 30, [Symbol.for("id")]: 1 }

const k: Array<"name" | "age"> = Struct.keys(user)
k // => ["name", "age"]
```

## pick

**Selecting specific properties**

```efx
const user = { name: "Alice", age: 30, admin: true }
user |> Struct.pick(["name", "age"]) // => { name: "Alice", age: 30 }
```

## omit

**Removing a property**

```efx
const user = { name: "Alice", age: 30, password: "secret" }
user |> Struct.omit(["password"]) // => { name: "Alice", age: 30 }
```

## assign

**Merging structs with overlapping keys**

```efx
const defaults = { theme: "light", lang: "en" }
const overrides = { theme: "dark", fontSize: 14 }
defaults |> Struct.assign(overrides) // => { theme: "dark", lang: "en", fontSize: 14 }
```

## evolve

**Transforming selected values**

```efx
import { pipe, Struct } from "effect"

const result = pipe(
  { name: "alice", age: 30, active: true },
  Struct.evolve({
    name: (s) => s.toUpperCase(),
    age: (n) => n + 1
  })
)
result // => { name: "ALICE", age: 31, active: true }
```

## evolveKeys

**Renaming keys with functions**

```efx
import { pipe, Struct } from "effect"

const result = pipe(
  { name: "Alice", age: 30 },
  Struct.evolveKeys({
    name: (k) => k.toUpperCase()
  })
)
result // => { NAME: "Alice", age: 30 }
```

## evolveEntries

**Transforming keys and values together**

```efx
import { pipe, Struct } from "effect"

const result = pipe(
  { amount: 100, label: "total" },
  Struct.evolveEntries({
    amount: (k, v) => [`${k}Cents`, v * 100],
    label: (k, v) => [k, v.toUpperCase()]
  })
)
result // => { amountCents: 10000, label: "TOTAL" }
```

## renameKeys

**Renaming keys**

```efx
import { pipe, Struct } from "effect"

const result = pipe(
  { firstName: "Alice", lastName: "Smith", age: 30 },
  Struct.renameKeys({ firstName: "first", lastName: "last" })
)
result // => { first: "Alice", last: "Smith", age: 30 }
```

## makeEquivalence

**Comparing structs for equivalence**

```efx
import { Equivalence, Struct } from "effect"

const PersonEquivalence = Struct.makeEquivalence({
  name: Equivalence.strictEqual<string>(),
  age: Equivalence.strictEqual<number>()
})

PersonEquivalence({ name: "Alice", age: 30 }, { name: "Alice", age: 30 }) // => true
PersonEquivalence({ name: "Alice", age: 30 }, { name: "Bob", age: 30 }) // => false
```

## makeOrder

**Ordering structs by name then age**

```efx
import { Number, String, Struct } from "effect"

const PersonOrder = Struct.makeOrder({
  name: String.Order,
  age: Number.Order
})

PersonOrder({ name: "Alice", age: 30 }, { name: "Bob", age: 25 }) // => -1
```

## Lambda

**Defining a lambda type**

```efx
import type { Struct } from "effect"

interface ToString extends Struct.Lambda {
  readonly "~lambda.out": string
}

const witness: ToString = { "~lambda.in": 1, "~lambda.out": "1" }
```

## Apply

**Computing the output type of a lambda**

```efx
import type { Struct } from "effect"

interface ToString extends Struct.Lambda {
  readonly "~lambda.out": string
}

// string
type Result = Struct.Apply<ToString, number>

const witness: Result = "value"
```

## lambda

**Wrapping values in arrays**

```efx
import { pipe, Struct } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
const result = pipe({ x: 1, y: "hello" }, Struct.map(asArray))
result // => { x: [1], y: ["hello"] }
```

## map

**Wrapping every value in an array**

```efx
import { pipe, Struct } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
const result = pipe({ width: 10, height: 20 }, Struct.map(asArray))
result // => { width: [10], height: [20] }
```

## mapPick

**Wrapping only selected values in arrays**

```efx
import { pipe, Struct } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
const result = pipe(
  { x: 1, y: 2, z: 3 },
  Struct.mapPick(["x", "z"], asArray)
)
result // => { x: [1], y: 2, z: [3] }
```

## mapOmit

**Wrapping all values except one in arrays**

```efx
import { pipe, Struct } from "effect"

interface AsArray extends Struct.Lambda {
  <A>(self: A): Array<A>
  readonly "~lambda.out": Array<this["~lambda.in"]>
}

const asArray = Struct.lambda<AsArray>((a) => [a])
const result = pipe(
  { x: 1, y: 2, z: 3 },
  Struct.mapOmit(["y"], asArray)
)
result // => { x: [1], y: 2, z: [3] }
```

## makeCombiner

**Combining struct properties**

```efx
import { Number, String, Struct } from "effect"

const C = Struct.makeCombiner<{ readonly n: number; readonly s: string }>({
  n: Number.ReducerSum,
  s: String.ReducerConcat
})

C.combine({ n: 1, s: "hello" }, { n: 2, s: " world" }) // => { n: 3, s: "hello world" }
```

## makeReducer

**Reducing a collection of structs**

```efx
import { Number, String, Struct } from "effect"

const R = Struct.makeReducer<{ readonly n: number; readonly s: string }>({
  n: Number.ReducerSum,
  s: String.ReducerConcat
})

const result = R.combineAll([
  { n: 1, s: "a" },
  { n: 2, s: "b" },
  { n: 3, s: "c" }
])
result // => { n: 6, s: "abc" }
```

## Record

**Creating a record**

```efx
import { Struct } from "effect"

Struct.Record(["a", "b"], "value") // => { a: "value", b: "value" }
```
