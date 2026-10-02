# effect/JsonPointer

The examples in the JSDoc of `packages/effect/src/JsonPointer.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## escapeToken

**Escaping special characters**

```efx
import { JsonPointer } from "effect"

JsonPointer.escapeToken("a/b") // => "a~1b"
JsonPointer.escapeToken("c~d") // => "c~0d"
JsonPointer.escapeToken("path/to~key") // => "path~1to~0key"
```

## unescapeToken

**Unescaping special characters**

```efx
import { JsonPointer } from "effect"

JsonPointer.unescapeToken("a~1b") // => "a/b"
JsonPointer.unescapeToken("c~0d") // => "c~d"
JsonPointer.unescapeToken("path~1to~0key") // => "path/to~key"
```

## parseUriFragment

**Parsing URI fragments**

```efx
import { JsonPointer } from "effect"

JsonPointer.parseUriFragment("#/users/a~1b") // => ["users", "a/b"]
JsonPointer.parseUriFragment("#/caf%C3%A9") // => ["café"]
JsonPointer.parseUriFragment("#/%") // => undefined
JsonPointer.parseUriFragment("#/a#b") // => undefined
```

## formatUriFragment

**Formatting a URI fragment**

```efx
import { JsonPointer } from "effect"

JsonPointer.formatUriFragment(["users", "a/b", "Rate%"]) // => "#/users/a~1b/Rate%25"
```
