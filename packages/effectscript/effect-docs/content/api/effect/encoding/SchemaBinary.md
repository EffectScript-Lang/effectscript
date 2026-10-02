# effect/encoding/SchemaBinary

The examples in the JSDoc of `packages/effect/src/encoding/SchemaBinary.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## toCodec

**Deriving a binary codec**

```efx
import { Schema } from "effect"
import { SchemaBinary } from "effect/encoding"

const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
const codec = SchemaBinary.toCodec(Person)

const bytes = Schema.encodeUnknownSync(codec)({ name: "Ada", age: 36 })
const person = Schema.decodeUnknownSync(codec)(bytes)
```

## fieldId

**Assigning a wire field id**

```efx
import { Schema } from "effect"
import { SchemaBinary } from "effect/encoding"

const Person = Schema.Struct({
  id: Schema.String.pipe(SchemaBinary.fieldId(1))
})
```
