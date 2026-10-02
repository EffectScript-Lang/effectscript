# effect/DateTime

The examples in the JSDoc of `packages/effect/src/DateTime.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Disambiguation

**Resolving ambiguous local times**

```efx
import { DateTime, Option } from "effect"

// Fall-back example: 01:30 on Nov 2, 2025 in New York happens twice
const ambiguousTime = { year: 2025, month: 11, day: 2, hour: 1, minute: 30 }
const timeZone = DateTime.zoneMakeNamedUnsafe("America/New_York")

const earlier = DateTime.makeZoned(ambiguousTime, {
  timeZone,
  adjustForTimeZone: true,
  disambiguation: "earlier"
})
// Earlier occurrence (DST time): 2025-11-02T05:30:00.000Z

const later = DateTime.makeZoned(ambiguousTime, {
  timeZone,
  adjustForTimeZone: true,
  disambiguation: "later"
})
// Later occurrence (standard time): 2025-11-02T06:30:00.000Z

// Gap example: 02:30 on Mar 9, 2025 in New York doesn't exist
const gapTime = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 }

const beforeGap = DateTime.makeZoned(gapTime, {
  timeZone,
  adjustForTimeZone: true,
  disambiguation: "earlier"
})
// Time before gap: 2025-03-09T06:30:00.000Z (01:30 EST)

const afterGap = DateTime.makeZoned(gapTime, {
  timeZone,
  adjustForTimeZone: true,
  disambiguation: "later"
})
// Time after gap: 2025-03-09T07:30:00.000Z (03:30 EDT)

earlier.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-11-02T05:30:00.000Z"
later.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-11-02T06:30:00.000Z"
beforeGap.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-03-09T06:30:00.000Z"
afterGap.pipe(Option.getOrThrow, DateTime.formatIso) // => "2025-03-09T07:30:00.000Z"
```

## Equivalence

**Comparing DateTime values for equivalence**

```efx
import { DateTime } from "effect"

const utc = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: "Europe/London"
})

DateTime.Equivalence(utc, zoned) // => true
```

## Order

**Sorting DateTime values chronologically**

```efx
import { Array, DateTime } from "effect"

const dates = [
  DateTime.makeUnsafe("2024-03-01"),
  DateTime.makeUnsafe("2024-01-01"),
  DateTime.makeUnsafe("2024-02-01")
]

Array.sort(dates, DateTime.Order).map(DateTime.formatIsoDateUtc) // => ["2024-01-01", "2024-02-01", "2024-03-01"]
```

## clamp

**Clamping DateTime values**

```efx
import { DateTime } from "effect"

const min = DateTime.makeUnsafe("2024-01-01")
const max = DateTime.makeUnsafe("2024-12-31")
const date = DateTime.makeUnsafe("2025-06-15")

DateTime.clamp(date, { minimum: min, maximum: max }) // => DateTime.makeUnsafe("2024-12-31")
```

## fromDateUnsafe

**Creating DateTime values from Dates**

```efx
import { DateTime } from "effect"

DateTime.fromDateUnsafe(new Date("2024-01-01T12:00:00Z")) // => DateTime.makeUnsafe("2024-01-01T12:00:00Z")
```

## makeUnsafe

**Creating DateTime values unsafely**

```efx
import { DateTime } from "effect"

// from Date
DateTime.makeUnsafe(new Date("2024-01-01T12:00:00Z")) // => DateTime.makeUnsafe("2024-01-01T12:00:00Z")

// from parts
DateTime.makeUnsafe({ year: 2024 }) // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")

// from string
DateTime.makeUnsafe("2024-01-01") // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
```

## fromEpochSeconds

**Creating from epoch seconds**

```efx
import { DateTime } from "effect"

DateTime.fromEpochSeconds(1704067200).toJSON() // => "2024-01-01T00:00:00.000Z"
```

## makeZonedUnsafe

**Creating zoned DateTime values unsafely**

```efx
import { DateTime } from "effect"

const zoned = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
  timeZone: "Europe/London"
})

DateTime.formatIsoZoned(zoned) // => "2024-06-15T15:30:00.000+01:00[Europe/London]"
```

## makeZoned

**Creating optional zoned DateTime values**

```efx
import { DateTime, Option } from "effect"

