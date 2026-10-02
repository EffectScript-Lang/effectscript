# effect/Cron

The examples in the JSDoc of `packages/effect/src/Cron.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Cron

**Creating a cron schedule**

```efx
import { Cron, DateTime } from "effect"

// Create a cron that runs at 9 AM on weekdays
const weekdayMorning = Cron.make({
  minutes: [0],
  hours: [9],
  days: [],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5], // Monday to Friday
  tz: DateTime.zoneMakeNamedUnsafe("UTC")
})

// Check if a date matches the schedule
Cron.match(weekdayMorning, "2023-06-05T09:00:00Z") // => true
```

## isCron

**Checking cron values**

```efx
import { Cron } from "effect"

const cron = Cron.make({
  minutes: [0],
  hours: [9],
  days: [1, 15],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5]
})

Cron.isCron(cron) // => true
Cron.isCron({}) // => false
Cron.isCron("not a cron") // => false
```

## make

**Creating schedules from constraints**

```efx
import { Cron, DateTime } from "effect"

const utc = DateTime.zoneMakeNamedUnsafe("UTC")

// Every day at midnight
const midnight = Cron.make({
  minutes: [0],
  hours: [0],
  days: [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31
  ],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  tz: utc
})

// Every 15 minutes during business hours on weekdays
const businessHours = Cron.make({
  minutes: [0, 15, 30, 45],
  hours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
  days: [],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5], // Monday to Friday
  tz: utc
})

Cron.match(midnight, "2024-01-01T00:00:00Z") // => true
Cron.match(businessHours, "2024-01-01T09:15:00Z") // => true
```

## CronParseError

**Handling cron parse failures**

```efx
import { Cron, Result } from "effect"

const expected = Result.fail(new Cron.CronParseError({
  message: "Invalid number of segments in cron expression",
  input: "invalid expression"
}))

Cron.parse("invalid expression") // => expected
```

## isCronParseError

**Checking cron parse errors**

```efx
import { Cron, Result } from "effect"

Result.mapError(Cron.parse("invalid cron expression"), Cron.isCronParseError) // => Result.fail(true)
Cron.isCronParseError(new Error("regular error")) // => false
Cron.isCronParseError("not an error") // => false
```

## parse

**Parsing cron expressions**

```efx
import { Cron, Result } from "effect"

// At 04:00 on every day-of-month from 8 through 14.
const cron = Result.getOrThrow(Cron.parse("0 0 4 8-14 * *"))

Array.from(cron.hours) // => [4]
Array.from(cron.days) // => [8, 9, 10, 11, 12, 13, 14]
```

## parseUnsafe

**Parsing cron expressions unsafely**

```efx
import { Cron } from "effect"

// At 04:00 on every day-of-month from 8 through 14
const cron = Cron.parseUnsafe("0 0 4 8-14 * *", "UTC")

// With timezone
const cronWithTz = Cron.parseUnsafe("0 0 9 * * *", "America/New_York")

// This would throw an error
// const invalid = Cron.parseUnsafe("invalid expression")
Cron.match(cron, "2024-01-10T04:00:00Z") // => true
Cron.match(cronWithTz, "2024-01-01T14:00:00Z") // => true
```

## format

**Formatting a cron expression**

```efx
import { Cron } from "effect"

const cron = Cron.parseUnsafe("23 0-20/2 * * 0", "UTC")

Cron.format(cron) // => "23 0-20/2 * * 0"
Cron.format(cron, { includeSeconds: true }) // => "0 23 0-20/2 * * 0"
```

## match

**Matching dates against a schedule**

```efx
import { Cron, Result } from "effect"

const cron = Result.getOrThrow(Cron.parse("0 0 4 8-14 * *", "UTC"))

// Check if specific dates match
Cron.match(cron, "2021-01-08T04:00:00Z") // => true
Cron.match(cron, "2021-01-08T05:00:00Z") // => false
Cron.match(cron, "2021-01-07T04:00:00Z") // => false
```

## next

**Finding the next occurrence**

```efx
import { Cron, Result } from "effect"

const cron = Result.getOrThrow(Cron.parse("0 0 4 8-14 * *", "UTC"))

// Get next run after a specific date
Cron.next(cron, "2021-01-01T00:00:00Z").toISOString() // => "2021-01-08T04:00:00.000Z"
```

## sequence

**Iterating scheduled occurrences**

```efx
import { Cron, Result } from "effect"

const cron = Result.getOrThrow(Cron.parse("0 0 9 * * 1-5", "UTC")) // 9 AM weekdays

// Get first 5 occurrences
const iterator = Cron.sequence(cron, "2023-01-01T00:00:00Z")
const next5 = Array.from({ length: 5 }, () => iterator.next().value.toISOString())
const expected = [
  "2023-01-02T09:00:00.000Z",
  "2023-01-03T09:00:00.000Z",
  "2023-01-04T09:00:00.000Z",
  "2023-01-05T09:00:00.000Z",
  "2023-01-06T09:00:00.000Z"
]

next5 // => expected
```

## Equivalence

**Comparing schedules with equivalence**

```efx
import { Cron } from "effect"

const cron1 = Cron.make({
  minutes: [0, 30],
  hours: [9],
  days: [1, 15],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5]
})

const cron2 = Cron.make({
  minutes: [30, 0], // Different order
  hours: [9],
  days: [15, 1], // Different order
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5]
})

Cron.Equivalence(cron1, cron2) // => true
```

## equals

**Checking schedule equality**

```efx
import { Cron } from "effect"

const cron1 = Cron.make({
  minutes: [0],
  hours: [9],
  days: [1, 15],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5]
})

const cron2 = Cron.make({
  minutes: [0],
  hours: [9],
  days: [1, 15],
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  weekdays: [1, 2, 3, 4, 5]
})

Cron.equals(cron1, cron2) // => true
Cron.equals(cron1)(cron2) // => true
```
