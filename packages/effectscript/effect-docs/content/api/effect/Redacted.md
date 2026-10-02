# effect/Redacted

The examples in the JSDoc of `packages/effect/src/Redacted.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Redacted

**Creating redacted values**

```efx
import { Redacted } from "effect"

// Create a redacted value to protect sensitive information
const apiKey = Redacted.make("secret-key")
const userPassword = Redacted.make("user-password")

// TypeScript will infer the types as Redacted<string>
Array.of(String(apiKey), String(userPassword)) // => ["<redacted>", "<redacted>"]
```

**Using namespace utilities**

```efx
import { Redacted } from "effect"

// Use the Redacted namespace for type-level operations
const secret = Redacted.make("my-secret")

// The namespace contains utilities for working with Redacted values
Redacted.isRedacted(secret) // => true
```

## Redacted.Value

**Extracting the redacted value type**

```efx
import { Redacted } from "effect"

type ApiKey = Redacted.Redacted<{ readonly token: string }>
type ApiKeyValue = Redacted.Redacted.Value<ApiKey>

const rotate = (value: ApiKeyValue): ApiKeyValue => ({
  token: `${value.token}:rotated`
})

rotate({ token: "secret" }) // => { token: "secret:rotated" }
```

## isRedacted

**Checking for redacted values**

```efx
import { Redacted } from "effect"

const secret = Redacted.make("my-secret")
const plainString = "not-secret"

Redacted.isRedacted(secret) // => true
Redacted.isRedacted(plainString) // => false
```

## make

**Creating a redacted value**

```efx
import { Redacted } from "effect"

const API_KEY = Redacted.make("1234567890")
String(API_KEY) // => "<redacted>"
```

## value

**Retrieving a redacted value**

```efx
import { Redacted } from "effect"

const API_KEY = Redacted.make("1234567890")

Redacted.value(API_KEY) // => "1234567890"
```

## wipeUnsafe

**Wiping a redacted value**

```efx
import { Redacted, Result } from "effect"

const API_KEY = Redacted.make("1234567890")

Redacted.value(API_KEY) // => "1234567890"

Redacted.wipeUnsafe(API_KEY)

const failure = Result.try({
  try: () => Redacted.value(API_KEY),
  catch: (error) => (error as Error).message
})
failure // => Result.fail("Unable to get redacted value")
```

## makeEquivalence

**Comparing redacted values**

```efx
import { Equivalence, Redacted } from "effect"

const API_KEY1 = Redacted.make("1234567890")
const API_KEY2 = Redacted.make("1-34567890")
const API_KEY3 = Redacted.make("1234567890")

const equivalence = Redacted.makeEquivalence(Equivalence.strictEqual<string>())

equivalence(API_KEY1, API_KEY2) // => false
equivalence(API_KEY1, API_KEY3) // => true
```