const result = DateTime.makeZoned("2024-06-15T14:30:00Z", {
  timeZone: "Europe/London"
})

result.pipe(Option.map(DateTime.formatIsoZoned)) // => Option.some("2024-06-15T15:30:00.000+01:00[Europe/London]")
```

## make

**Creating optional DateTime values**

```efx
import { DateTime, Option } from "effect"

// from Date
DateTime.make(new Date("2024-01-01T12:00:00Z")) // => Option.some(DateTime.makeUnsafe("2024-01-01T12:00:00Z"))

// from parts
DateTime.make({ year: 2024 }) // => Option.some(DateTime.makeUnsafe("2024-01-01T00:00:00Z"))

// from string
DateTime.make("2024-01-01") // => Option.some(DateTime.makeUnsafe("2024-01-01T00:00:00Z"))

DateTime.make("not a date") // => Option.none()
```

## makeZonedFromString

**Parsing zoned DateTime strings**

```efx
import { DateTime, Option } from "effect"

DateTime.makeZonedFromString(
  "2024-01-01T12:00:00+02:00[Europe/Berlin]"
).pipe(Option.map(DateTime.formatIsoZoned)) // => Option.some("2024-01-01T11:00:00.000+01:00[Europe/Berlin]")

DateTime.makeZonedFromString("2024-01-01T12:00:00Z") // => Option.none()
DateTime.makeZonedFromString("invalid") // => Option.none()
```

## now

**Getting the current DateTime**

```efx
import { TestClock } from "effect/testing"

await runPromise(map(DateTime.now, DateTime.isDateTime)) // => true
```

## nowAsDate

**Getting the current Date**

```efx
import { TestClock } from "effect/testing"

await runPromise(map(DateTime.nowAsDate, (now) => now instanceof Date)) // => true
```

## nowUnsafe

**Getting the current DateTime unsafely**

```efx
import { DateTime } from "effect"

Number.isFinite(DateTime.toEpochMillis(DateTime.nowUnsafe())) // => true
```

## toUtc

**Converting DateTime values to UTC**

```efx
import { DateTime } from "effect"

const now = DateTime.makeZonedUnsafe({ year: 2024 }, {
  timeZone: "Europe/London"
})

// set as UTC
const utc: DateTime.Utc = DateTime.toUtc(now)
utc // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
```

## setZone

**Setting time zones**

```efx
import { DateTime } from "effect"

const zone = DateTime.zoneMakeNamedUnsafe("Europe/London")
const zoned: DateTime.Zoned = DateTime.setZone(DateTime.makeUnsafe("2024-01-01"), zone)

DateTime.isZoned(zoned) // => true
```

## setZoneOffset

**Setting fixed-offset time zones**

```efx
import { DateTime } from "effect"

const dateTime = DateTime.makeUnsafe("2024-01-01")
const zoned: DateTime.Zoned = DateTime.setZoneOffset(dateTime, 3 * 60 * 60 * 1000)

DateTime.zoneToString(zoned.zone) // => "+03:00"
```

## zoneMakeNamedUnsafe

**Creating named time zones unsafely**

```efx
import { DateTime } from "effect"

DateTime.zoneToString(DateTime.zoneMakeNamedUnsafe("Europe/London")) // => "Europe/London"
DateTime.zoneToString(DateTime.zoneMakeNamedUnsafe("Asia/Tokyo")) // => "Asia/Tokyo"

// This would throw an IllegalArgumentError:
// DateTime.zoneMakeNamedUnsafe("Invalid/Zone")
```

## zoneMakeOffset

**Creating fixed-offset time zones**

```efx
import { DateTime } from "effect"

// Create a time zone with +3 hours offset
const zone = DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)

const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: zone
})
DateTime.formatIsoZoned(dt) // => "2024-01-01T15:00:00.000+03:00"
```

## zoneMakeNamed

**Creating optional named time zones**

```efx
import { DateTime, Option } from "effect"

DateTime.zoneMakeNamed("Europe/London").pipe(Option.map(DateTime.zoneToString)) // => Option.some("Europe/London")
DateTime.zoneMakeNamed("Invalid/Zone") // => Option.none()
```

## zoneMakeNamedEffect

**Creating named time zones effectfully**

```efx

