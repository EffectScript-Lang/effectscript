# effect/process/ChildProcessSpawner

The examples in the JSDoc of `packages/effect/src/process/ChildProcessSpawner.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Module

**Temporarily unreferencing a child process**

```efx
import type { ChildProcessSpawner } from "effect/process"

let referenced = true

const unref: ChildProcessSpawner.ChildProcessHandle["unref"] = sync(() => {
  referenced = false
  const reref: ChildProcessSpawner.Reref = sync(() => {
    referenced = true
  })
  return reref
})

const program = effect {
  const states = [] as Array<boolean>
  const reref = await unref
  states.push(referenced)

  await reref
  states.push(referenced)
  return states
}

runSync(program) // => [false, true]
```
