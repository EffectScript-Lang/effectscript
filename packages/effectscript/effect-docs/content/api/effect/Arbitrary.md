# effect/Arbitrary

The examples in the JSDoc of `packages/effect/src/Arbitrary.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## array

**Removing irrelevant commands**

```efx

const command = Arbitrary.schema(Schema.Literals(["Add", "Reset", "Stop"]))
const commands = Arbitrary.array(command, { maxLength: 50 })
const result = await runPromise(
  Arbitrary.checkEffect(commands, (values) => {
    // The state machine fails when Reset occurs before a later Stop.
    const reset = values.indexOf("Reset")
    return reset === -1 || !values.slice(reset + 1).includes("Stop")
  }, { runs: 1, size: 4, seed: 0 })
)

result._tag // => "Falsified"
if (result._tag === "Falsified") {
  result.initialInput // => ["Add", "Add", "Reset", "Stop"]
  result.shrunkInput // => ["Reset", "Stop"]
}
```