const program = effect {
  const zone = await DateTime.zoneMakeNamedEffect("Europe/London")
  const now = await DateTime.now
  return DateTime.setZone(now, zone)
}

DateTime.zoneToString((await runPromise(program)).zone) // => "Europe/London"
```

## zoneMakeLocal

**Creating local time zones**

```efx
import { DateTime } from "effect"

DateTime.isTimeZoneNamed(DateTime.zoneMakeLocal()) // => true
```

## zoneFromString

**Parsing time zones**

```efx
import { DateTime, Option } from "effect"

DateTime.zoneFromString("Europe/London").pipe(Option.map(DateTime.zoneToString)) // => Option.some("Europe/London")
DateTime.zoneFromString("+03:00").pipe(Option.map(DateTime.zoneToString)) // => Option.some("+03:00")
DateTime.zoneFromString("invalid") // => Option.none()
```

## zoneToString

**Formatting time zones**

```efx
import { DateTime } from "effect"

DateTime.zoneToString(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)) // => "+03:00"
DateTime.zoneToString(DateTime.zoneMakeNamedUnsafe("Europe/London")) // => "Europe/London"
```

## setZoneNamed

**Setting named time zones safely**

```efx
import { DateTime, Option } from "effect"

const dateTime = DateTime.makeUnsafe("2024-01-01")
const result = DateTime.setZoneNamed(dateTime, "Europe/London").pipe(Option.map(DateTime.formatIsoZoned))

result // => Option.some("2024-01-01T00:00:00.000+00:00[Europe/London]")
```

## setZoneNamedUnsafe

**Setting named time zones unsafely**

```efx
import { DateTime } from "effect"

const dateTime = DateTime.makeUnsafe("2024-01-01")
const zoned = DateTime.setZoneNamedUnsafe(dateTime, "Europe/London")

DateTime.zoneToString(zoned.zone) // => "Europe/London"
```

## distance

**Measuring distance between DateTime values**

```efx
import { DateTime, Duration } from "effect"

const start = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
const end = DateTime.add(start, { minutes: 1 })

DateTime.distance(start, end) // => Duration.minutes(1)
```

## min

**Selecting the earlier DateTime**

```efx
import { DateTime } from "effect"

const date1 = DateTime.makeUnsafe("2024-01-01")
const date2 = DateTime.makeUnsafe("2024-02-01")

DateTime.min(date1, date2) // => DateTime.makeUnsafe("2024-01-01")
```

## max

**Selecting the later DateTime**

```efx
import { DateTime } from "effect"

const date1 = DateTime.makeUnsafe("2024-01-01")
const date2 = DateTime.makeUnsafe("2024-02-01")

DateTime.max(date1, date2) // => DateTime.makeUnsafe("2024-02-01")
```

## isGreaterThan

**Checking whether a DateTime is later**

```efx
import { DateTime } from "effect"

const date1 = DateTime.makeUnsafe("2024-02-01")
const date2 = DateTime.makeUnsafe("2024-01-01")

DateTime.isGreaterThan(date1, date2) // => true
DateTime.isGreaterThan(date2, date1) // => false
```

## isGreaterThanOrEqualTo

**Checking whether a DateTime is later or equal**

```efx
import { DateTime } from "effect"

const date1 = DateTime.makeUnsafe("2024-01-01")
const date2 = DateTime.makeUnsafe("2024-01-01")
const date3 = DateTime.makeUnsafe("2024-02-01")

DateTime.isGreaterThanOrEqualTo(date1, date2) // => true
DateTime.isGreaterThanOrEqualTo(date3, date1) // => true
DateTime.isGreaterThanOrEqualTo(date1, date3) // => false
```

## isLessThan

**Checking whether a DateTime is earlier**

```efx
import { DateTime } from "effect"

const date1 = DateTime.makeUnsafe("2024-01-01")
const date2 = DateTime.makeUnsafe("2024-02-01")

DateTime.isLessThan(date1, date2) // => true
DateTime.isLessThan(date2, date1) // => false
```

## isLessThanOrEqualTo

**Checking whether a DateTime is earlier or equal**

```efx
import { DateTime } from "effect"

