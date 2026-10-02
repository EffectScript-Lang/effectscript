# effect/observability/OtlpExporter

The examples in the JSDoc of `packages/effect/src/observability/OtlpExporter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Module

**Flushing exporters**

```efx

const program = effect {
  const flusher = await OtlpExporter.Flusher
  await flusher.flush
  return "flushed"
} |> provide(OtlpExporter.layerFlusher)

await runPromise(program) // => "flushed"
```
