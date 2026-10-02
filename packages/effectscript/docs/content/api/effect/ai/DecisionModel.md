# effect/ai/DecisionModel

The examples in the JSDoc of `packages/effect/src/ai/DecisionModel.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## decide

**Triaging a ticket**

```efx

const TicketTriage = Decision.make({
  input: Schema.String,
  decisions: {
    urgent: Decision.probability({
      instructions: "The message is time-sensitive",
      criteria: { false: "No time pressure", true: "Needs action now" }
    })
  }
})

const program = effect {
  const { answers, usage } = await DecisionModel.decide(TicketTriage, {
    input: "My card was charged twice, please fix this today"
  })
  return { probability: answers.urgent.probability, usage }
}
```
