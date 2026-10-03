# effect/Crypto

The examples in the JSDoc of `packages/effect/src/Crypto.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## DigestAlgorithm

**Using a digest algorithm**

```efx
import { Crypto } from "effect"

const algorithm: Crypto.DigestAlgorithm = "SHA-256"
```

## Crypto

**Using cryptographic operations**

```efx
const TestCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: (_algorithm, data) => succeed(data)
  })
)

const program = effect {
  const crypto = await Crypto
  const bytes = await crypto.randomBytes(16)
  const uuidv4 = await crypto.randomUUIDv4
  const hash = await crypto.digest("SHA-256", bytes)
  return [bytes.length, uuidv4.length, hash.length]
}

await runPromise(provide(program, TestCrypto)) // => [16, 36, 16]
```

## make

**Creating a Crypto service**

```efx
const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) => succeed(data)
})

await runPromise(testCrypto.randomBytes(4)) // => new Uint8Array([0, 0, 0, 0])
```
