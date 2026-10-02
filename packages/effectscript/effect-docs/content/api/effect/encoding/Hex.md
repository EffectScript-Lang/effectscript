# effect/encoding/Hex

The examples in the JSDoc of `packages/effect/src/encoding/Hex.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## encode

**Encoding hex strings and bytes**

```efx
import { Hex } from "effect/encoding"

// Encode a string to hex
Hex.encode("hello") // => "68656c6c6f"

// Encode binary data to hex
const bytes = new Uint8Array([72, 101, 108, 108, 111])
Hex.encode(bytes) // => "48656c6c6f"
```

## decode

**Decoding hex bytes**

```efx
import { Result } from "effect"
import { Hex } from "effect/encoding"

Hex.decode("48656c6c6f") // => Result.succeed(new Uint8Array([72, 101, 108, 108, 111]))
```

## decodeString

**Decoding hex strings**

```efx
import { Result } from "effect"
import { Hex } from "effect/encoding"

Hex.decodeString("68656c6c6f") // => Result.succeed("hello")
```
