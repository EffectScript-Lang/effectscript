> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

# Generators

## `Effect.gen`: Passing `this`

In v3, you could pass a `self` value directly as the first argument to
`Effect.gen`. In v4, `self` must be wrapped in an options object.

**v3**

```ts
import { Effect } from "effect"

class MyService {
  readonly local = 1
  compute = Effect.gen(this, function*() {
    return yield* Effect.succeed(this.local + 1)
  })
}
```

**v4**

```efx

class MyService {
  readonly local = 1
  compute = effect {
    return await succeed(this.local + 1)
  }
}
```
