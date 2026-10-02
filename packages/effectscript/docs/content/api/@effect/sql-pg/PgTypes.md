# @effect/sql-pg/PgTypes

The examples in the JSDoc of `packages/sql/pg/src/PgTypes.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## makeFieldReader

**Updating the reader after `RowDescription`**

```efx
import { PgProtocol, PgTypes } from "@effect/sql-pg"

const parser = PgProtocol.makeParser({ readField: Result.getOrThrow(PgTypes.makeFieldReader([])) })
// on each RowDescription
declare const description: PgProtocol.RowDescription
parser.readField = Result.getOrThrow(PgTypes.makeFieldReader(description.fields))
```
