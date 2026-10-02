# effect/SchemaIssue

The examples in the JSDoc of `packages/effect/src/SchemaIssue.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## isIssue

**Type-guarding an unknown error**

```efx
import { SchemaIssue } from "effect"

const issue = new SchemaIssue.MissingKey(undefined)
SchemaIssue.isIssue(issue) // => true
SchemaIssue.isIssue("not an issue") // => false
```

## hasInput

**Reading a reported input**

```efx
import { Result, Schema, SchemaIssue } from "effect"

const result = Schema.decodeUnknownResult(Schema.String)(1, { reportInput: true })
if (Result.isFailure(result) && SchemaIssue.hasInput(result.failure.issue)) {
  result.failure.issue.input // => 1
}
```

## Filter

**Matching a Filter issue**

```efx
import { SchemaAST, SchemaIssue } from "effect"

const formatIssue = SchemaIssue.makeFormatterDefault()

function describe(issue: SchemaIssue.Issue): string {
  if (issue._tag === "Filter") {
    return `Filter failed: ${formatIssue(issue.issue)}`
  }
  return formatIssue(issue)
}

const issue = new SchemaIssue.Filter(
  SchemaAST.isPattern(/^valid$/),
  new SchemaIssue.InvalidValue()
)
describe(issue) // => `Filter failed: Expected a valid value`
```

## InvalidType

**Formatting a type mismatch**

```efx
import { Schema, SchemaIssue } from "effect"

const formatIssue = SchemaIssue.makeFormatterDefault()
const issue = new SchemaIssue.InvalidType(Schema.String.ast)
formatIssue(issue) // => "Expected string"
```

## InvalidValue

**Returning InvalidValue from a custom filter**

```efx
import { SchemaIssue } from "effect"

const formatIssue = SchemaIssue.makeFormatterDefault()
const issue = new SchemaIssue.InvalidValue({ message: "must not be empty" })
formatIssue(issue) // => "must not be empty"
```

## Forbidden

**Creating a Forbidden issue**

```efx
import { SchemaIssue } from "effect"

const formatIssue = SchemaIssue.makeFormatterDefault()
const issue = new SchemaIssue.Forbidden(
  { message: "async operation not allowed in sync context" }
)
formatIssue(issue) // => "async operation not allowed in sync context"
```

## defaultLeafHook

**Formatting Standard Schema issues with defaultLeafHook**

```efx
import { SchemaIssue } from "effect"

const formatter = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: SchemaIssue.defaultLeafHook
})
formatter(new SchemaIssue.MissingKey(undefined)) // => { issues: [{ path: [], message: "Missing key" }] }
```

## makeFormatterStandardSchemaV1

**Creating a Standard Schema V1 formatter**

```efx
import { SchemaIssue } from "effect"

const formatter = SchemaIssue.makeFormatterStandardSchemaV1()
formatter(new SchemaIssue.MissingKey(undefined)).issues[0].message // => "Missing key"
```

## makeFormatterDefault

**Formatting an issue as a string**

```efx
import { SchemaIssue } from "effect"

const formatter = SchemaIssue.makeFormatterDefault()
formatter(new SchemaIssue.MissingKey(undefined)) // => "Missing key"
```
