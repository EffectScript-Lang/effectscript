# effect/Utils

The examples in the JSDoc of `packages/effect/src/Utils.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## SingleShotGen

**Yielding a wrapped value in a generator**

```efx
import { Utils } from "effect"

const gen = new Utils.SingleShotGen<string, number>("hello")

gen.next(0).value // => "hello"

gen.next(42).value // => 42
```

## Variance

**Declaring variance for a TypeLambda**

```efx
import type { Option, Utils } from "effect"

const variance: Utils.Variance<
  Option.OptionTypeLambda,
  unknown,
  string,
  string
> = {
  _F: (value) => value,
  _R: () => {},
  _O: () => "output",
  _E: () => "error"
}
Array.of(variance._O(undefined as never), variance._E(undefined as never)) // => ["output", "error"]
```

## Gen

**Typing a gen function for Option**

```efx
import { Option } from "effect"
import type { Utils } from "effect"

const gen: Utils.Gen<Option.OptionTypeLambda> = Option.gen
const result = gen(function*() {
  return yield* Option.some(1)
})
result // => Option.some(1)
```
