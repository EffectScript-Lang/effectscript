# effect/workflow/WorkflowProxy

The examples in the JSDoc of `packages/effect/src/workflow/WorkflowProxy.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## toRpcGroup

**Deriving RPC endpoints from workflows**

```efx
import { Layer, Schema } from "effect"
import { RpcServer } from "effect/rpc"
import { Workflow, WorkflowProxy, WorkflowProxyServer } from "effect/workflow"

const EmailWorkflow = Workflow.make("EmailWorkflow", {
  payload: {
    id: Schema.String,
    to: Schema.String
  },
  idempotencyKey: ({ id }) => id
})

const myWorkflows = [EmailWorkflow] as const

// Use WorkflowProxy.toRpcGroup to create a `RpcGroup` from the
// workflows
class MyRpcs extends WorkflowProxy.toRpcGroup(myWorkflows) {}

// Use WorkflowProxyServer.layerRpcHandlers to create a layer that implements
// the rpc handlers
const ApiLayer = RpcServer.layer(MyRpcs).pipe(
  Layer.provide(WorkflowProxyServer.layerRpcHandlers(myWorkflows))
)
const result = [MyRpcs.requests.size, Layer.isLayer(ApiLayer)] // => [3, true]
```

## toHttpApiGroup

**Deriving HTTP API endpoints from workflows**

```efx
import { WorkflowProxy } from "effect/workflow"

const EmailWorkflow = Workflow.make("EmailWorkflow", {
  payload: {
    id: Schema.String,
    to: Schema.String
  },
  idempotencyKey: ({ id }) => id
})

const myWorkflows = [EmailWorkflow] as const

// Use WorkflowProxy.toHttpApiGroup to create a `HttpApiGroup` from the
// workflows
api MyApi "api" { WorkflowProxy.toHttpApiGroup("workflows", myWorkflows) }

// Use WorkflowProxyServer.layerHttpApi to create a layer that implements the
// workflows HttpApiGroup
const ApiLayer = HttpApiBuilder.layer(MyApi).pipe(
  Layer.provide(
    WorkflowProxyServer.layerHttpApi(MyApi, "workflows", myWorkflows)
  )
)
const result = [Object.keys(MyApi.groups.workflows.endpoints).length, Layer.isLayer(ApiLayer)] // => [3, true]
```
