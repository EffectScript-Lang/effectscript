# effect/Number

The examples in the JSDoc of `packages/effect/src/Number.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Number

**Coercing values to numbers**

```efx
import { Number as N } from "effect"

N.Number("42") // => 42
N.Number("3.14") // => 3.14
```

## isNumber

**Checking for numbers**

```efx
import { Number } from "effect"

Number.isNumber(2) // => true
Number.isNumber("2") // => false
```

## sum

**Adding numbers**

```efx
import { Number } from "effect"

Number.sum(2, 3) // => 5
```

## multiply

**Multiplying numbers**

```efx
import { Number } from "effect"

Number.multiply(2, 3) // => 6
```

## subtract

**Subtracting numbers**

```efx
import { Number } from "effect"

Number.subtract(2, 3) // => -1
```

## divide

**Dividing numbers safely**

```efx
import { Number, Option } from "effect"

Number.divide(6, 3) // => Option.some(2)
Number.divide(6, 0) // => Option.none()
```

## divideUnsafe

**Dividing numbers unsafely**

```efx
import { Number, Result } from "effect"

Number.divideUnsafe(6, 3) // => 2

const failure = Result.try({
  try: () => Number.divideUnsafe(6, 0),
  catch: (error) => (error as Error).message
})
Result.merge(failure) // => "Division by zero"
```

## increment

**Incrementing a number**

```efx
import { Number } from "effect"

Number.increment(2) // => 3
```

## decrement

**Decrementing a number**

```efx
import { Number } from "effect"

Number.decrement(3) // => 2
```

## Order

**Comparing numbers**

```efx
import { Number } from "effect"

Number.Order(1, 2) // => -1
Number.Order(2, 1) // => 1
Number.Order(1, 1) // => 0
```

## Equivalence

**Comparing numbers for equivalence**

```efx
import { Number } from "effect"

Number.Equivalence(1, 1) // => true
Number.Equivalence(1, 2) // => false
Number.Equivalence(NaN, NaN) // => true
```

## isLessThan

**Checking less-than comparisons**

```efx
import { Number } from "effect"

Number.isLessThan(2, 3) // => true
Number.isLessThan(3, 3) // => false
Number.isLessThan(4, 3) // => false
```

## isLessThanOrEqualTo

**Checking less-than-or-equal comparisons**

```efx
import { Number } from "effect"

Number.isLessThanOrEqualTo(2, 3) // => true
Number.isLessThanOrEqualTo(3, 3) // => true
Number.isLessThanOrEqualTo(4, 3) // => false
```

## isGreaterThan

**Checking greater-than comparisons**

```efx
import { Number } from "effect"

Number.isGreaterThan(2, 3) // => false
Number.isGreaterThan(3, 3) // => false
Number.isGreaterThan(4, 3) // => true
```

## isGreaterThanOrEqualTo

**Checking greater-than-or-equal comparisons**

```efx
import { Number } from "effect"

Number.isGreaterThanOrEqualTo(2, 3) // => false
Number.isGreaterThanOrEqualTo(3, 3) // => true
Number.isGreaterThanOrEqualTo(4, 3) // => true
```

## between

**Checking inclusive ranges**

```efx
import { Number } from "effect"

const between = Number.between({ minimum: 0, maximum: 5 })

between(3) // => true
between(-1) // => false
between(6) // => false
```

## clamp

**Clamping to a range**

```efx
import { Number } from "effect"

const clamp = Number.clamp({ minimum: 1, maximum: 5 })

clamp(3) // => 3
clamp(0) // => 1
clamp(6) // => 5
```

## min

**Finding the minimum**

```efx
import { Number } from "effect"

Number.min(2, 3) // => 2
```

## max

**Finding the maximum**

```efx
import { Number } from "effect"

Number.max(2, 3) // => 3
```

## sign

**Determining the sign**

```efx
import { Number } from "effect"

Number.sign(-5) // => -1
Number.sign(0) // => 0
Number.sign(5) // => 1
```

## sumAll

**Summing an iterable**

```efx
import { Number } from "effect"

Number.sumAll([2, 3, 4]) // => 9
```

## multiplyAll

**Multiplying an iterable**

```efx
import { Number } from "effect"

Number.multiplyAll([2, 3, 4]) // => 24
```

## remainder

**Calculating remainders**

```efx
import { Number } from "effect"

Number.remainder(2, 2) // => 0
Number.remainder(3, 2) // => 1
Number.remainder(-4, 2) // => -0
```

## nextPow2

**Finding the next power of two**

```efx
import { Number } from "effect"

Number.nextPow2(5) // => 8
Number.nextPow2(17) // => 32
```

## parse

**Parsing numbers from strings**

```efx
import { Number, Option } from "effect"

Number.parse("42") // => Option.some(42)
Number.parse("3.14") // => Option.some(3.14)
Number.parse("NaN") // => Option.some(NaN)
Number.parse("Infinity") // => Option.some(Infinity)
Number.parse("-Infinity") // => Option.some(-Infinity)
Number.parse("not a number") // => Option.none()
```

## round

**Rounding with precision**

```efx
import { Number } from "effect"

Number.round(1.1234, 2) // => 1.12
Number.round(1.567, 2) // => 1.57
```
