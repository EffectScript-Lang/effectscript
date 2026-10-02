# effect/Combiner

The examples in the JSDoc of `packages/effect/src/Combiner.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Combiner

**Combining numbers with addition**

```efx
import { Combiner } from "effect"

const Sum = Combiner.make<number>((self, that) => self + that)

Sum.combine(3, 4) // => 7
```

## make

**Multiplying numbers**

```efx
import { Combiner } from "effect"

const Product = Combiner.make<number>((self, that) => self * that)

Product.combine(3, 5) // => 15
```

## flip

**Reversing string concatenation**

```efx
import { Combiner, String } from "effect"

const Prepend = Combiner.flip(String.ReducerConcat)

Prepend.combine("a", "b") // => "ba"
```

## min

**Selecting the minimum of two numbers**

```efx
import { Combiner, Number } from "effect"

const Min = Combiner.min(Number.Order)

Min.combine(3, 1) // => 1
Min.combine(1, 3) // => 1
```

## max

**Selecting the maximum of two numbers**

```efx
import { Combiner, Number } from "effect"

const Max = Combiner.max(Number.Order)

Max.combine(3, 1) // => 3
Max.combine(1, 3) // => 3
```

## first

**Keeping the first value**

```efx
import { Combiner } from "effect"

const First = Combiner.first<number>()

First.combine(1, 2) // => 1
```

## last

**Keeping the last value**

```efx
import { Combiner } from "effect"

const Last = Combiner.last<number>()

Last.combine(1, 2) // => 2
```

## constant

**Always returning zero**

```efx
import { Combiner } from "effect"

const Zero = Combiner.constant(0)

Zero.combine(42, 99) // => 0
```

## intercalate

**Joining strings with a separator**

```efx
import { Combiner, String } from "effect"

const commaSep = Combiner.intercalate(",")(String.ReducerConcat)

commaSep.combine("a", "b") // => "a,b"
```
