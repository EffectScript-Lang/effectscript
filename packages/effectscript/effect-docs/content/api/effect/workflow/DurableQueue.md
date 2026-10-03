# effect/workflow/DurableQueue

The examples in the JSDoc of `packages/effect/src/workflow/DurableQueue.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## make

**Defining a durable queue with workers**

```efx
// Define a DurableQueue that can be used to derive workers and offer items for
// processing.
const ApiQueue = DurableQueue.make({
  name: "ApiQueue",
  payload: {
    id: Schema.String
  },
  success: Schema.Void,
  error: Schema.Never,
  idempotencyKey(payload) {
    return payload.id
  }
})

const MyWorkflow = Workflow.make("MyWorkflow", {
  payload: {
    id: Schema.String
  },
  idempotencyKey: ({ id }) => id
})

const MyWorkflowLayer = MyWorkflow.toLayer(
  effect () => {
    // The workflow suspends until a worker completes this queue item.
    await DurableQueue.process(ApiQueue, { id: "api-call-1" })
    return "Workflow succeeded!"
  }
)

const processed: Array<string> = []
const processApiCall = ({ id }: { readonly id: string }) => sync(() => processed.push(id))

// Construct the worker layer without starting background workers in this example.
const ApiWorker = DurableQueue.worker(ApiQueue, processApiCall, {
  concurrency: 5
})

const program = effect {
  // Exercise the finite handler directly instead of running a queue worker.
  await processApiCall({ id: "api-call-1" })
  return [Layer.isLayer(MyWorkflowLayer), Layer.isLayer(ApiWorker), processed] as const
}

await runPromise(program) // => [true, true, ["api-call-1"]]
```