const date1 = DateTime.makeUnsafe("2024-01-01")
const date2 = DateTime.makeUnsafe("2024-01-01")
const date3 = DateTime.makeUnsafe("2024-02-01")

DateTime.isLessThanOrEqualTo(date1, date2) // => true
DateTime.isLessThanOrEqualTo(date1, date3) // => true
DateTime.isLessThanOrEqualTo(date3, date1) // => false
```

## between

**Checking whether a DateTime is within bounds**

```efx
import { DateTime } from "effect"

const min = DateTime.makeUnsafe("2024-01-01")
const max = DateTime.makeUnsafe("2024-12-31")
const date = DateTime.makeUnsafe("2024-06-15")

DateTime.between(date, { minimum: min, maximum: max }) // => true
```

## isFuture

**Checking future DateTime values effectfully**

```efx

const futureDate = DateTime.makeUnsafe(1)
await runPromise(provide(DateTime.isFuture(futureDate), TestClock.layer())) // => true
```

## isFutureUnsafe

**Checking future DateTime values unsafely**

```efx
import { DateTime } from "effect"

const oneHourFromNow = DateTime.add(DateTime.nowUnsafe(), { hours: 1 })
DateTime.isFutureUnsafe(oneHourFromNow)
```

## isPast

**Checking past DateTime values effectfully**

```efx

const pastDate = DateTime.makeUnsafe(-1)
await runPromise(provide(DateTime.isPast(pastDate), TestClock.layer())) // => true
```

## isPastUnsafe

**Checking past DateTime values unsafely**

```efx
import { DateTime } from "effect"

const oneHourAgo = DateTime.subtract(DateTime.nowUnsafe(), { hours: 1 })
DateTime.isPastUnsafe(oneHourAgo)
```

## toDateUtc

**Converting DateTime values to UTC Dates**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: "Europe/London"
})

DateTime.toDateUtc(dt).toISOString() // => "2024-01-01T12:00:00.000Z"
```

## toDate

**Converting DateTime values to Dates**

```efx
import { DateTime } from "effect"

const utc = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: "Europe/London"
})

DateTime.toDate(utc).toISOString() // => "2024-01-01T12:00:00.000Z"
DateTime.toDate(zoned).toISOString() // => "2024-01-01T12:00:00.000Z"
```

## zonedOffset

**Reading zoned offsets**

```efx
import { DateTime } from "effect"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: "Europe/London"
})

DateTime.zonedOffset(zoned) // => 0
```

## zonedOffsetIso

**Formatting zoned offsets**

```efx
import { DateTime } from "effect"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000) // +3 hours
})

DateTime.zonedOffsetIso(zoned) // => "+03:00"
```

## toEpochMillis

**Reading epoch milliseconds**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
DateTime.toEpochMillis(dt) // => 1704067200000
```

## toEpochSeconds

**Reading epoch seconds**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T00:00:00Z")
DateTime.toEpochSeconds(dt) // => 1704067200
```

## removeTime

**Removing time components**

```efx
import { DateTime } from "effect"

// returns "2024-01-01T00:00:00Z"
DateTime.makeZonedUnsafe("2024-01-01T05:00:00Z", {
  timeZone: "Pacific/Auckland",
  adjustForTimeZone: true
}).pipe(
  DateTime.removeTime,
  DateTime.formatIso
) // => "2024-01-01T00:00:00.000Z"
```

## toParts

**Reading DateTime parts**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T12:30:45.123Z")
const parts = DateTime.toParts(dt)

const selectedParts = [parts.year, parts.month, parts.day, parts.hour] // => [2024, 1, 1, 12]
```

## toPartsUtc

**Reading UTC DateTime parts**

```efx
import { DateTime } from "effect"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:30:45.123Z", {
  timeZone: "Europe/London"
})
const parts = DateTime.toPartsUtc(zoned)

const selectedParts = [parts.year, parts.month, parts.day, parts.hour] // => [2024, 1, 1, 12]
```

## getPartUtc

**Reading UTC DateTime parts by key**

```efx
import { DateTime } from "effect"

