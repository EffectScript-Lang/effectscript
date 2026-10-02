# effect/Reducer

The examples in the JSDoc of `packages/effect/src/Reducer.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Reducer

**String concatenation reducer**

```efx
import { Reducer } from "effect"

const Concat = Reducer.make<string>((a, b) => a + b, "")

Concat.combineAll(["hello", " ", "world"]) // => "hello world"
```

## make

**Multiplying with short-circuit**

```efx
import { Reducer } from "effect"

const Product = Reducer.make<number>(
  (a, b) => a * b,
  1,
  (collection) => {
    let acc = 1
    for (const n of collection) {
      if (n === 0) return 0
      acc *= n
    }
    return acc
  }
)

Product.combineAll([2, 3, 4]) // => 24
Product.combineAll([2, 0, 4]) // => 0
```

## flip

**Reversing string concatenation**

```efx
import { Reducer, String } from "effect"

const Prepend = Reducer.flip(String.ReducerConcat)

Prepend.combine("a", "b") // => "ba"
Prepend.combineAll(["a", "b", "c"]) // => "cba"
```
