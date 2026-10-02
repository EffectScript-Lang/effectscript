# effect/BigDecimal

The examples in the JSDoc of `packages/effect/src/BigDecimal.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## BigDecimal

**Inspecting BigDecimal storage**

```efx
import { BigDecimal } from "effect"

const d = BigDecimal.fromStringUnsafe("123.45")

d.value // => 12345n
d.scale // => 2
```

## isBigDecimal

**Checking BigDecimal values**

```efx
import { BigDecimal } from "effect"

const decimal = BigDecimal.fromNumber(123.45)
BigDecimal.isBigDecimal(decimal) // => false
BigDecimal.isBigDecimal(BigDecimal.fromStringUnsafe("123.45")) // => true
BigDecimal.isBigDecimal(123.45) // => false
BigDecimal.isBigDecimal("123.45") // => false
```

## make

**Creating decimals from bigint and scale**

```efx
import { BigDecimal } from "effect"

// Create 123.45 (12345 with scale 2)
const decimal = BigDecimal.make(12345n, 2)
decimal // => BigDecimal.fromStringUnsafe("123.45")

// Create 42 (42 with scale 0)
const integer = BigDecimal.make(42n, 0)
integer // => BigDecimal.fromBigInt(42n)
```

## normalize

**Normalizing trailing zeros**

```efx
import { BigDecimal } from "effect"

const decimal = BigDecimal.normalize(BigDecimal.fromStringUnsafe("123.00000"))
const decimalStorage = [decimal.value, decimal.scale] // => [123n, 0]

const largeDecimal = BigDecimal.normalize(BigDecimal.fromStringUnsafe("12300000"))
const largeDecimalStorage = [largeDecimal.value, largeDecimal.scale] // => [123n, -5]
```

## scale

**Scaling decimal precision**

```efx
import { BigDecimal } from "effect"

const decimal = BigDecimal.fromNumberUnsafe(123.45)

// Increase scale (add more precision)
const scaled = BigDecimal.scale(decimal, 4)
const scaledStorage = [scaled.value, scaled.scale] // => [1234500n, 4]

// Decrease scale (reduce precision, truncating toward zero)
const reduced = BigDecimal.scale(decimal, 1)
reduced // => BigDecimal.fromStringUnsafe("123.4")
```

## sum

**Adding decimals**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.sum(
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3")
) // => BigDecimal.fromBigInt(5n)
```

## sumAll

**Adding multiple decimals**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.sumAll([
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3"),
  BigDecimal.fromStringUnsafe("4")
]) // => BigDecimal.fromBigInt(9n)
```

## multiply

**Multiplying decimals**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.multiply(
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3")
) // => BigDecimal.fromBigInt(6n)
```

## multiplyAll

**Multiplying multiple decimals**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.multiplyAll([
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3"),
  BigDecimal.fromStringUnsafe("4")
]) // => BigDecimal.fromBigInt(24n)
```

## subtract

**Subtracting decimals**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.subtract(
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3")
) // => BigDecimal.fromBigInt(-1n)
```

## divide

**Dividing decimals safely**

```efx
import { BigDecimal, Option } from "effect"

const six = BigDecimal.fromBigInt(6n)

BigDecimal.divide(six, BigDecimal.fromBigInt(3n)) // => Option.some(BigDecimal.fromBigInt(2n))
BigDecimal.divide(six, BigDecimal.fromBigInt(4n)) // => Option.some(BigDecimal.fromStringUnsafe("1.5"))
BigDecimal.divide(six, BigDecimal.fromBigInt(0n)) // => Option.none()
```

## divideUnsafe

**Dividing decimals unsafely**

```efx
import { BigDecimal } from "effect"

BigDecimal.divideUnsafe(BigDecimal.fromStringUnsafe("6"), BigDecimal.fromStringUnsafe("3")) // => BigDecimal.fromBigInt(2n)
BigDecimal.divideUnsafe(BigDecimal.fromStringUnsafe("6"), BigDecimal.fromStringUnsafe("4")) // => BigDecimal.fromStringUnsafe("1.5")
```

