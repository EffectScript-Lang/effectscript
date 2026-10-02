# effect/Boolean

The examples in the JSDoc of `packages/effect/src/Boolean.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Boolean

**Coercing values to booleans**

```efx
import { Boolean } from "effect"

Boolean.Boolean(1) // => true
Boolean.Boolean("false") // => true
Boolean.Boolean(0) // => false
```

## isBoolean

**Checking for booleans**

```efx
import { Boolean } from "effect"

Boolean.isBoolean(true) // => true
Boolean.isBoolean("true") // => false
```

## match

**Pattern matching on booleans**

```efx
import { Boolean } from "effect"

Boolean.match(true, {
  onFalse: () => "It's false!",
  onTrue: () => "It's true!"
}) // => "It's true!"
```

## Order

**Comparing booleans**

```efx
import { Boolean } from "effect"

Boolean.Order(false, true) // => -1
Boolean.Order(true, false) // => 1
Boolean.Order(true, true) // => 0
```

## Equivalence

**Comparing booleans for equivalence**

```efx
import { Boolean } from "effect"

Boolean.Equivalence(true, true) // => true
Boolean.Equivalence(true, false) // => false
```

## not

**Negating booleans**

```efx
import { Boolean } from "effect"

Boolean.not(true) // => false
Boolean.not(false) // => true
```

## and

**Combining booleans with AND**

```efx
import { Boolean } from "effect"

Boolean.and(true, true) // => true
Boolean.and(true, false) // => false
Boolean.and(false, true) // => false
Boolean.and(false, false) // => false
```

## nand

**Combining booleans with NAND**

```efx
import { Boolean } from "effect"

Boolean.nand(true, true) // => false
Boolean.nand(true, false) // => true
Boolean.nand(false, true) // => true
Boolean.nand(false, false) // => true
```

## or

**Combining booleans with OR**

```efx
import { Boolean } from "effect"

Boolean.or(true, true) // => true
Boolean.or(true, false) // => true
Boolean.or(false, true) // => true
Boolean.or(false, false) // => false
```

## nor

**Combining booleans with NOR**

```efx
import { Boolean } from "effect"

Boolean.nor(true, true) // => false
Boolean.nor(true, false) // => false
Boolean.nor(false, true) // => false
Boolean.nor(false, false) // => true
```

## xor

**Combining booleans with XOR**

```efx
import { Boolean } from "effect"

Boolean.xor(true, true) // => false
Boolean.xor(true, false) // => true
Boolean.xor(false, true) // => true
Boolean.xor(false, false) // => false
```

## eqv

**Checking boolean equivalence**

```efx
import { Boolean } from "effect"

Boolean.eqv(true, true) // => true
Boolean.eqv(true, false) // => false
Boolean.eqv(false, true) // => false
Boolean.eqv(false, false) // => true
```

## implies

**Checking boolean implication**

```efx
import { Boolean } from "effect"

Boolean.implies(true, true) // => true
Boolean.implies(true, false) // => false
Boolean.implies(false, true) // => true
Boolean.implies(false, false) // => true
```

## every

**Checking every boolean**

```efx
import { Boolean } from "effect"

Boolean.every([true, true, true]) // => true
Boolean.every([true, false, true]) // => false
```

## some

**Checking some booleans**

```efx
import { Boolean } from "effect"

Boolean.some([true, false, true]) // => true
Boolean.some([false, false, false]) // => false
```
