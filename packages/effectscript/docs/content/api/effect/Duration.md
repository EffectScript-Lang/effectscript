# effect/Duration

The examples in the JSDoc of `packages/effect/src/Duration.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## DurationObject

**Combining duration object fields**

```efx
import { Duration } from "effect"

Duration.fromInputUnsafe({ seconds: 30 }) // => Duration.seconds(30)
Duration.fromInputUnsafe({ days: 1 }) // => Duration.days(1)
Duration.fromInputUnsafe({ seconds: 1, nanoseconds: 500 }) // => Duration.nanos(1_000_000_500n)
```

## fromInputUnsafe

**Decoding duration inputs**

```efx
import { Duration } from "effect"

Duration.fromInputUnsafe(1000) // => Duration.millis(1000)
Duration.fromInputUnsafe("5 seconds") // => Duration.seconds(5)
Duration.fromInputUnsafe("Infinity") // => Duration.infinity
Duration.fromInputUnsafe([2, 500_000_000]) // => Duration.nanos(2_500_000_000n)
```

## fromInput

**Safely decoding duration inputs**

```efx
import { Duration, Option } from "effect"

Duration.fromInput(1000) // => Option.some(Duration.seconds(1))
Duration.fromInput("invalid" as any) // => Option.none()
```

## isDuration

**Checking for durations**

```efx
import { Duration } from "effect"

Duration.isDuration(Duration.seconds(1)) // => true
Duration.isDuration(1000) // => false
```

## isFinite

**Checking finite durations**

```efx
import { Duration } from "effect"

Duration.isFinite(Duration.seconds(5)) // => true
Duration.isFinite(Duration.infinity) // => false
```

## isZero

**Checking for zero durations**

```efx
import { Duration } from "effect"

Duration.isZero(Duration.zero) // => true
Duration.isZero(Duration.seconds(1)) // => false
```

## isNegative

**Checking for negative durations**

```efx
import { Duration } from "effect"

Duration.isNegative(Duration.seconds(-5)) // => true
Duration.isNegative(Duration.zero) // => false
Duration.isNegative(Duration.negativeInfinity) // => true
```

## isPositive

**Checking for positive durations**

```efx
import { Duration } from "effect"

Duration.isPositive(Duration.seconds(5)) // => true
Duration.isPositive(Duration.zero) // => false
Duration.isPositive(Duration.infinity) // => true
```

## abs

**Taking absolute duration values**

```efx
import { Duration } from "effect"

Duration.abs(Duration.seconds(-5)) // => Duration.seconds(5)
Duration.abs(Duration.negativeInfinity) // => Duration.infinity
```

## negate

**Negating durations**

```efx
import { Duration } from "effect"

Duration.negate(Duration.seconds(5)) // => Duration.seconds(-5)
Duration.negate(Duration.infinity) // => Duration.negativeInfinity
```

## zero

**Referencing the zero duration**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.zero) // => 0
```

## infinity

**Referencing infinite duration**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.infinity) // => Infinity
```

## negativeInfinity

**Referencing negative infinite duration**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.negativeInfinity) // => -Infinity
```

## nanos

**Creating durations from nanoseconds**

```efx
import { Duration } from "effect"

Duration.nanos(500_000_000n) // => Duration.nanos(500_000_000n)
```

## micros

**Creating durations from microseconds**

```efx
import { Duration } from "effect"

Duration.micros(500_000n) // => Duration.nanos(500_000_000n)
```

## millis

**Creating durations from milliseconds**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.millis(1000)) // => 1000
```

## seconds

**Creating durations from seconds**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.seconds(30)) // => 30_000
```

## minutes

**Creating durations from minutes**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.minutes(5)) // => 300_000
```

## hours

**Creating durations from hours**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.hours(2)) // => 7_200_000
```

## days

**Creating durations from days**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.days(1)) // => 86_400_000
```

## weeks

**Creating durations from weeks**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.weeks(1)) // => 604_800_000
```

## toMillis

**Converting durations to milliseconds**

```efx
import { Duration } from "effect"

Duration.toMillis(Duration.seconds(5)) // => 5000
Duration.toMillis(Duration.minutes(2)) // => 120_000
```

## toSeconds

**Converting durations to seconds**

```efx
import { Duration } from "effect"

Duration.toSeconds(Duration.millis(5000)) // => 5
Duration.toSeconds(Duration.minutes(2)) // => 120
```

## toMinutes

**Converting durations to minutes**

```efx
import { Duration } from "effect"

Duration.toMinutes(Duration.seconds(120)) // => 2
Duration.toMinutes(Duration.hours(1)) // => 60
```

## toHours

**Converting durations to hours**

```efx
import { Duration } from "effect"

Duration.toHours(Duration.minutes(120)) // => 2
Duration.toHours(Duration.days(1)) // => 24
```

## toDays

**Converting durations to days**

```efx
import { Duration } from "effect"

Duration.toDays(Duration.hours(48)) // => 2
Duration.toDays(Duration.weeks(1)) // => 7
```

## toWeeks

**Converting durations to weeks**

```efx
import { Duration } from "effect"

Duration.toWeeks(Duration.days(14)) // => 2
Duration.toWeeks(Duration.days(7)) // => 1
```

## toNanosUnsafe

**Reading nanoseconds unsafely**

```efx
import { Duration } from "effect"

Duration.toNanosUnsafe(Duration.seconds(2)) // => 2_000_000_000n

// Duration.toNanosUnsafe(Duration.infinity)
// throws Error: "Cannot convert infinite duration to nanos"
```

