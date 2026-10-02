# effect/Unify

The examples in the JSDoc of `packages/effect/src/Unify.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Unify

**Unifying protocol types**

```efx
import type { Unify } from "effect"

// Example of types that can be unified
type UnifiableA = {
  value: string
  [Unify.typeSymbol]?: string
  [Unify.unifySymbol]?: { String: () => string }
}

type UnifiableB = {
  value: number
  [Unify.typeSymbol]?: number
  [Unify.unifySymbol]?: { Number: () => number }
}

// Unify automatically handles the union
type Unified = Unify.Unify<UnifiableA | UnifiableB>

const witness: Unified = "value"
```

## unify

**Unifying values and function results**

```efx
import { Unify } from "effect"

// Unify a simple value
const unifiedValue = Unify.unify("hello") // => "hello"
// Type: string

// Unify a function result
const createValue = () => ({ value: "test" })

const unifiedFunction = Unify.unify(createValue)
unifiedFunction().value // => "test"

// Unify with curried functions
const curriedFunction = (a: string) => (b: number) => ({ result: a + b })
const unifiedCurried = Unify.unify(curriedFunction)
// Type: (a: string) => (b: number) => Unify<{ result: string }>
unifiedCurried("value-")(1).result // => "value-1"
```
