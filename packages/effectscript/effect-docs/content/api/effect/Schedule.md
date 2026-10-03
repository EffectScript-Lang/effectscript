# effect/Schedule

The examples in the JSDoc of `packages/effect/src/Schedule.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Schedule

**Defining retry and repeat schedules**

```efx
const executions: Array<number> = []
const program = sync(() => executions.push(executions.length + 1)).pipe(
  repeat(Schedule.recurs(2)),
  as(executions)
)

await runPromise(provide(program, TestClock.layer())) // => [1, 2, 3]
```

## Schedule.Variance

**Understanding schedule variance**

```efx
import { Schedule } from "effect"

const schedule: Schedule.Schedule<number, unknown, never, never> = Schedule.recurs(2)
Schedule.isSchedule(schedule) // => true
```

## isSchedule

**Checking for schedules**

```efx
import { Schedule } from "effect"

const schedule = Schedule.exponential("100 millis")
const notSchedule = { foo: "bar" }

Schedule.isSchedule(schedule) // => true
Schedule.isSchedule(notSchedule) // => false
Schedule.isSchedule(null) // => false
Schedule.isSchedule(undefined) // => false
```

## fromStep

**Creating a custom schedule from a step function**

```efx
const schedule = Schedule.fromStep(sync(() => {
  let count = 0

  return (_now: number, _input: string) => {
    if (count >= 3) {
      return Cause.done(count)
    }
    return succeed([count++, Duration.millis(100)] as [number, Duration])
  }
}))

const program = effect {
  const step = await Schedule.toStep(schedule)
  const [output] = await step(0, "input")
  return output
}

await runPromise(program) // => 0
```

## fromStepWithMetadata

**Creating a metadata-aware schedule**

```efx
const firstThreeInputs = Schedule.fromStepWithMetadata(succeed((metadata: Schedule.InputMetadata<string>) => {
  if (metadata.attempt > 3) {
    return Cause.done("finished")
  }

  return succeed([
    `attempt ${metadata.attempt}: ${metadata.input}`,
    Duration.millis(250)
  ] as [string, Duration])
}))

const program = effect {
  const step = await Schedule.toStep(firstThreeInputs)
  const [output] = await step(0, "input")
  return output
}

await runPromise(program) // => "attempt 1: input"
```

## toStep

**Extracting a schedule step function**

```efx
import { Duration } from "effect"

// Extract step function from an existing schedule
const schedule = Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 3 }))

const program = effect {
  const stepFn = await Schedule.toStep(schedule)

  // Use the step function directly for custom logic. The timestamp is
  // supplied by the caller, so tests can pass a deterministic value.
  const now = 0
  return await stepFn(now, "input")
}

await runPromise(program) // => [Duration.millis(100), Duration.millis(100)]
```

## toStepWithSleep

**Extracting a sleeping step function**

```efx
const schedule = Schedule.recurs(3)

const program = effect {
  const stepWithSleep = await Schedule.toStepWithSleep(schedule)

  return [await stepWithSleep("first"), await stepWithSleep("second")]
}

await runPromise(provide(program, TestClock.layer())) // => [0, 1]
```

## addDelay

**Adding extra delay to a schedule**

```efx
import { Duration } from "effect"

const schedule = Schedule.recurs(1).pipe(
  Schedule.addDelay(() => succeed("25 millis"))
)
const program = effect {
  const step = await Schedule.toStep(schedule)
  const [, delay] = await step(0, undefined)
  return delay
}

await runPromise(program) // => Duration.millis(25)
```

## concat

**Sequencing quick and slow retries**

```efx
import { Schedule } from "effect"

const schedule = Schedule.concat(Schedule.recurs(1), Schedule.recurs(2))
Schedule.isSchedule(schedule) // => true
```

## concatResult

**Tracking sequential schedule phases**

```efx
import { Schedule } from "effect"

const schedule = Schedule.concatResult(Schedule.recurs(1), Schedule.recurs(2))
Schedule.isSchedule(schedule) // => true
```

## max

**Combining retry schedules by their maximum delay**

```efx
import { Schedule } from "effect"

const schedule = Schedule.max([Schedule.fixed("5 seconds"), Schedule.spaced("10 seconds")])
Schedule.isSchedule(schedule) // => true
```

## cron

**Scheduling work with cron expressions**

```efx
import { Schedule } from "effect"

const everyMinute = Schedule.cron("* * * * *")
Schedule.isSchedule(everyMinute) // => true
```

## duration

**Recurring once after a duration**

```efx
import { Schedule } from "effect"

Schedule.isSchedule(Schedule.duration("1 second")) // => true
```

## during

**Repeating work during a duration**

```efx
import { Schedule } from "effect"