const dateTime = DateTime.makeUnsafe({ year: 2024 })
DateTime.getPartUtc(dateTime, "year") // => 2024
```

## getPart

**Reading DateTime parts by key**

```efx
import { DateTime } from "effect"

const dateTime = DateTime.makeZonedUnsafe({ year: 2024 }, {
  timeZone: "Europe/London"
})
DateTime.getPart(dateTime, "year") // => 2024
```

## setParts

**Updating DateTime parts**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", { timeZone: "UTC" })
const updated = DateTime.setParts(dt, {
  year: 2025,
  month: 6,
  day: 15
})

updated // => DateTime.makeZonedUnsafe("2025-06-15T12:00:00Z", { timeZone: "UTC" })
```

## setPartsUtc

**Updating UTC DateTime parts**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
const updated = DateTime.setPartsUtc(dt, {
  year: 2025,
  hour: 18
})

updated // => DateTime.makeUnsafe("2025-01-01T18:00:00Z")
```

## CurrentTimeZone

**Accessing the current time zone service**

```efx

const program = effect {
  return DateTime.zoneToString(await DateTime.CurrentTimeZone)
}

// Provide a time zone
const layer = DateTime.layerCurrentZoneNamed("Europe/London")
await runPromise(provide(program, layer)) // => "Europe/London"
```

## setZoneCurrent

**Setting the current time zone**

```efx

await runPromise(effect {
  const zoned = await DateTime.setZoneCurrent(DateTime.makeUnsafe("2024-01-01"))
  return DateTime.zoneToString(zoned.zone)
}.pipe(DateTime.withCurrentZoneNamed("Europe/London"))) // => "Europe/London"
```

## withCurrentZone

**Providing the current time zone**

```efx

const zone = DateTime.zoneMakeNamedUnsafe("Europe/London")

await runPromise(effect {
  const zoned = await DateTime.setZoneCurrent(DateTime.makeUnsafe("2024-01-01"))
  return DateTime.zoneToString(zoned.zone)
}.pipe(DateTime.withCurrentZone(zone))) // => "Europe/London"
```

## withCurrentZoneLocal

**Providing the local time zone**

```efx

await runPromise(effect {
  return DateTime.isZoned(await DateTime.nowInCurrentZone)
}.pipe(DateTime.withCurrentZoneLocal)) // => true
```

## withCurrentZoneOffset

**Providing a fixed-offset time zone**

```efx

const program = effect {
  return DateTime.zoneToString(await DateTime.CurrentTimeZone)
} |> DateTime.withCurrentZoneOffset(3 * 60 * 60 * 1000)

await runPromise(program) // => "+03:00"
```

## withCurrentZoneNamed

**Providing a named time zone**

```efx

await runPromise(effect {
  const zoned = await DateTime.setZoneCurrent(DateTime.makeUnsafe("2024-01-01"))
  return DateTime.zoneToString(zoned.zone)
}.pipe(DateTime.withCurrentZoneNamed("Europe/London"))) // => "Europe/London"
```

## nowInCurrentZone

**Getting the current time in the current zone**

```efx

await runPromise(effect {
  return DateTime.zoneToString((await DateTime.nowInCurrentZone).zone)
}.pipe(DateTime.withCurrentZoneNamed("Europe/London"))) // => "Europe/London"
```

## mutate

**Mutating DateTime values with Dates**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T12:00:00Z")

DateTime.mutate(dt, (date) => {
  date.setHours(15) // Set to 3 PM
  date.setMinutes(30) // Set to 30 minutes
})
```

## mutateUtc

**Mutating DateTime values with UTC Dates**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: "Europe/London"
})

const modified = DateTime.mutateUtc(dt, (date) => {
  date.setUTCHours(18) // Set UTC time to 6 PM
})

modified // => DateTime.makeZonedUnsafe("2024-01-01T18:00:00Z", { timeZone: "Europe/London" })
```

## mapEpochMillis

**Mapping epoch milliseconds**

```efx
import { DateTime } from "effect"

// add 10 milliseconds
const result = DateTime.makeUnsafe(0).pipe(
  DateTime.mapEpochMillis((millis) => millis + 10)
)
result // => DateTime.makeUnsafe(10)
```

## withDate

**Applying time zone adjusted Dates**

```efx
import { DateTime } from "effect"

