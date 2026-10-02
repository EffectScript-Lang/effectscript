# effect/ExecutionPlan

The examples in the JSDoc of `packages/effect/src/ExecutionPlan.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## ExecutionPlan

**Defining fallback execution steps**

```efx
import { Context, ExecutionPlan } from "effect"

const ThePlan = ExecutionPlan.make(
  {
    provide: Context.empty(),
    attempts: 2
  },
  {
    provide: Context.empty()
  }
)

ThePlan.steps.map((step) => step.attempts ?? 1) // => [2, 1]
```

## make

**Creating an execution plan**

```efx
import { Context, ExecutionPlan } from "effect"

const ThePlan = ExecutionPlan.make(
  {
    provide: Context.empty(),
    attempts: 2
  },
  {
    provide: Context.empty()
  }
)

ThePlan.steps.length // => 2
```
