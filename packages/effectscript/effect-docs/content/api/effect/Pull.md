# effect/Pull

The examples in the JSDoc of `packages/effect/src/Pull.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## matchEffect

**Matching Pull outcomes**

```efx

const pull = Cause.done("stream ended")

const result = Pull.matchEffect(pull, {
  onSuccess: (value) => succeed(`Got value: ${value}`),
  onFailure: (cause) => succeed(`Got error: ${cause}`),
  onDone: (leftover) => succeed(`Stream halted with: ${leftover}`)
})

await runPromise(result) // => "Stream halted with: stream ended"
```
