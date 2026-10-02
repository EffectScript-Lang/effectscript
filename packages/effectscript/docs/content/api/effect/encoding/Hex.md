# effect/encoding/Hex

The examples in the JSDoc of `packages/effect/src/encoding/Hex.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

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
