# effect/SchemaAST

The examples in the JSDoc of `packages/effect/src/SchemaAST.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Literal

**Creating a literal AST**

```efx
import { SchemaAST } from "effect"

const ast = new SchemaAST.Literal("active")
ast.literal // => "active"
```

## Arrays

**Inspecting a tuple AST**

```efx
import { Schema, SchemaAST } from "effect"

const schema = Schema.Tuple([Schema.String, Schema.Number])
const ast = schema.ast

if (SchemaAST.isArrays(ast)) {
  [ast.elements.length, ast.rest.length] // => [2, 0]
}
```

## Objects

**Inspecting a struct AST**

```efx
import { Schema, SchemaAST } from "effect"

const schema = Schema.Struct({ name: Schema.String })
const ast = schema.ast

if (SchemaAST.isObjects(ast)) {
  ast.propertySignatures.map((ps) => [ps.name, ps.type._tag]) // => [["name", "String"]]
}
```

## Union

**Inspecting a union AST**

```efx
import { Schema, SchemaAST } from "effect"

const schema = Schema.Union([Schema.String, Schema.Number])
const ast = schema.ast

if (SchemaAST.isUnion(ast)) {
  [ast.types.length, ast.options?.mode ?? "anyOf"] // => [2, "anyOf"]
}
```

## Suspend

**Defining recursive schema ASTs**

```efx
import { Schema, SchemaAST } from "effect"

interface Category {
  readonly name: string
  readonly children: ReadonlyArray<Category>
}

const Category = Schema.Struct({
  name: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => Category))
})

SchemaAST.isObjects(Category.ast) // => true
```

## isPattern

**Validating an email pattern**

```efx
import { SchemaAST } from "effect"

const emailFilter = SchemaAST.isPattern(/^[^@]+@[^@]+$/)
emailFilter.run("alice@example.com", SchemaAST.string, {}) // => undefined
emailFilter.run("invalid", SchemaAST.string, {})?._tag // => "InvalidValue"
```

## toType

**Getting the type AST**

```efx
import { Schema, SchemaAST } from "effect"

const schema = Schema.NumberFromString
const typeAst = SchemaAST.toType(schema.ast)
typeAst._tag // => "Number"
```

## toEncoded

**Getting the encoded AST**

```efx
import { Schema, SchemaAST } from "effect"

const schema = Schema.NumberFromString
const encodedAst = SchemaAST.toEncoded(schema.ast)
encodedAst._tag // => "String"
```

## resolve

**Reading annotations**

```efx
import { Schema, SchemaAST } from "effect"

const schema = Schema.String.annotate({ title: "Name" })
const annotations = SchemaAST.resolve(schema.ast)
annotations?.title // => "Name"
```
