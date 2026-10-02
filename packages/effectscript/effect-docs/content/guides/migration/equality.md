> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Equality

## Structural Equality by Default

In v3, `Equal.equals` used **reference equality** for plain objects and arrays.
Structural comparison was only available inside a `structuralRegion`, which
temporarily enabled deep comparison. Outside a structural region, two distinct
objects with identical contents were not considered equal:

```efx
// v3
import { Equal } from "effect"

Equal.equals({ a: 1 }, { a: 1 }) // false — reference equality
Equal.equals([1, 2], [1, 2]) // false — reference equality
```

In v4, `Equal.equals` uses **structural equality** by default. Plain objects,
arrays, `Map`s, `Set`s, `Date`s, and `RegExp`s are compared by value without
opting in:

```efx
// v4
import { Equal } from "effect"

Equal.equals({ a: 1 }, { a: 1 }) // true
Equal.equals([1, [2, 3]], [1, [2, 3]]) // true
Equal.equals(new Map([["a", 1]]), new Map([["a", 1]])) // true
Equal.equals(new Set([1, 2]), new Set([1, 2])) // true
```

Objects that implement the `Equal` interface continue to use their custom
equality logic, same as v3.

## Opting Out: `byReference`

If you need reference equality for a specific object, v4 provides
`Equal.byReference` and `Equal.byReferenceUnsafe`:

```efx
import { Equal } from "effect"

const obj = Equal.byReference({ a: 1 })
Equal.equals(obj, { a: 1 }) // false — reference equality
```

- **`byReference(obj)`** — creates a `Proxy` that uses reference equality,
  leaving the original object unchanged.
- **`byReferenceUnsafe(obj)`** — marks the object itself for reference
  equality without creating a proxy. More performant but permanently changes
  how the object is compared.

## `NaN` Equality

In v3, `Equal.equals(NaN, NaN)` returned `false` (following IEEE 754).
In v4, `NaN` is considered equal to `NaN`:

```ts
Equal.equals(NaN, NaN) // v3: false, v4: true
```

## `equivalence` → `asEquivalence`

The function that wraps `equals` as an `Equivalence` has been renamed:

```ts
// v3
Equal.equivalence<number>()

// v4
Equal.asEquivalence<number>()
```