## Order

**Comparing decimals**

```efx
import { BigDecimal } from "effect"

const a = BigDecimal.fromNumberUnsafe(1.5)
const b = BigDecimal.fromNumberUnsafe(2.3)
const c = BigDecimal.fromNumberUnsafe(1.5)

BigDecimal.Order(a, b) // => -1
BigDecimal.Order(b, a) // => 1
BigDecimal.Order(a, c) // => 0
```

## isLessThan

**Checking less-than comparisons**

```efx
import { BigDecimal } from "effect"

const two = BigDecimal.fromStringUnsafe("2")
const three = BigDecimal.fromStringUnsafe("3")
const four = BigDecimal.fromStringUnsafe("4")

BigDecimal.isLessThan(two, three) // => true
BigDecimal.isLessThan(three, three) // => false
BigDecimal.isLessThan(four, three) // => false
```

## isLessThanOrEqualTo

**Checking less-than-or-equal comparisons**

```efx
import { BigDecimal } from "effect"

const two = BigDecimal.fromStringUnsafe("2")
const three = BigDecimal.fromStringUnsafe("3")
const four = BigDecimal.fromStringUnsafe("4")

BigDecimal.isLessThanOrEqualTo(two, three) // => true
BigDecimal.isLessThanOrEqualTo(three, three) // => true
BigDecimal.isLessThanOrEqualTo(four, three) // => false
```

## isGreaterThan

**Checking greater-than comparisons**

```efx
import { BigDecimal } from "effect"

const two = BigDecimal.fromStringUnsafe("2")
const three = BigDecimal.fromStringUnsafe("3")
const four = BigDecimal.fromStringUnsafe("4")

BigDecimal.isGreaterThan(two, three) // => false
BigDecimal.isGreaterThan(three, three) // => false
BigDecimal.isGreaterThan(four, three) // => true
```

## isGreaterThanOrEqualTo

**Checking greater-than-or-equal comparisons**

```efx
import { BigDecimal } from "effect"

const two = BigDecimal.fromStringUnsafe("2")
const three = BigDecimal.fromStringUnsafe("3")
const four = BigDecimal.fromStringUnsafe("4")

BigDecimal.isGreaterThanOrEqualTo(two, three) // => false
BigDecimal.isGreaterThanOrEqualTo(three, three) // => true
BigDecimal.isGreaterThanOrEqualTo(four, three) // => true
```

## between

**Checking decimal ranges**

```efx
import { BigDecimal } from "effect"

const between = BigDecimal.between({
  minimum: BigDecimal.fromStringUnsafe("1"),
  maximum: BigDecimal.fromStringUnsafe("5")
})

between(BigDecimal.fromStringUnsafe("3")) // => true
between(BigDecimal.fromStringUnsafe("0")) // => false
between(BigDecimal.fromStringUnsafe("6")) // => false
```

## clamp

**Clamping decimals to a range**

```efx
import { BigDecimal } from "effect"

const clamp = BigDecimal.clamp({
  minimum: BigDecimal.fromStringUnsafe("1"),
  maximum: BigDecimal.fromStringUnsafe("5")
})

clamp(BigDecimal.fromStringUnsafe("3")) // => BigDecimal.fromBigInt(3n)
clamp(BigDecimal.fromStringUnsafe("0")) // => BigDecimal.fromBigInt(1n)
clamp(BigDecimal.fromStringUnsafe("6")) // => BigDecimal.fromBigInt(5n)
```

## min

**Selecting the smaller decimal**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.min(
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3")
) // => BigDecimal.fromBigInt(2n)
```

## max

**Selecting the larger decimal**

```efx
import { BigDecimal } from "effect"

