# effect/RegExp

The examples in the JSDoc of `packages/effect/src/RegExp.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## RegExp

**Creating a regular expression**

```efx
import { RegExp } from "effect"

const pattern = new RegExp.RegExp("hello", "i")
pattern // => /hello/i
pattern.test("Hello World") // => true
pattern.test("goodbye") // => false
```

## isRegExp

**Checking for regular expressions**

```efx
import { RegExp } from "effect"

RegExp.isRegExp(/a/) // => true
RegExp.isRegExp("a") // => false
```

## escape

**Escaping a pattern string**

```efx
import { RegExp } from "effect"

RegExp.escape("a*b") // => "a\\*b"
```
