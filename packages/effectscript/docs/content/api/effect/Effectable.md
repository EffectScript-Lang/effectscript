# effect/Effectable

The examples in the JSDoc of `packages/effect/src/Effectable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Mixin

**Evaluating a mixed-in class**

```efx

class Box {
  constructor(readonly value: number) {}
}

class EffectBox extends Effectable.Mixin(Box) {
  asEffect() {
    return succeed(this.value)
  }
}

const box = new EffectBox(2)
isEffect(box) // => true
await runPromise(box) // => 2
```
