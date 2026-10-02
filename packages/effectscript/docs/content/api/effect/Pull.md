# effect/Pull

The examples in the JSDoc of `packages/effect/src/Pull.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

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
