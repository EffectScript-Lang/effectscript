# effect/reactivity/Atom

The examples in the JSDoc of `packages/effect/src/reactivity/Atom.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## withEquality

**Comparing values structurally**

```efx

atom point = { x: 0, y: 0 }
  |> withEquality<{ x: number; y: number }>((a, b) => a.x === b.x && a.y === b.y)
point.equals({ x: 1, y: 2 }, { x: 1, y: 2 }) // => true
```
