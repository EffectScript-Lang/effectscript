# effect/http/UrlParams

The examples in the JSDoc of `packages/effect/src/http/UrlParams.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## toRecord

**Converting parameters to a record**

```efx
import { UrlParams } from "effect/http"

const urlParams = UrlParams.fromInput({
  a: 1,
  b: true,
  c: "string",
  e: [1, 2, 3]
})
UrlParams.toRecord(urlParams) // => { a: "1", b: "true", c: "string", e: ["1", "2", "3"] }
```
