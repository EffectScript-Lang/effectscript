# effect/PlatformError

The examples in the JSDoc of `packages/effect/src/PlatformError.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## isPlatformError

**Checking a caught value**

```efx
import { PlatformError } from "effect"

const error = PlatformError.badArgument({
  module: "FileSystem",
  method: "readFile"
})

PlatformError.isPlatformError(error) // => true
PlatformError.isPlatformError(new Error("boom")) // => false
```
