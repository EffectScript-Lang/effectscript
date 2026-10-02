# effect/cluster/EntityProxy

The examples in the JSDoc of `packages/effect/src/cluster/EntityProxy.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## toRpcGroup

**Deriving RPC endpoints from an entity**

```efx
import { Layer, Schema } from "effect"
import { ClusterSchema, Entity, EntityProxy, EntityProxyServer } from "effect/cluster"
import { Rpc, RpcServer } from "effect/rpc"

export const Counter = Entity.make("Counter", [
  Rpc.make("Increment", {
    payload: { id: Schema.String, amount: Schema.Number },
    primaryKey: ({ id }) => id,
    success: Schema.Number
  })
]).annotateRpcs(ClusterSchema.Persisted, true)

// Use EntityProxy.toRpcGroup to create a `RpcGroup` from the Counter entity
export class MyRpcs extends EntityProxy.toRpcGroup(Counter) {}

// Use EntityProxyServer.layerRpcHandlers to create a layer that implements
// the rpc handlers
const RpcServerLayer = RpcServer.layer(MyRpcs).pipe(
  Layer.provide(EntityProxyServer.layerRpcHandlers(Counter))
)
const result = [MyRpcs.requests.size, Layer.isLayer(RpcServerLayer)] // => [2, true]
```

## toHttpApiGroup

**Deriving HTTP API endpoints from an entity**

```efx
import { ClusterSchema, Entity, EntityProxy } from "effect/cluster"
import { HttpApi } from "effect/http-api"
import { Rpc } from "effect/rpc"

export const Counter = Entity.make("Counter", [
  Rpc.make("Increment", {
    payload: { id: Schema.String, amount: Schema.Number },
    primaryKey: ({ id }) => id,
    success: Schema.Number
  })
]).annotateRpcs(ClusterSchema.Persisted, true)

// Use EntityProxy.toHttpApiGroup to create a `HttpApiGroup` from the
// Counter entity
export api MyApi "api" { EntityProxy.toHttpApiGroup("counter", Counter)
      .prefix("/counter") }

// Use EntityProxyServer.layerHttpApi to create a layer that implements
// the handlers for the HttpApiGroup
const ApiLayer = HttpApiBuilder.layer(MyApi).pipe(
  Layer.provide(EntityProxyServer.layerHttpApi(MyApi, "counter", Counter))
)
const result = [Object.keys(MyApi.groups.counter.endpoints).length, Layer.isLayer(ApiLayer)] // => [2, true]
```