## toNanos

**Safely reading nanoseconds**

```efx
import { Duration, Option } from "effect"

Duration.toNanos(Duration.seconds(1)) // => Option.some(1_000_000_000n)
Duration.toNanos(Duration.infinity) // => Option.none()
```

## toHrTime

**Converting durations to high-resolution time**

```efx
import { Duration } from "effect"

Duration.toHrTime(Duration.millis(1500)) // => [1, 500_000_000]
```

## match

**Pattern matching on duration representations**

```efx
import { Duration } from "effect"

Duration.match(Duration.seconds(5), {
  onMillis: (millis) => `${millis} milliseconds`,
  onNanos: (nanos) => `${nanos} nanoseconds`,
  onInfinity: () => "infinite"
}) // => "5000 milliseconds"
```

## matchPair

**Pattern matching on duration pairs**

```efx
import { Duration } from "effect"

Duration.matchPair(Duration.seconds(3), Duration.seconds(2), {
  onMillis: (a, b) => a + b,
  onNanos: (a, b) => Number(a + b),
  onInfinity: () => Infinity
}) // => 5000
```

## Order

**Sorting durations**

```efx
import { Duration } from "effect"

const durations = [
  Duration.seconds(3),
  Duration.seconds(1),
  Duration.seconds(2)
]
durations.sort((a, b) => Duration.Order(a, b)).map(Duration.toSeconds) // => [1, 2, 3]
```

## between

**Checking duration ranges**

```efx
import { Duration } from "effect"

Duration.between(Duration.seconds(3), {
  minimum: Duration.seconds(2),
  maximum: Duration.seconds(5)
}) // => true
```

## Equivalence

**Comparing durations for equivalence**

```efx
import { Duration } from "effect"

Duration.Equivalence(Duration.seconds(5), Duration.millis(5000)) // => true
```

## min

**Selecting the shorter duration**

```efx
import { Duration } from "effect"

Duration.min(Duration.seconds(5), Duration.seconds(3)) // => Duration.seconds(3)
```

## max

**Selecting the longer duration**

```efx
import { Duration } from "effect"

Duration.max(Duration.seconds(5), Duration.seconds(3)) // => Duration.seconds(5)
```

## clamp

**Clamping durations to a range**

```efx
import { Duration } from "effect"

Duration.clamp(Duration.seconds(10), {
  minimum: Duration.seconds(2),
  maximum: Duration.seconds(5)
}) // => Duration.seconds(5)
```

## divide

**Safely dividing durations**

```efx
import { Duration, Option } from "effect"

Duration.divide(Duration.seconds(10), 2) // => Option.some(Duration.seconds(5))
Duration.divide(Duration.seconds(10), 0) // => Option.none()
```

## divideUnsafe

**Dividing durations unsafely**

```efx
import { Duration } from "effect"

Duration.divideUnsafe(Duration.seconds(10), 2) // => Duration.seconds(5)
Duration.divideUnsafe(Duration.seconds(10), 0) // => Duration.infinity
```

## times

**Multiplying durations**

```efx
import { Duration } from "effect"

Duration.times(Duration.seconds(5), 2) // => Duration.seconds(10)
```

## subtract

**Subtracting durations**

```efx
import { Duration } from "effect"

Duration.subtract(Duration.seconds(10), Duration.seconds(3)) // => Duration.seconds(7)
```

## sum

**Adding durations**

```efx
import { Duration } from "effect"

Duration.sum(Duration.seconds(5), Duration.seconds(3)) // => Duration.seconds(8)
```

## isLessThan

**Comparing durations with less than**

```efx
import { Duration } from "effect"

Duration.isLessThan(Duration.seconds(3), Duration.seconds(5)) // => true
```

## isLessThanOrEqualTo

**Comparing durations with less than or equal**

```efx
import { Duration } from "effect"

Duration.isLessThanOrEqualTo(
  Duration.seconds(5),
  Duration.seconds(5)
) // => true
```

## isGreaterThan

**Comparing durations with greater than**

```efx
import { Duration } from "effect"

Duration.isGreaterThan(Duration.seconds(5), Duration.seconds(3)) // => true
```

## isGreaterThanOrEqualTo

**Comparing durations with greater than or equal**

```efx
import { Duration } from "effect"

Duration.isGreaterThanOrEqualTo(
  Duration.seconds(5),
  Duration.seconds(5)
) // => true
```

## equals

**Checking duration equality**

```efx
import { Duration } from "effect"

Duration.equals(Duration.seconds(5), Duration.millis(5000)) // => true
```

## parts

**Decomposing durations into parts**

```efx
import { Duration } from "effect"

// Create a complex duration by adding multiple parts
const duration = Duration.sum(
  Duration.sum(
    Duration.sum(Duration.days(1), Duration.hours(2)),
    Duration.sum(Duration.minutes(30), Duration.seconds(45))
  ),
  Duration.millis(123)
)
Duration.parts(duration) // => ({ days: 1, hours: 2, minutes: 30, seconds: 45, millis: 123, nanos: 0 })

const complex = Duration.sum(Duration.hours(25), Duration.minutes(90))
Duration.parts(complex) // => ({ days: 1, hours: 2, minutes: 30, seconds: 0, millis: 0, nanos: 0 })
```

## format

**Formatting durations**

```efx
import { Duration } from "effect"

Duration.format(Duration.millis(1000)) // => "1s"
Duration.format(Duration.millis(1001)) // => "1s 1ms"
```
