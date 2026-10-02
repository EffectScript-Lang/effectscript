# effect/PrimaryKey

The examples in the JSDoc of `packages/effect/src/PrimaryKey.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## PrimaryKey

**Implementing a primary key**

```efx
import { PrimaryKey } from "effect"

class ProductId implements PrimaryKey.PrimaryKey {
  constructor(private category: string, private id: number) {}

  [PrimaryKey.symbol](): string {
    return `${this.category}-${this.id}`
  }
}

const productId = new ProductId("electronics", 42)
PrimaryKey.value(productId) // => "electronics-42"
```

## value

**Reading primary key values**

```efx
import { PrimaryKey } from "effect"

class OrderId implements PrimaryKey.PrimaryKey {
  constructor(private timestamp: number, private sequence: number) {}

  [PrimaryKey.symbol](): string {
    return `order_${this.timestamp}_${this.sequence}`
  }
}

const orderId = new OrderId(1640995200000, 1)
PrimaryKey.value(orderId) // => "order_1640995200000_1"

// Can also be used with simple string-based implementations
const simpleKey = {
  [PrimaryKey.symbol]: () => "simple-key-123"
}
PrimaryKey.value(simpleKey) // => "simple-key-123"
```