// get the time zone adjusted date in milliseconds
DateTime.makeZonedUnsafe(0, { timeZone: "Europe/London" }).pipe(
  DateTime.withDate((date) => date.getTime())
) // => 3600000
```

## withDateUtc

**Applying UTC Dates**

```efx
import { DateTime } from "effect"

// get the date in milliseconds
DateTime.makeUnsafe(0).pipe(
  DateTime.withDateUtc((date) => date.getTime())
) // => 0
```

## match

**Pattern matching DateTime variants**

```efx
import { DateTime } from "effect"

const dt1 = DateTime.makeUnsafe("2024-01-01T12:00:00Z") // Utc
const dt2 = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
  timeZone: "Europe/London"
}) // Zoned

const result1 = DateTime.match(dt1, {
  onUtc: (utc) => `UTC: ${DateTime.formatIso(utc)}`,
  onZoned: (zoned) => `Zoned: ${DateTime.formatIsoZoned(zoned)}`
})

const result2 = DateTime.match(dt2, {
  onUtc: (utc) => `UTC: ${DateTime.formatIso(utc)}`,
  onZoned: (zoned) => `Zoned: ${DateTime.formatIsoZoned(zoned)}`
})

result1 // => "UTC: 2024-01-01T12:00:00.000Z"
result2 // => "Zoned: 2024-06-15T15:30:00.000+01:00[Europe/London]"
```

## addDuration

**Adding durations**

```efx
import { DateTime } from "effect"

// add 5 minutes
DateTime.makeUnsafe(0).pipe(
  DateTime.addDuration("5 minutes")
) // => DateTime.makeUnsafe(300000)
```

## subtractDuration

**Subtracting durations**

```efx
import { DateTime } from "effect"

// subtract 5 minutes
DateTime.makeUnsafe(0).pipe(
  DateTime.subtractDuration("5 minutes")
) // => DateTime.makeUnsafe(-300000)
```

## add

**Adding date and time parts**

```efx
import { DateTime } from "effect"

// add 5 minutes
DateTime.makeUnsafe(0).pipe(
  DateTime.add({ minutes: 5 })
) // => DateTime.makeUnsafe(300000)
```

## subtract

**Subtracting date and time parts**

```efx
import { DateTime } from "effect"

// subtract 5 minutes
DateTime.makeUnsafe(0).pipe(
  DateTime.subtract({ minutes: 5 })
) // => DateTime.makeUnsafe(-300000)
```

## startOf

**Rounding down DateTime values**

```efx
import { DateTime } from "effect"

// returns "2024-01-01T00:00:00Z"
DateTime.makeUnsafe("2024-01-01T12:00:00Z").pipe(
  DateTime.startOf("day"),
) // => DateTime.makeUnsafe("2024-01-01T00:00:00Z")
```

## endOf

**Rounding up DateTime values**

```efx
import { DateTime } from "effect"

// returns "2024-01-01T23:59:59.999Z"
DateTime.makeUnsafe("2024-01-01T12:00:00Z").pipe(
  DateTime.endOf("day"),
) // => DateTime.makeUnsafe("2024-01-01T23:59:59.999Z")
```

## nearest

**Rounding DateTime values to nearest units**

```efx
import { DateTime } from "effect"

// returns "2024-01-02T00:00:00Z"
DateTime.makeUnsafe("2024-01-01T12:01:00Z").pipe(
  DateTime.nearest("day"),
) // => DateTime.makeUnsafe("2024-01-02T00:00:00Z")
```

## format

**Formatting DateTime values with Intl options**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
  timeZone: "Europe/London"
})

DateTime.format(dt, {
  dateStyle: "full",
  timeStyle: "short",
  locale: "en-US"
}) // => "Saturday, June 15, 2024 at 3:30 PM"
```

## formatLocal

**Formatting DateTime values locally**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-06-15T14:30:00Z")

// Uses system local time zone and locale
DateTime.formatLocal(dt, {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
})
```

## formatUtc

**Formatting DateTime values in UTC**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeZonedUnsafe("2024-06-15T14:30:00Z", {
  timeZone: "Europe/London"
})

// Force UTC formatting regardless of time zone
DateTime.formatUtc(dt, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short"
})
```