const result = BigDecimal.max(
  BigDecimal.fromStringUnsafe("2"),
  BigDecimal.fromStringUnsafe("3")
) // => BigDecimal.fromBigInt(3n)
```

## sign

**Reading decimal signs**

```efx
import { BigDecimal } from "effect"

BigDecimal.sign(BigDecimal.fromStringUnsafe("-5")) // => -1
BigDecimal.sign(BigDecimal.fromStringUnsafe("0")) // => 0
BigDecimal.sign(BigDecimal.fromStringUnsafe("5")) // => 1
```

## abs

**Calculating absolute values**

```efx
import { BigDecimal } from "effect"

BigDecimal.abs(BigDecimal.fromStringUnsafe("-5")) // => BigDecimal.fromBigInt(5n)
BigDecimal.abs(BigDecimal.fromStringUnsafe("0")) // => BigDecimal.fromBigInt(0n)
BigDecimal.abs(BigDecimal.fromStringUnsafe("5")) // => BigDecimal.fromBigInt(5n)
```

## negate

**Negating decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.negate(BigDecimal.fromStringUnsafe("3")) // => BigDecimal.fromBigInt(-3n)
BigDecimal.negate(BigDecimal.fromStringUnsafe("-6")) // => BigDecimal.fromBigInt(6n)
```

## remainder

**Computing remainders safely**

```efx
import { BigDecimal, Option } from "effect"

const two = BigDecimal.fromStringUnsafe("2")
const three = BigDecimal.fromStringUnsafe("3")
const zero = BigDecimal.fromStringUnsafe("0")

BigDecimal.remainder(three, two) // => Option.some(BigDecimal.fromBigInt(1n))
BigDecimal.remainder(two, zero) // => Option.none()
```

## remainderUnsafe

**Computing remainders unsafely**

```efx
import { BigDecimal } from "effect"

BigDecimal.remainderUnsafe(
  BigDecimal.fromStringUnsafe("3"),
  BigDecimal.fromStringUnsafe("2")
) // => BigDecimal.fromBigInt(1n)
```

## Equivalence

**Checking decimal equivalence**

```efx
import { BigDecimal } from "effect"

const a = BigDecimal.fromStringUnsafe("1.50")
const b = BigDecimal.fromStringUnsafe("1.5")
const c = BigDecimal.fromStringUnsafe("2.0")

BigDecimal.Equivalence(a, b) // => true
BigDecimal.Equivalence(a, c) // => false
```

## equals

**Checking decimal equality**

```efx
import { BigDecimal } from "effect"

const a = BigDecimal.fromStringUnsafe("1.5")
const b = BigDecimal.fromStringUnsafe("1.50")
const c = BigDecimal.fromStringUnsafe("2.0")

BigDecimal.equals(a, b) // => true
BigDecimal.equals(a, c) // => false
```

## fromBigInt

**Creating decimals from bigint**

```efx
import { BigDecimal } from "effect"

const decimal = BigDecimal.fromBigInt(123n)
decimal // => BigDecimal.fromStringUnsafe("123")

const largeBigInt = BigDecimal.fromBigInt(9007199254740991n)
largeBigInt // => BigDecimal.fromStringUnsafe("9007199254740991")
```

## fromNumberUnsafe

**Creating decimals from finite numbers**

```efx
import { BigDecimal } from "effect"

BigDecimal.fromNumberUnsafe(123) // => BigDecimal.fromBigInt(123n)
BigDecimal.fromNumberUnsafe(123.456) // => BigDecimal.fromStringUnsafe("123.456")
```

## fromNumber

**Creating decimals from numbers safely**

```efx
import { BigDecimal, Option } from "effect"

BigDecimal.fromNumber(123.456) // => Option.some(BigDecimal.fromStringUnsafe("123.456"))
BigDecimal.fromNumber(Infinity) // => Option.none()
```

## fromString

**Parsing decimal strings safely**

