# effect/rpc/Rpc

The examples in the JSDoc of `packages/effect/src/rpc/Rpc.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## custom

**Defining a paginated RPC constructor**

```efx
import { Schema } from "effect"
import { Rpc } from "effect/rpc"

// Create a custom Rpc wrapper definition by transforming the success and error
// schemas.
export interface RpcWithPagination extends Rpc.Custom {
  readonly out: Rpc.Custom.Out<
    Paginated<this["success"]>,
    this["error"]
  >
}

// The type definition for the transformed success schema.
export interface Paginated<S extends Schema.Constraint> extends
  Schema.Struct<{
    readonly offset: Schema.Number
    readonly total: Schema.Number
    readonly results: Schema.$Array<S>
  }>
{}

// You can then implement the schema transformation using `Rpc.custom`
export const makePaginated = Rpc.custom<RpcWithPagination>((schemas) => ({
  ...schemas,
  success: Schema.Struct({
    offset: Schema.Number,
    total: Schema.Number,
    results: Schema.Array(schemas.success)
  })
}))

// You can then use the custom constructor in the same way `Rpc.make` is used.
export const listAllRpc = makePaginated("listAll", {
  success: Schema.String
})

const result = [listAllRpc._tag, Schema.isSchema(listAllRpc.successSchema)] // => ["listAll", true]
```
