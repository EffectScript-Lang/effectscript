# effect/ai/Model

The examples in the JSDoc of `packages/effect/src/ai/Model.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## make

**Providing model metadata**

```efx

const model = Model.make("amazon-bedrock", "claude-3-5-haiku", Layer.empty)
const program = effect {
  const provider = await Model.ProviderName
  const modelName = await Model.ModelName
  return { provider, modelName }
} |> provide(model)

await runPromise(program) // => { provider: "amazon-bedrock", modelName: "claude-3-5-haiku" }
```
