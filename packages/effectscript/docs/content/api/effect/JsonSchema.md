# effect/JsonSchema

The examples in the JSDoc of `packages/effect/src/JsonSchema.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Document

**Inspecting a parsed document**

```efx
import { JsonSchema } from "effect"

const raw: JsonSchema.JsonSchema = {
  type: "string",
  $defs: { Trimmed: { type: "string", minLength: 1 } }
}

const doc = JsonSchema.fromSchemaDraft2020_12(raw)

doc.dialect // => "draft-2020-12"
doc.schema // => { type: "string" }
doc.definitions // => { Trimmed: { type: "string", minLength: 1 } }
```

## fromSchemaDraft07

**Parsing a Draft-07 schema**

```efx
import { JsonSchema } from "effect"

const raw: JsonSchema.JsonSchema = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: { type: "string" }
    }
  }
}

const doc = JsonSchema.fromSchemaDraft07(raw)
doc.dialect // => "draft-2020-12"
doc.schema.properties // => { tags: { type: "array", items: { type: "string" } } }
```

## fromSchemaDraft2020_12

**Parsing a Draft-2020-12 schema**

```efx
import { JsonSchema } from "effect"

const raw: JsonSchema.JsonSchema = {
  type: "number",
  minimum: 0,
  $defs: { PositiveInt: { type: "integer", minimum: 1 } }
}

const doc = JsonSchema.fromSchemaDraft2020_12(raw)
doc.schema // => { type: "number", minimum: 0 }
doc.definitions // => { PositiveInt: { type: "integer", minimum: 1 } }
```

## fromSchemaOpenApi3_1

**Parsing an OpenAPI 3.1 schema**

```efx
import { JsonSchema } from "effect"

const raw: JsonSchema.JsonSchema = {
  type: "object",
  properties: {
    user: { $ref: "#/components/schemas/User" }
  }
}

const doc = JsonSchema.fromSchemaOpenApi3_1(raw)
doc.schema.properties // => { user: { $ref: "#/$defs/User" } }
```

## fromSchemaOpenApi3_0

**Parsing an OpenAPI 3.0 nullable schema**

```efx
import { JsonSchema } from "effect"

const raw: JsonSchema.JsonSchema = {
  type: "string",
  nullable: true
}

const doc = JsonSchema.fromSchemaOpenApi3_0(raw)
doc.schema.type // => ["string", "null"]
```

## toDocumentDraft07

**Converting to Draft-07**

```efx
import { JsonSchema } from "effect"

const doc = JsonSchema.fromSchemaDraft2020_12({
  type: "array",
  prefixItems: [{ type: "string" }, { type: "number" }],
  items: { type: "boolean" }
})

const draft07 = JsonSchema.toDocumentDraft07(doc)
draft07.dialect // => "draft-07"
draft07.schema.items // => [{ type: "string" }, { type: "number" }]
draft07.schema.additionalItems // => { type: "boolean" }
```

## toDocumentDraft04

**Converting exclusive bounds**

```efx
import { JsonSchema } from "effect"

const doc = JsonSchema.fromSchemaDraft2020_12({
  type: "number",
  exclusiveMinimum: 0
})

JsonSchema.toDocumentDraft04(doc).schema // => { type: "number", minimum: 0, exclusiveMinimum: true }
```

## toMultiDocumentOpenApi3_1

**Converting to OpenAPI 3.1**

```efx
import { JsonSchema } from "effect"

const multi: JsonSchema.MultiDocument<"draft-2020-12"> = {
  dialect: "draft-2020-12",
  schemas: [{ $ref: "#/$defs/User" }],
  definitions: {
    User: { type: "object", properties: { name: { type: "string" } } }
  }
}

const openapi = JsonSchema.toMultiDocumentOpenApi3_1(multi)
openapi.dialect // => "openapi-3.1"
openapi.schemas[0] // => { $ref: "#/components/schemas/User" }
```
