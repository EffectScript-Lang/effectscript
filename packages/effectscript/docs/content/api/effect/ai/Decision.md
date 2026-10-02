# effect/ai/Decision

The examples in the JSDoc of `packages/effect/src/ai/Decision.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## classify

**Choosing a department**

```efx
import { Decision } from "effect/ai"

const department = Decision.classify({
  instructions: "Which team should handle this",
  criteria: {
    billing: "payments",
    technical: "bugs",
    sales: "pricing"
  }
})
```

## rate

**Rating frustration**

```efx
import { Decision } from "effect/ai"

const frustration = Decision.rate({
  instructions: "How frustrated",
  criteria: ["calm", "frustrated", "angry"]
})
```

## probability

**Estimating urgency**

```efx
import { Decision } from "effect/ai"

const urgent = Decision.probability({
  instructions: "The message is time-sensitive"
})
```

**Providing outcome descriptions**

```efx
import { Decision } from "effect/ai"

const urgent = Decision.probability({
  instructions: "The message is time-sensitive",
  criteria: {
    false: "The message can wait",
    true: "The message needs immediate attention"
  }
})
```

## make

**Defining ticket triage**

```efx
import { Schema } from "effect"
import { Decision } from "effect/ai"

const Ticket = Schema.Struct({
  subject: Schema.String,
  body: Schema.String
})

const TicketTriage = Decision.make({
  input: Ticket,
  decisions: {
    department: Decision.classify({
      instructions: "Which team should handle this",
      criteria: { billing: "payments", technical: "bugs" }
    }),
    urgent: Decision.probability({
      instructions: "The message is time-sensitive",
      criteria: { false: "No time pressure", true: "Needs action now" }
    })
  }
})
```
