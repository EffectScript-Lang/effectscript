# effect/encoding/Base64

The examples in the JSDoc of `packages/effect/src/encoding/Base64.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## encode

**Encoding Base64 strings and bytes**

```efx
import { Base64 } from "effect/encoding"

Base64.encode("hello") // => "aGVsbG8="

const bytes = new Uint8Array([72, 101, 108, 108, 111])
Base64.encode(bytes) // => "SGVsbG8="
```

## decode

**Decoding Base64 bytes**

```efx
import { Result } from "effect"
import { Base64 } from "effect/encoding"

Base64.decode("SGVsbG8=") // => Result.succeed(new Uint8Array([72, 101, 108, 108, 111]))
```

## decodeString

**Decoding Base64 strings**

```efx
import { Result } from "effect"
import { Base64 } from "effect/encoding"

Base64.decodeString("aGVsbG8=") // => Result.succeed("hello")
```
