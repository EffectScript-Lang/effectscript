# @effect/sql-pg/PgProtocol

The examples in the JSDoc of `packages/sql/pg/src/PgProtocol.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## makeBindEncoder

**Encoding a `Bind` message**

```efx
import { PgProtocol, PgTypes } from "@effect/sql-pg"

const encodeBind = PgProtocol.makeBindEncoder(PgTypes.writeParameter, PgTypes.isTextFormat)
const frame = encodeBind({ portal: "", statement: "s1", parameters: [PgTypes.int4(1)] })
```
