# effect/Redactable

The examples in the JSDoc of `packages/effect/src/Redactable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## symbolRedactable

**Masking an API key**

```efx
import { Context, Redactable } from "effect"

class ApiKey {
  constructor(readonly raw: string) {}

  [Redactable.symbolRedactable](_ctx: Context.Context<never>) {
    return this.raw.slice(0, 4) + "..."
  }
}

Redactable.redact(new ApiKey("secret-key")) // => "secr..."
```

## Redactable

**Masking an API key**

```efx
import { Context, Redactable } from "effect"

class ApiKey {
  constructor(readonly raw: string) {}

  [Redactable.symbolRedactable](_ctx: Context.Context<never>) {
    return this.raw.slice(0, 4) + "..."
  }
}

Redactable.redact(new ApiKey("secret-key")) // => "secr..."
```
