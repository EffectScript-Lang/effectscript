# effect/testing/TestSchema

The examples in the JSDoc of `packages/effect/src/testing/TestSchema.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Asserts

**Decoding and encoding a struct**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const schema = Schema.Struct({ name: Schema.String })
const asserts = new TestSchema.Asserts(schema)

// decoding
await asserts.decoding().succeed({ name: "Alice" }) // => undefined

// encoding
await asserts.encoding().succeed({ name: "Alice" }) // => undefined
```

## Asserts.ast

**Comparing struct fields**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const fieldsA = { name: Schema.String }
const fieldsB = { name: Schema.String }
TestSchema.Asserts.ast.fields.equals(fieldsA, fieldsB) // => undefined
```

## Asserts.make

**Testing make**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const schema = Schema.String
const asserts = new TestSchema.Asserts(schema)
await asserts.make().succeed("hello") // => undefined
```

## Asserts.verifyRoundTrip

**Verifying round trips**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const asserts = new TestSchema.Asserts(Schema.String)
await asserts.verifyRoundTrip({ seed: 1, runs: 20 }) // => undefined
```

## Asserts.verifyRoundTripEffect

**Composing round-trip assertions**

```efx

const asserts = new TestSchema.Asserts(Schema.NumberFromString)
const test = effect {
  await asserts.decoding().succeedEffect("42", 42)
  await asserts.verifyRoundTripEffect({ seed: 1, runs: 20 })
}
await runPromise(test) // => undefined
```

## Asserts.decoding

**Decoding assertions**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const asserts = new TestSchema.Asserts(Schema.NumberFromString)
const decoding = asserts.decoding()
await decoding.succeed("42", 42) // => undefined
await decoding.fail(null, "Expected string") // => undefined
```

## Asserts.encoding

**Encoding assertions**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const asserts = new TestSchema.Asserts(Schema.NumberFromString)
const encoding = asserts.encoding()
await encoding.succeed(42, "42") // => undefined
```

## Asserts.arbitrary

**Verifying arbitrary generation**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const asserts = new TestSchema.Asserts(Schema.String)
asserts.arbitrary().verifyGeneration({ seed: 1, runs: 20 }) // => undefined
```

## Decoding

**Decoding with service provision**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const asserts = new TestSchema.Asserts(Schema.String)
const decoding = asserts.decoding()
await decoding.succeed("hello") // => undefined
```

## Decoding.succeed

**Testing identity and transformed decoding**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const decoding = new TestSchema.Asserts(Schema.NumberFromString).decoding()
await decoding.succeed("1", 1) // => undefined
```

## Decoding.fail

**Asserting a decoding failure**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const decoding = new TestSchema.Asserts(Schema.String).decoding()
await decoding.fail(42, "Expected string") // => undefined
```

## Encoding

**Encoding assertions**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const encoding = new TestSchema.Asserts(Schema.NumberFromString).encoding()
await encoding.succeed(42, "42") // => undefined
```

## Encoding.succeed

**Testing identity and transformed encoding**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const encoding = new TestSchema.Asserts(Schema.NumberFromString).encoding()
await encoding.succeed(1, "1") // => undefined
```

## Encoding.fail

**Asserting an encoding failure**

```efx
import { Schema } from "effect"
import { TestSchema } from "effect/testing"

const encoding = new TestSchema.Asserts(Schema.NumberFromString).encoding()
await encoding.fail("not-a-number", "Expected number") // => undefined
```
