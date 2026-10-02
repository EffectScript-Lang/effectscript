# effect/encoding/Base64Url

The examples in the JSDoc of `packages/effect/src/encoding/Base64Url.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## encode

**Encoding URL-safe Base64**

```efx
import { Base64Url } from "effect/encoding"

Base64Url.encode("hello?") // => "aGVsbG8_"

const bytes = new Uint8Array([72, 101, 108, 108, 111, 63])
Base64Url.encode(bytes) // => "SGVsbG8_"
```

## decode

**Decoding URL-safe Base64 bytes**

```efx
import { Result } from "effect"
import { Base64Url } from "effect/encoding"

Base64Url.decode("SGVsbG8_") // => Result.succeed(new Uint8Array([72, 101, 108, 108, 111, 63]))
```

## decodeString

**Decoding URL-safe Base64 strings**

```efx
import { Result } from "effect"
import { Base64Url } from "effect/encoding"

Base64Url.decodeString("aGVsbG8_") // => Result.succeed("hello?")
```