```efx
import { BigDecimal, Option } from "effect"

BigDecimal.fromString("123.456") // => Option.some(BigDecimal.make(123456n, 3))
BigDecimal.fromString("123.abc") // => Option.none()
```

## fromStringUnsafe

**Parsing decimal strings unsafely**

```efx
import { BigDecimal } from "effect"

BigDecimal.fromStringUnsafe("123") // => BigDecimal.fromBigInt(123n)
BigDecimal.fromStringUnsafe("123.456") // => BigDecimal.make(123456n, 3)
```

## format

**Formatting decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.format(BigDecimal.fromStringUnsafe("-5")) // => "-5"
BigDecimal.format(BigDecimal.fromStringUnsafe("123.456")) // => "123.456"
BigDecimal.format(BigDecimal.fromStringUnsafe("-0.00000123")) // => "-0.00000123"
```

## toExponential

**Formatting decimals exponentially**

```efx
import { BigDecimal } from "effect"

BigDecimal.toExponential(BigDecimal.make(123456n, -5)) // => "1.23456e+10"
```

## toNumberUnsafe

**Converting decimals to numbers**

```efx
import { BigDecimal } from "effect"

BigDecimal.toNumberUnsafe(BigDecimal.fromStringUnsafe("123.456")) // => 123.456
```

## isInteger

**Checking integer decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.isInteger(BigDecimal.fromStringUnsafe("0")) // => true
BigDecimal.isInteger(BigDecimal.fromStringUnsafe("1")) // => true
BigDecimal.isInteger(BigDecimal.fromStringUnsafe("1.1")) // => false
```

## isZero

**Checking zero decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.isZero(BigDecimal.fromStringUnsafe("0")) // => true
BigDecimal.isZero(BigDecimal.fromStringUnsafe("1")) // => false
```

## isNegative

**Checking negative decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.isNegative(BigDecimal.fromStringUnsafe("-1")) // => true
BigDecimal.isNegative(BigDecimal.fromStringUnsafe("0")) // => false
BigDecimal.isNegative(BigDecimal.fromStringUnsafe("1")) // => false
```

## isPositive

**Checking positive decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.isPositive(BigDecimal.fromStringUnsafe("-1")) // => false
BigDecimal.isPositive(BigDecimal.fromStringUnsafe("0")) // => false
BigDecimal.isPositive(BigDecimal.fromStringUnsafe("1")) // => true
```

## round

**Rounding decimals**

```efx
import { BigDecimal } from "effect"

const positive = BigDecimal.round(BigDecimal.fromStringUnsafe("145"), { mode: "from-zero", scale: -1 })
positive // => BigDecimal.fromBigInt(150n)

const negative = BigDecimal.round(BigDecimal.fromStringUnsafe("-14.5"))
negative // => BigDecimal.fromBigInt(-15n)
```

## truncate

**Truncating decimals**

```efx
import { BigDecimal } from "effect"

BigDecimal.truncate(BigDecimal.fromStringUnsafe("145"), -1) // => BigDecimal.fromBigInt(140n)
BigDecimal.truncate(BigDecimal.fromStringUnsafe("-14.5")) // => BigDecimal.fromBigInt(-14n)
```

## ceil

**Rounding decimals up**

```efx
import { BigDecimal } from "effect"

BigDecimal.ceil(BigDecimal.fromStringUnsafe("145"), -1) // => BigDecimal.fromBigInt(150n)
BigDecimal.ceil(BigDecimal.fromStringUnsafe("-14.5")) // => BigDecimal.fromBigInt(-14n)
```

## floor

**Rounding decimals down**

```efx
import { BigDecimal } from "effect"

BigDecimal.floor(BigDecimal.fromStringUnsafe("145"), -1) // => BigDecimal.fromBigInt(140n)
BigDecimal.floor(BigDecimal.fromStringUnsafe("-14.5")) // => BigDecimal.fromBigInt(-15n)
```
