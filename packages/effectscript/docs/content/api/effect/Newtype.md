# effect/Newtype

The examples in the JSDoc of `packages/effect/src/Newtype.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Newtype

**Defining a newtype**

```efx
import { Newtype } from "effect"

interface UserId extends Newtype.Newtype<"UserId", number> {}
interface OrderId extends Newtype.Newtype<"OrderId", number> {}

const userId = Newtype.makeIso<UserId>().set(1)
// UserId and OrderId are not assignable to each other
// even though both wrap `number`.
// @ts-expect-error
const orderId: OrderId = userId

Newtype.value(userId) // => 1
```

## value

**Unwrapping a newtype**

```efx
import { Newtype } from "effect"

interface Label extends Newtype.Newtype<"Label", string> {}

const iso = Newtype.makeIso<Label>()
const label = iso.set("hello")

const raw: string = Newtype.value(label)
raw // => "hello"
```

## makeIso

**Wrapping and unwrapping with an iso**

```efx
import { Newtype } from "effect"

interface Label extends Newtype.Newtype<"Label", string> {}

const labelIso = Newtype.makeIso<Label>()

const label: Label = labelIso.set("world")
const str: string = labelIso.get(label)
str // => "world"
```

## makeEquivalence

**Comparing newtypes**

```efx
import { Equivalence, Newtype } from "effect"

interface Label extends Newtype.Newtype<"Label", string> {}

const eq = Newtype.makeEquivalence<Label>(Equivalence.String)
const iso = Newtype.makeIso<Label>()

eq(iso.set("a"), iso.set("a")) // => true
eq(iso.set("a"), iso.set("b")) // => false
```

## makeOrder

**Ordering newtypes**

```efx
import { Newtype, Order } from "effect"

interface Score extends Newtype.Newtype<"Score", number> {}

const ord = Newtype.makeOrder<Score>(Order.Number)
const iso = Newtype.makeIso<Score>()

ord(iso.set(1), iso.set(2)) // => -1
```

## makeCombiner

**Combining newtypes**

```efx
import { Combiner, Newtype } from "effect"

interface Amount extends Newtype.Newtype<"Amount", number> {}

const sum = Combiner.make<number>((a, b) => a + b)
const combiner = Newtype.makeCombiner<Amount>(sum)
const iso = Newtype.makeIso<Amount>()

const total = combiner.combine(iso.set(10), iso.set(20))
Newtype.value(total) // => 30
```

## makeReducer

**Reducing newtypes**

```efx
import { Newtype, Reducer } from "effect"

interface Score extends Newtype.Newtype<"Score", number> {}

const sum = Reducer.make<number>((a, b) => a + b, 0)
const reducer = Newtype.makeReducer<Score>(sum)
const iso = Newtype.makeIso<Score>()

const total = reducer.combineAll([iso.set(1), iso.set(2), iso.set(3)])
Newtype.value(total) // => 6
```
