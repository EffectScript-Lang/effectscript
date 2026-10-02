# effect/NonEmptyIterable

The examples in the JSDoc of `packages/effect/src/NonEmptyIterable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## unprepend

**Extracting first and remaining elements**

```efx
import { Chunk, NonEmptyIterable } from "effect"

const [first, rest] = NonEmptyIterable.unprepend(Chunk.make(1, 2, 3))

first // => 1
globalThis.Array.from({ [Symbol.iterator]: () => rest }) // => [2, 3]
```