Schedule.isSchedule(Schedule.during("5 seconds")) // => true
```

## min

**Combining retry schedules by their minimum delay**

```efx
import { Schedule } from "effect"

const schedule = Schedule.min([Schedule.fixed("5 seconds"), Schedule.spaced("10 seconds")])
Schedule.isSchedule(schedule) // => true
```

## exponential

**Retrying with exponential backoff**

```efx
import { Duration } from "effect"

const program = effect {
  const step = await Schedule.toStep(Schedule.exponential("100 millis"))
  return await step(0, undefined)
}

await runPromise(program) // => [Duration.millis(100), Duration.millis(100)]
```

## fibonacci

**Retrying with Fibonacci backoff**

```efx
import { Duration } from "effect"

const program = effect {
  const step = await Schedule.toStep(Schedule.fibonacci("100 millis"))
  return await step(0, undefined)
}

await runPromise(program) // => [Duration.millis(100), Duration.millis(100)]
```

## fixed

**Repeating on fixed intervals**

```efx
import { Duration } from "effect"

const program = effect {
  const step = await Schedule.toStep(Schedule.fixed("1 second"))
  return await step(0, undefined)
}

await runPromise(program) // => [0, Duration.seconds(1)]
```

## map

**Mapping schedule outputs**

```efx
const countSchedule = Schedule.recurs(5).pipe(
  Schedule.map(({ output: count }) => succeed(`Execution #${count + 1}`))
)
const program = effect {
  const step = await Schedule.toStep(countSchedule)
  const [output] = await step(0, undefined)
  return output
}

await runPromise(program) // => "Execution #1"
```

## modifyDelay

**Modifying delays from schedule metadata**

```efx
const schedule = Schedule.spaced("10 millis").pipe(
  Schedule.modifyDelay(({ duration }) => succeed(Duration.times(duration, 2)))
)
const program = effect {
  const step = await Schedule.toStep(schedule)
  const [, delay] = await step(0, undefined)
  return delay
}

await runPromise(program) // => Duration.millis(20)
```

## passthrough

**Passing inputs through as outputs**

```efx
const inputSchedule = Schedule.passthrough(
  Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 3 }))
)
const program = effect {
  const step = await Schedule.toStep(inputSchedule)
  const [output] = await step(0, "input")
  return output
}

await runPromise(program) // => "input"
```

## recurs

**Limiting recurrences**

```efx
const executions: Array<number> = []
const program = sync(() => executions.push(executions.length + 1)).pipe(
  repeat(Schedule.recurs(3)),
  as(executions)
)

await runPromise(provide(program, TestClock.layer())) // => [1, 2, 3, 4]
```

## spaced

**Repeating with fixed spacing**

```efx
import { Duration } from "effect"

const program = effect {
  const step = await Schedule.toStep(Schedule.spaced("2 seconds"))
  return await step(0, undefined)
}

await runPromise(program) // => [0, Duration.seconds(2)]
```

## tap

**Tapping schedule metadata**

```efx
const attempts: Array<number> = []
const monitoredSchedule = Schedule.recurs(2).pipe(
  Schedule.tap((metadata) => sync(() => attempts.push(metadata.attempt)))
)
const program = effect {
  const step = await Schedule.toStep(monitoredSchedule)
  const [output] = await step(0, undefined)
  return { attempts, output }
}

await runPromise(program) // => { attempts: [1], output: 0 }
```

## upTo

**Limiting by duration and recurrence count**

```efx
const executions: Array<number> = []
const schedule = Schedule.forever.pipe(Schedule.upTo({ times: 2 }))
const program = sync(() => executions.push(executions.length + 1)).pipe(
  repeat(schedule),
  as(executions)
)

await runPromise(provide(program, TestClock.layer())) // => [1, 2, 3]
```

## windowed

**Repeating on aligned windows**

```efx
import { Duration } from "effect"

const program = effect {
  const step = await Schedule.toStep(Schedule.windowed("5 seconds"))
  return await step(0, undefined)
}

await runPromise(program) // => [0, Duration.seconds(5)]
```

## forever

**Repeating forever**

```efx
const executions: Array<number> = []
const schedule = Schedule.forever.pipe(Schedule.upTo({ times: 2 }))
const program = sync(() => executions.push(executions.length + 1)).pipe(
  repeat(schedule),
  as(executions)
)

await runPromise(provide(program, TestClock.layer())) // => [1, 2, 3]
```

## setInputType

**Setting a schedule input type**

```efx
import { Schedule } from "effect"

const schedule = Schedule.recurs(3).pipe(
  Schedule.setInputType<string>()
)
Schedule.isSchedule(schedule) // => true
```
