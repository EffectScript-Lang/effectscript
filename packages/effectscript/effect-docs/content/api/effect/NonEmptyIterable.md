# effect/NonEmptyIterable

The examples in the JSDoc of `packages/effect/src/NonEmptyIterable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## unprepend

**Extracting first and remaining elements**

```efx
import { Chunk, NonEmptyIterable } from "effect"

const [first, rest] = NonEmptyIterable.unprepend(Chunk.make(1, 2, 3))

first // => 1
globalThis.Array.from({ [Symbol.iterator]: () => rest }) // => [2, 3]
```
