# effect/Pipeable

The examples in the JSDoc of `packages/effect/src/Pipeable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Pipeable

**Chaining operations with pipe**

```efx

// The Pipeable interface allows Effect values to be chained using the pipe method
const program = succeed(1).pipe(
  map((x) => x + 1),
  flatMap((x) => succeed(x * 2))
)

runSync(program) // => 4
```

## pipeArguments

**Implementing a pipe method**

```efx
import { Pipeable } from "effect"

class NumberBox {
  constructor(readonly value: number) {}

  pipe(..._fns: ReadonlyArray<(value: number) => number>): number {
    return Pipeable.pipeArguments(this.value, arguments) as number
  }
}

const result = new NumberBox(5).pipe(
  (n) => n + 2,
  (n) => n * 3
)
result // => 21
```
