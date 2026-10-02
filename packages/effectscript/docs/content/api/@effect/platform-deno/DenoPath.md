# @effect/platform-deno/DenoPath

The examples in the JSDoc of `packages/platform/deno/src/DenoPath.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Module

**Using Deno path operations**

```efx
import { DenoPath } from "@effect/platform-deno"

const program = effect {
  const path = await Path
  return path.extname("file.txt")
} |> provide(DenoPath.layer)

runSync(program) // => ".txt"
```
