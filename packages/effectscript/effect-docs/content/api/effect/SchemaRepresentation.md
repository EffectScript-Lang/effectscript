# effect/SchemaRepresentation

The examples in the JSDoc of `packages/effect/src/SchemaRepresentation.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## ToJsonSchema.CheckOutput

**Declaring a Unicode length approximation**

```efx
import { Schema } from "effect"

const short = Schema.String.check(Schema.makeFilter(
  (value: string) => value.length <= 1,
  { toJsonSchema: () => [{ maxLength: 1 }, true] }
))
const schema = Schema.Union([short, Schema.Literal("😀")], { mode: "oneOf" })
const document = Schema.toJsonSchemaDocument(schema)

Schema.is(schema)("😀") // => true
document.schema.oneOf // => undefined
document.schema.anyOf // => [{ type: "string", maxLength: 1 }, { type: "string", enum: ["😀"] }]
```

## fromRepresentation

**Restoring a persisted schema**

```efx
import { Schema, SchemaRepresentation } from "effect"

const document = SchemaRepresentation.toRepresentation(Schema.Struct({ name: Schema.String }).ast)
const persisted = SchemaRepresentation.toJson(document)
const restored = SchemaRepresentation.fromJson(persisted)
const schema = SchemaRepresentation.fromRepresentation(restored, { revivers: [] })
const Person = Schema.make<Schema.Codec<{ readonly name: string }>>(schema.ast)

Schema.decodeUnknownSync(Person)({ name: "Ada" }) // => { name: "Ada" }
```
