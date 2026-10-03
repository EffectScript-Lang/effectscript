# effect/Sink

The examples in the JSDoc of `packages/effect/src/Sink.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Sink

**Running a sink with a stream**

```efx
// Create a simple sink that always succeeds with a value
const sink: Sink<number> = Sink.succeed(42)

// Use the sink to consume a stream
const stream = Stream.make(1, 2, 3)
await runPromise(Stream.run(stream, sink)) // => 42
```

## isSink

**Checking for a sink**

```efx
import { Sink } from "effect"

const sink = Sink.never
const notStream = { data: [1, 2, 3] }

Sink.isSink(sink) // => true
Sink.isSink(notStream) // => false
```

## fromChannel

**Using channel completion as the sink result**

```efx
const channel = Channel.identity<readonly [number, ...Array<number>], never, void>().pipe(
  Channel.drain,
  Channel.mapDone(() => ["consumed"] as const)
)
const sink = Sink.fromChannel(channel)

await runPromise(Stream.run(Stream.make(1, 2, 3), sink)) // => "consumed"
```

## fromWritableStream

**Collecting values in a Web stream**

```efx
const written: Array<number> = []
const sink = Sink.fromWritableStream({
  evaluate: () => new WritableStream<number>({
    write(value) {
      written.push(value)
    }
  }),
  onError: (cause) => new Error(String(cause))
})

await runPromise(Stream.run(Stream.make(1, 2, 3), sink))
written // => [1, 2, 3]
```

## toChannel

**Running a sink as a channel**

```efx
const channel = Stream.toChannel(Stream.make(1, 2, 3)).pipe(
  Channel.pipeTo(Sink.toChannel(Sink.sum))
)

await runPromise(Channel.runDrain(channel)) // => [6]
```

## succeed

**Succeeding with a value**

```efx
// Create a sink that always yields the same value
const sink = Sink.succeed(42)

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromise(Stream.run(stream, sink)) // => 42
```

## fail

**Failing with an error**

```efx
import { Effect, Exit } from "effect"

// Create a sink that always fails
const sink = Sink.fail("Sink failed")

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Sink failed")
```

## failSync

**Failing with a lazy error**

```efx
import { Effect, Exit } from "effect"

// Create a sink that fails with a lazy error
const sink = Sink.failSync(() => "Lazy error")

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Lazy error")
```

## failCause

**Failing with a cause**

```efx
import { Cause, Effect, Exit } from "effect"

// Create a sink that fails with a specific cause
const sink = Sink.failCause(Cause.fail("Custom cause"))

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Custom cause")
```

## failCauseSync

**Failing with a lazy cause**

```efx
import { Cause, Effect, Exit } from "effect"

// Create a sink that fails with a lazy cause
const sink = Sink.failCauseSync(() => Cause.fail("Lazy cause"))

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Lazy cause")
```

## die

**Dying with a defect**

```efx
import { Effect, Exit } from "effect"

// Create a sink that dies with a defect
const sink = Sink.die("Defect error")

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromiseExit(Stream.run(stream, sink)) // => Exit.die("Defect error")
```

## forEach

**Running effects for each item**

```efx
const processed: Array<number> = []
const sink = Sink.forEach((item: number) => sync(() => processed.push(item)))

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromise(Stream.run(stream, sink))
processed // => [1, 2, 3]
```

## forEachArray

**Running effects for each chunk**

```efx
const processed: Array<Array<number>> = []
const sink = Sink.forEachArray((chunk: ReadonlyArray<number>) => sync(() => processed.push([...chunk])))

// Use it with a stream
const stream = Stream.make(1, 2, 3, 4, 5)
await runPromise(Stream.run(stream, sink))
processed // => [[1, 2, 3, 4, 5]]
```

## unwrap

**Unwrapping a sink effect**

```efx
// Create a sink from an effect that produces a sink
const processed: Array<number> = []
const sinkEffect = succeed(
  Sink.forEach((item: number) => sync(() => processed.push(item)))
)
const sink = Sink.unwrap(sinkEffect)

// Use it with a stream
const stream = Stream.make(1, 2, 3)
await runPromise(Stream.run(stream, sink))
processed // => [1, 2, 3]
```