## formatIntl

**Formatting DateTime values with custom formatters**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-06-15T14:30:00Z")

// Create a custom formatter
const formatter = new Intl.DateTimeFormat("de-DE", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin"
})

DateTime.formatIntl(dt, formatter).length > 0 // => true
```

## formatIso

**Formatting DateTime values as ISO strings**

```efx
import { DateTime } from "effect"

DateTime.formatIso(DateTime.makeUnsafe("2024-01-01T12:30:45.123Z")) // => "2024-01-01T12:30:45.123Z"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:30:45.123Z", {
  timeZone: "Europe/London"
})
DateTime.formatIso(zoned) // => "2024-01-01T12:30:45.123Z"
```

## formatIsoDate

**Formatting DateTime values as ISO dates**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T23:30:00Z")
DateTime.formatIsoDate(dt) // => "2024-01-01"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T23:30:00Z", {
  timeZone: "Pacific/Auckland" // UTC+12/13
})
DateTime.formatIsoDate(zoned) // => "2024-01-02"
```

## formatIsoDateUtc

**Formatting DateTime values as UTC ISO dates**

```efx
import { DateTime } from "effect"

const dt = DateTime.makeUnsafe("2024-01-01T23:30:00Z")
DateTime.formatIsoDateUtc(dt) // => "2024-01-01"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T23:30:00Z", {
  timeZone: "Pacific/Auckland"
})
DateTime.formatIsoDateUtc(zoned) // => "2024-01-01"
```

## formatIsoOffset

**Formatting DateTime values with offsets**

```efx
import { DateTime } from "effect"

const utc = DateTime.makeUnsafe("2024-01-01T12:00:00Z")
DateTime.formatIsoOffset(utc) // => "2024-01-01T12:00:00.000Z"

const zoned = DateTime.makeZonedUnsafe("2024-01-01T12:00:00Z", {
  timeZone: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)
})
DateTime.formatIsoOffset(zoned) // => "2024-01-01T15:00:00.000+03:00"
```

## formatIsoZoned

**Formatting zoned DateTime values**

```efx
import { DateTime } from "effect"

const zoned = DateTime.makeZonedUnsafe("2024-06-15T14:30:45.123Z", {
  timeZone: "Europe/London"
})

DateTime.formatIsoZoned(zoned) // => "2024-06-15T15:30:45.123+01:00[Europe/London]"

const offsetZone = DateTime.makeZonedUnsafe("2024-06-15T14:30:45.123Z", {
  timeZone: DateTime.zoneMakeOffset(3 * 60 * 60 * 1000)
})

DateTime.formatIsoZoned(offsetZone) // => "2024-06-15T17:30:45.123+03:00"
```

## layerCurrentZone

**Providing current time zone layers**

```efx

const zone = DateTime.zoneMakeNamedUnsafe("Europe/London")
const layer = DateTime.layerCurrentZone(zone)

const program = effect {
  const now = await DateTime.nowInCurrentZone
  return DateTime.zoneToString(now.zone)
}

// Use the layer to provide the time zone
await runPromise(provide(program, layer)) // => "Europe/London"
```

## layerCurrentZoneOffset

**Providing fixed-offset time zone layers**

```efx

// Create a layer for UTC+3
const layer = DateTime.layerCurrentZoneOffset(3 * 60 * 60 * 1000)

const program = effect {
  const now = await DateTime.nowInCurrentZone
  return DateTime.zoneToString(now.zone)
}

await runPromise(provide(program, layer)) // => "+03:00"
```

## layerCurrentZoneNamed

**Providing named time zone layers**

```efx

const layer = DateTime.layerCurrentZoneNamed("Europe/London")

const program = effect {
  const now = await DateTime.nowInCurrentZone
  return DateTime.zoneToString(now.zone)
}

await runPromise(provide(program, layer)) // => "Europe/London"
```

## layerCurrentZoneLocal

**Providing local time zone layers**

```efx

const program = effect {
  const now = await DateTime.nowInCurrentZone
  return DateTime.isZoned(now)
}

// Use the system's local time zone
await runPromise(provide(program, DateTime.layerCurrentZoneLocal)) // => true
```
