# effect/BigInt

The examples in the JSDoc of `packages/effect/src/BigInt.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## BigInt

**Constructing bigints**

```efx
import { BigInt } from "effect"

BigInt.BigInt(123) // => 123n
BigInt.BigInt("456") // => 456n
```

## isBigInt

**Checking for bigints**

```efx
import { BigInt } from "effect"

BigInt.isBigInt(1n) // => true
BigInt.isBigInt(1) // => false
```

## sum

**Adding bigints**

```efx
import { BigInt } from "effect"

BigInt.sum(2n, 3n) // => 5n
```

## multiply

**Multiplying bigints**

```efx
import { BigInt } from "effect"

BigInt.multiply(2n, 3n) // => 6n
```

## subtract

**Subtracting bigints**

```efx
import { BigInt } from "effect"

BigInt.subtract(2n, 3n) // => -1n
```

## divide

**Dividing bigints safely**

```efx
import { BigInt, Option } from "effect"

BigInt.divide(6n, 3n) // => Option.some(2n)
BigInt.divide(6n, 0n) // => Option.none()
```

## divideUnsafe

**Dividing bigints unsafely**

```efx
import { BigInt } from "effect"

BigInt.divideUnsafe(6n, 3n) // => 2n
BigInt.divideUnsafe(6n, 4n) // => 1n
```

## increment

**Incrementing a bigint**

```efx
import { BigInt } from "effect"

BigInt.increment(2n) // => 3n
```

## decrement

**Decrementing a bigint**

```efx
import { BigInt } from "effect"

BigInt.decrement(3n) // => 2n
```

## Order

**Comparing bigints with Order**

```efx
import { BigInt } from "effect"

const a = 123n
const b = 456n
const c = 123n

BigInt.Order(a, b) // => -1
BigInt.Order(b, a) // => 1
BigInt.Order(a, c) // => 0
```

## Equivalence

**Comparing bigints for equivalence**

```efx
import { BigInt } from "effect"

BigInt.Equivalence(1n, 1n) // => true
BigInt.Equivalence(1n, 2n) // => false
```

## isLessThan

**Checking less-than comparisons**

```efx
import { BigInt } from "effect"

BigInt.isLessThan(2n, 3n) // => true
BigInt.isLessThan(3n, 3n) // => false
BigInt.isLessThan(4n, 3n) // => false
```

## isLessThanOrEqualTo

**Checking less-than-or-equal comparisons**

```efx
import { BigInt } from "effect"

BigInt.isLessThanOrEqualTo(2n, 3n) // => true
BigInt.isLessThanOrEqualTo(3n, 3n) // => true
BigInt.isLessThanOrEqualTo(4n, 3n) // => false
```

## isGreaterThan

**Checking greater-than comparisons**

```efx
import { BigInt } from "effect"

BigInt.isGreaterThan(2n, 3n) // => false
BigInt.isGreaterThan(3n, 3n) // => false
BigInt.isGreaterThan(4n, 3n) // => true
```

## isGreaterThanOrEqualTo

**Checking greater-than-or-equal comparisons**

```efx
import { BigInt } from "effect"

BigInt.isGreaterThanOrEqualTo(2n, 3n) // => false
BigInt.isGreaterThanOrEqualTo(3n, 3n) // => true
BigInt.isGreaterThanOrEqualTo(4n, 3n) // => true
```

## between

**Checking whether a bigint is within bounds**

```efx
import { BigInt } from "effect"

const between = BigInt.between({ minimum: 0n, maximum: 5n })

between(3n) // => true
between(-1n) // => false
between(6n) // => false
```

## clamp

**Clamping a bigint to bounds**

```efx
import { BigInt } from "effect"

const clamp = BigInt.clamp({ minimum: 1n, maximum: 5n })

clamp(3n) // => 3n
clamp(0n) // => 1n
clamp(6n) // => 5n
```

## min

**Finding the minimum bigint**

```efx
import { BigInt } from "effect"

BigInt.min(2n, 3n) // => 2n
```

## max

**Finding the maximum bigint**

```efx
import { BigInt } from "effect"

BigInt.max(2n, 3n) // => 3n
```

## sign

**Determining bigint signs**

```efx
import { BigInt } from "effect"

BigInt.sign(-5n) // => -1
BigInt.sign(0n) // => 0
BigInt.sign(5n) // => 1
```

## abs

**Calculating absolute values**

```efx
import { BigInt } from "effect"

BigInt.abs(-5n) // => 5n
BigInt.abs(0n) // => 0n
BigInt.abs(5n) // => 5n
```

## gcd

**Calculating greatest common divisors**

```efx
import { BigInt } from "effect"

BigInt.gcd(2n, 3n) // => 1n
BigInt.gcd(2n, 4n) // => 2n
BigInt.gcd(16n, 24n) // => 8n
```

## lcm

**Calculating least common multiples**

```efx
import { BigInt } from "effect"

BigInt.lcm(2n, 3n) // => 6n
BigInt.lcm(2n, 4n) // => 4n
BigInt.lcm(16n, 24n) // => 48n
```

## sqrtUnsafe

**Calculating square roots unsafely**

```efx
import { BigInt } from "effect"

BigInt.sqrtUnsafe(4n) // => 2n
BigInt.sqrtUnsafe(9n) // => 3n
BigInt.sqrtUnsafe(16n) // => 4n
```

## sqrt

**Calculating square roots safely**

```efx
import { BigInt, Option } from "effect"

BigInt.sqrt(4n) // => Option.some(2n)
BigInt.sqrt(9n) // => Option.some(3n)
BigInt.sqrt(16n) // => Option.some(4n)
BigInt.sqrt(-1n) // => Option.none()
```

## sumAll

**Summing iterable bigints**

```efx
import { BigInt } from "effect"

BigInt.sumAll([2n, 3n, 4n]) // => 9n
```

## multiplyAll

**Multiplying iterable bigints**

```efx
import { BigInt } from "effect"

BigInt.multiplyAll([2n, 3n, 4n]) // => 24n
```

## toNumber

**Converting bigints to numbers**

```efx
import { BigInt as BI, Option } from "effect"

BI.toNumber(42n) // => Option.some(42)
BI.toNumber(9007199254740992n) // => Option.none()
BI.toNumber(-9007199254740992n) // => Option.none()
```

## fromString

**Parsing strings as bigints**

```efx
import { BigInt, Option } from "effect"

BigInt.fromString("42") // => Option.some(42n)
BigInt.fromString(" ") // => Option.none()
BigInt.fromString("a") // => Option.none()
```

## fromNumber

**Converting numbers to bigints**

```efx
import { BigInt, Option } from "effect"

BigInt.fromNumber(42) // => Option.some(42n)
BigInt.fromNumber(Number.MAX_SAFE_INTEGER + 1) // => Option.none()
BigInt.fromNumber(Number.MIN_SAFE_INTEGER - 1) // => Option.none()
```

## remainder

**Calculating remainders**

```efx
import { BigInt } from "effect"

BigInt.remainder(10n, 3n) // => 1n
BigInt.remainder(15n, 4n) // => 3n
```
