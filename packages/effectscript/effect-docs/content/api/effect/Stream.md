# effect/Stream

The examples in the JSDoc of `packages/effect/src/Stream.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Stream

**Creating and consuming streams**

```efx
const values = await runPromise(
  Stream.make(1, 2, 3).pipe(
    Stream.map((n) => n * 2),
    Stream.runCollect
  )
)
values // => [2, 4, 6]
```

## StreamTypeLambda

**Using the stream type lambda**

```efx
// Create a Stream type using the type lambda
type NumberStream = HKT.Kind<Stream.StreamTypeLambda, never, never, string, number>
// Equivalent to: Stream<number, string, never>
const stream: NumberStream = Stream.make(1, 2, 3)
await runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
```

## Success

**Extracting the success type from a Stream type**

```efx
import { Stream } from "effect"

type NumberStream = Stream.Stream<number, string, never>
type SuccessType = Stream.Success<NumberStream>
const value: SuccessType = 42
```

## Error

**Extracting the error type from a Stream type**

```efx
import { Stream } from "effect"

type NumberStream = Stream.Stream<number, string, never>
type ErrorType = Stream.Error<NumberStream>
const error: ErrorType = "boom"
```

## Services

**Extracting the services type from a Stream type**

```efx
import { Stream } from "effect"

interface Database {
  query: (sql: string) => unknown
}
type NumberStream = Stream.Stream<number, string, { db: Database }>
type RequiredServices = Stream.Services<NumberStream>
const services: RequiredServices = { db: { query: (sql) => sql } }
services.db.query("SELECT 1") // => "SELECT 1"
```

## isStream

**Checking whether a value is a Stream**

```efx
import { Stream } from "effect"

Stream.isStream(Stream.make(1, 2, 3)) // => true
Stream.isStream({ data: [1, 2, 3] }) // => false
```

## DefaultChunkSize

**Reading the default chunk size**

```efx
import { Stream } from "effect"

Stream.DefaultChunkSize // => 4096
```

## fromChannel

**Creating a stream from an array-emitting channel**

```efx
const channel = Channel.succeed([1, 2, 3] as const)
const stream = Stream.fromChannel(channel)
await runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
```

## fromEffect

**Creating a stream from an effect**

```efx
const stream = Stream.fromEffect(succeed(42))
await runPromise(Stream.runCollect(stream)) // => [42]
```

## service

**Accessing a service as a stream**

```efx
service Greeter {
  readonly greet: (name: string) => string
}

const stream = Stream.service(Greeter).pipe(
  Stream.map((greeter) => greeter.greet("World"))
)

await runPromise(
  stream.pipe(
    Stream.provideService(Greeter, {
      greet: (name) => `Hello, ${name}!`
    }),
    Stream.runCollect
  )
) // => ["Hello, World!"]
```

## serviceOption

**Accessing an optional service as a stream**

```efx
service Greeter {
  readonly greet: (name: string) => string
}

const stream = Stream.serviceOption(Greeter).pipe(
  Stream.map((maybeGreeter) =>
    Option.match(maybeGreeter, {
      onNone: () => "No greeter",
      onSome: (greeter) => greeter.greet("World")
    })
  )
)

await runPromise(
  stream.pipe(
    Stream.provideService(Greeter, {
      greet: (name) => `Hello, ${name}!`
    }),
    Stream.runCollect
  )
) // => ["Hello, World!"]
```

## fromEffectDrain

**Draining an effect into a stream**

```efx
let drained = false
await runPromise(
  Stream.fromEffectDrain(sync(() => {
    drained = true
  })).pipe(Stream.runDrain)
)
drained // => true
```

## fromEffectRepeat

**Repeating an effect forever**

```efx
let n = 0
const stream = Stream.fromEffectRepeat(sync(() => ++n)).pipe(Stream.take(5))
await runPromise(Stream.runCollect(stream)) // => [1, 2, 3, 4, 5]
```

## fromEffectSchedule

**Repeating an effect with a schedule**

```efx
const stream = Stream.fromEffectSchedule(succeed("ping"), Schedule.recurs(2))
await runPromise(Stream.runCollect(stream)) // => ["ping", "ping", "ping"]
```

## tick

**Emitting ticks on an interval**

```efx
await runPromise(Stream.tick(0).pipe(Stream.take(3), Stream.runCollect)) // => [undefined, undefined, undefined]
```

## fromPull

**Creating a stream from a pull effect**

```efx
const program = scoped(
  effect {
    const source = Stream.make(1, 2, 3)
    const pull = await Stream.toPull(source)
    const stream = Stream.fromPull(succeed(pull))
    return await Stream.runCollect(stream)
  }
)

await runPromise(program) // => [1, 2, 3]
```

## transformPull

**Transforming a pull effect**

```efx
const stream = Stream.make(1, 2, 3)

const transformed = Stream.transformPull(stream, (pull) => succeed(pull))

await runPromise(Stream.runCollect(transformed)) // => [1, 2, 3]
```

## transformPullBracket

**Transforming a stream by effectfully transforming its pull effect**

```efx
const finalized: Array<boolean> = []
const stream = Stream.make(1, 2, 3)

const transformed = Stream.transformPullBracket(
  stream,
  (pull, _scope, forkedScope) =>
    effect {
      await Scope.addFinalizer(forkedScope, sync(() => finalized.push(true)))
      return pull
    }
)

await runPromise(Stream.runCollect(transformed)) // => [1, 2, 3]
finalized // => [true]
```

## toChannel

**Converting a stream to a channel**

```efx
const channel = Stream.toChannel(Stream.make(1, 2, 3))
const values = await runPromise(Channel.runCollect(channel))
values.flat() // => [1, 2, 3]
```

## callback

**Creating a stream from a callback that can emit values into a queue**

```efx
const stream = Stream.callback<number>((queue) =>
  sync(() => {
    // Emit values to the stream
    Queue.offerUnsafe(queue, 1)
    Queue.offerUnsafe(queue, 2)
    Queue.offerUnsafe(queue, 3)
    // Signal completion
    Queue.endUnsafe(queue)
  })
)

await runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
```

## empty

**Creating an empty stream**

```efx
await runPromise(Stream.runCollect(Stream.empty)) // => []
```

## succeed

**Creating a single-valued pure stream**

```efx
await runPromise(Stream.runCollect(Stream.succeed(3))) // => [3]
```

## make

**Creating a stream from a sequence of values**

```efx
const stream = Stream.make(1, 2, 3)

await runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
```

## sync

**Evaluating a value synchronously**

```efx
await runPromise(Stream.sync(() => 2 + 1).pipe(Stream.runCollect)) // => [3]
```

## suspend

**Creating a lazily constructed stream**

```efx
await runPromise(Stream.suspend(() => Stream.make(1, 2, 3)).pipe(Stream.runCollect)) // => [1, 2, 3]
```

## fail

**Failing a stream**

```efx
import { Effect, Exit } from "effect"

await runPromise(exit(Stream.runCollect(Stream.fail("Uh oh!")))) // => Exit.fail("Uh oh!")
```

## failSync

**Failing a stream lazily**

```efx
import { Effect, Exit } from "effect"

const stream = Stream.failSync(() => "Uh oh!")

await runPromise(Stream.runCollect(stream).pipe(exit)) // => Exit.fail("Uh oh!")
```

## failCause

**Failing with a cause**

```efx
const stream = Stream.failCause(Cause.fail("Database connection failed")).pipe(
  Stream.catchCause(() => Stream.succeed("recovered"))
)

await runPromise(Stream.runCollect(stream)) // => ["recovered"]
```

## die

**Dying with a defect**

```efx
import { Cause, Effect, Exit } from "effect"

const defect = new Error("Boom")
const stream = Stream.die(defect)

await runPromise(exit(Stream.runCollect(stream))) // => Exit.failCause(Cause.die(defect))
```

## failCauseSync

**Failing with a lazy cause**

```efx
import { Cause, Effect, Exit } from "effect"

const stream = Stream.failCauseSync(() =>
  Cause.fail("Connection timeout after retries")
)

await runPromise(Stream.runCollect(stream).pipe(exit)) // => Exit.fail("Connection timeout after retries")
```

## fromIteratorSucceed

**Consuming values from an iterator**

```efx
function* numbers() {
  yield 1
  yield 2
  yield 3
}

const stream = Stream.fromIteratorSucceed(numbers())

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
}

await runPromise(program)
```

## fromIterable

**Creating a stream from an iterable**

```efx
const numbers = [1, 2, 3]

const program = effect {
  const stream = Stream.fromIterable(numbers)
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
}

await runPromise(program)
```

## fromIterableEffect

**Creating a stream from an iterable effect**

```efx
service UserRepo {
  readonly list: Effect<ReadonlyArray<string>>
}

const listUsers = service(UserRepo).pipe(
  andThen((repo) => repo.list)
)

const stream = Stream.fromIterableEffect(listUsers)

const program = effect {
  const users = await stream.pipe(
    Stream.provideService(UserRepo, {
      list: succeed(["user1", "user2"])
    }),
    Stream.runCollect
  )
  users // => ["user1", "user2"]
}

await runPromise(program)
```

## fromIterableEffectRepeat

**Repeating an iterable effect**

```efx
const program = effect {
  const stream = Stream.fromIterableEffectRepeat(succeed([1, 2])).pipe(
    Stream.take(5)
  )
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 1, 2, 1]
}

await runPromise(program)
```

## fromArray

**Creating a stream from an array of values**

```efx
const program = effect {
  const stream = Stream.fromArray([1, 2, 3])
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
}

await runPromise(program)
```

## fromArrayEffect

**Creating a stream from an effect that produces an array of values**

```efx
const program = effect {
  const stream = Stream.fromArrayEffect(succeed(["Ada", "Grace"]))
  const values = await Stream.runCollect(stream)
  values // => ["Ada", "Grace"]
}

await runPromise(program)
```

## fromArrays

**Creating a stream from an arbitrary number of arrays**

```efx
const program = effect {
  const stream = Stream.fromArrays([1, 2], [3, 4])
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3, 4]
}

await runPromise(program)
```

## fromQueue

**Creating a stream from a queue of values**

```efx
const program = effect {
  const queue = await Queue.unbounded<number, Cause.Done>()
  await Queue.offer(queue, 1)
  await Queue.offer(queue, 2)
  await Queue.offer(queue, 3)
  await Queue.end(queue)

  const stream = Stream.fromQueue(queue)
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
}

await runPromise(program)
```

## fromPubSub

**Creating a stream from a subscription to a PubSub**

```efx
const program = effect {
  const pubsub = await PubSub.unbounded<number>({ replay: 3 })

  const fiber = await Stream.fromPubSub(pubsub).pipe(
    Stream.take(3),
    Stream.runCollect,
    forkChild
  )

  await PubSub.publish(pubsub, 1)
  await PubSub.publish(pubsub, 2)
  await PubSub.publish(pubsub, 3)

  const values = await Fiber.join(fiber)
  values // => [1, 2, 3]
}

await runPromise(program)
```

## fromPubSubTake

**Creating a stream from PubSub takes**

```efx
const program = effect {
  const pubsub = await PubSub.unbounded<Take<number, string>>({
    replay: 3
  })

  await PubSub.publish(pubsub, [1])
  await PubSub.publish(pubsub, [2])
  await PubSub.publish(pubsub, Exit.succeed<void>(undefined))

  const values = await Stream.fromPubSubTake(pubsub).pipe(Stream.runCollect)
  values // => [1, 2]
}

await runPromise(program)
```

## fromReadableStream

**Creating a stream from a ReadableStream**

```efx
class StreamError extends Data.TaggedError("StreamError")<{ readonly cause: unknown }> {}

const readableStream = new ReadableStream({
  start(controller) {
    controller.enqueue(1)
    controller.enqueue(2)
    controller.enqueue(3)
    controller.close()
  }
})

const program = effect {
  const stream = Stream.fromReadableStream({
    evaluate: () => readableStream,
    onError: (cause) => new StreamError({ cause })
  })
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
}

await runPromise(program)
```

## fromAsyncIterable

**Creating a stream from an AsyncIterable**

```efx
class StreamError extends Data.TaggedError("StreamError")<{ readonly cause: unknown }> {}

const iterable = (async function*() {
  yield 1
  yield 2
  yield 3
})()

await runPromise(effect {
  const stream = Stream.fromAsyncIterable(iterable, (cause) => new StreamError({ cause }))
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
})

```

## fromSchedule

**Creating a stream from a schedule**

```efx
const program = effect {
  const schedule = Schedule.recurs(3)
  const stream = Stream.fromSchedule(schedule)
  const values = await Stream.runCollect(stream)
  values // => [0, 1, 2]
}

await runPromise(program)
```

## fromSubscription

**Creating a stream from a PubSub subscription**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.unbounded<number>()
  const subscription = await PubSub.subscribe(pubsub)

  await PubSub.publish(pubsub, 1)
  await PubSub.publish(pubsub, 2)

  const stream = Stream.fromSubscription(subscription)
  const values = await stream.pipe(Stream.take(2), Stream.runCollect)
  values // => [1, 2]
})

await runPromise(program)
```

## fromEventListener

**Creating a stream from an event listener**

```efx
class NumberTarget implements Stream.EventListener<number> {
  addEventListener(event: string, f: (event: number) => void) {
    if (event === "data") {
      f(1)
      f(2)
      f(3)
    }
  }
  removeEventListener(_event: string, _f: (event: number) => void) {}
}

await runPromise(effect {
  const stream = Stream.fromEventListener(new NumberTarget(), "data").pipe(
    Stream.take(3)
  )
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
})

```

## unfold

**Unfolding stream state**

```efx
const program = effect {
  const stream = Stream.unfold(1, (n) => succeed([n, n + 1] as const))
  const values = await Stream.runCollect(stream.pipe(Stream.take(5)))
  values // => [ 1, 2, 3, 4, 5 ]
}

await runPromise(program)
```

## paginate

**Paginating stream state**

```efx
const stream = Stream.paginate(0, (n: number) =>
  succeed(
    [
      [n],
      n < 3 ? Option.some(n + 1) : Option.none<number>()
    ] as const
  ))

await runPromise(Stream.runCollect(stream)) // => [0, 1, 2, 3]
```

## iterate

**Iterating from a seed value**

```efx
const stream = Stream.iterate(1, (n) => n + 1).pipe(Stream.take(3))

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## range

**Creating a numeric range**

```efx
const program = effect {
  const values = await Stream.range(1, 5).pipe(Stream.runCollect)
  values // => [ 1, 2, 3, 4, 5 ]
}

await runPromise(program)
```

## never

**Creating a never-ending stream**

```efx
const program = Stream.never.pipe(
  Stream.take(0),
  Stream.runCollect
)

await runPromise(program) // => []
```

## unwrap

**Unwrapping a stream effect**

```efx
const effect = succeed(Stream.make(1, 2, 3))

const stream = Stream.unwrap(effect)

const program = effect {
  const chunk = await Stream.runCollect(stream)
  chunk // => [ 1, 2, 3 ]
}
await runPromise(program)
```

## scoped

**Scoping a stream**

```efx
const events: Array<string> = []
const stream = Stream.scoped(
  Stream.fromEffect(
    acquireRelease(
      sync(() => {
        events.push("acquire")
        return "resource"
      }),
      () => sync(() => events.push("release"))
    )
  )
)

await runPromise(Stream.runCollect(stream)) // => ["resource"]
events // => ["acquire", "release"]
```

## map

**Mapping stream values**

```efx
import { Effect, Option } from "effect"

const stream = Stream.fromArray([1, 2, 3]).pipe(Stream.map((n, i) => n + i))
await runPromise(Stream.runCollect(stream)) // => [1, 3, 5]
```

## as

**Replacing stream elements**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.as("x"),
    Stream.runCollect
  )
  values // => [ 'x', 'x', 'x' ]
}

await runPromise(program)
```

## mapBoth

**Mapping both the failure and success channels of a stream**

```efx
const mapper = {
  onElement: (value: number) => value * 2,
  onError: (error: string) => `error: ${error}`
}

const program = effect {
  const success = await Stream.make(1, 2).pipe(
    Stream.mapBoth(mapper),
    Stream.runCollect
  )
  success // => [ 2, 4 ]

  const failure = await Stream.fail("boom").pipe(
    Stream.mapBoth(mapper),
    Stream.catch((error: string) => Stream.succeed(error)),
    Stream.runCollect
  )
  failure // => [ 'error: boom' ]
}

await runPromise(program)
```

## mapArray

**Mapping stream chunks**

```efx
import { Array } from "effect"

const program = effect {
  const result = await Stream.make(1, 2, 3, 4).pipe(
    Stream.rechunk(2),
    Stream.mapArray((chunk, index) => Array.map(chunk, (n) => n + index)),
    Stream.runCollect
  )
  result // => [ 1, 2, 4, 5 ]
}

await runPromise(program)
```

## mapEffect

**Effectfully mapping stream values**

```efx
const events: Array<string> = []
const stream = Stream.make(1, 2, 3)

const mappedStream = stream.pipe(
  Stream.mapEffect((n) =>
    sync(() => {
      events.push(`Processing: ${n}`)
      return n * 2
    })
  )
)

const program = effect {
  const result = await Stream.runCollect(mappedStream)
  result // => [2, 4, 6]
}

await runPromise(program)
events // => ["Processing: 1", "Processing: 2", "Processing: 3"]
```

## flattenEffect

**Flattening a stream of Effect values into a stream of their results**

```efx
const stream = Stream.make(succeed(1), succeed(2), succeed(3))

const program = effect {
  const result = await Stream.runCollect(stream.pipe(Stream.flattenEffect()))
  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## mapArrayEffect

**Effectfully mapping stream chunks**

```efx
import { Array } from "effect"

const program = effect {
  const result = await Stream.fromArray([1, 2, 3, 4]).pipe(
    Stream.rechunk(2),
    Stream.mapArrayEffect((chunk, index) =>
      succeed(Array.map(chunk, (n) => n + index * 10))
    ),
    Stream.runCollect
  )
  result // => [ 1, 2, 13, 14 ]
}

await runPromise(program)
```

## result

**Converting failures to results**

```efx
const program = effect {
  const results = await Stream.make(1, 2).pipe(
    Stream.concat(Stream.fail("boom")),
    Stream.result,
    Stream.map(Result.match({
      onFailure: (error) => `failure: ${error}`,
      onSuccess: (value) => `success: ${value}`
    })),
    Stream.runCollect
  )
  results // => [ 'success: 1', 'success: 2', 'failure: boom' ]
}

await runPromise(program)
```

## tap

**Tapping stream values**

```efx
const events: Array<string> = []
const program = effect {
  const result = await Stream.fromArray([1, 2, 3]).pipe(
    Stream.tap((n) => sync(() => events.push(`before mapping: ${n}`))),
    Stream.map((n) => n * 2),
    Stream.tap((n) => sync(() => events.push(`after mapping: ${n}`))),
    Stream.runCollect
  )

  result // => [2, 4, 6]
}

await runPromise(program)
events // => ["before mapping: 1", "after mapping: 2", "before mapping: 2", "after mapping: 4", "before mapping: 3", "after mapping: 6"]
```

## tapBoth

**Tapping values and errors**

```efx
const events: Array<string> = []
const program = effect {
  const stream = Stream.make(1, 2).pipe(
    Stream.concat(Stream.fail("boom")),
    Stream.tapBoth({
      onElement: (value) => sync(() => events.push(`seen: ${value}`)),
      onError: (error) => sync(() => events.push(`error: ${error}`))
    }),
    Stream.catch(() => Stream.make(3))
  )
  const result = await Stream.runCollect(stream)
  result // => [1, 2, 3]
}

await runPromise(program)
events // => ["seen: 1", "seen: 2", "error: boom"]
```

## tapSink

**Tapping values with a sink**

```efx
const program = effect {
  const seen = await Ref.make<Array<number>>([])
  const sink = Sink.forEach((value: number) =>
    Ref.update(seen, (items) => [...items, value])
  )
  const result = await Stream.make(1, 2, 3).pipe(
    Stream.tapSink(sink),
    Stream.runCollect
  )
  const tapped = await Ref.get(seen)
  tapped // => [ 1, 2, 3 ]
  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## flatMap

**Flat mapping stream values**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.flatMap((n) => Stream.make(n, n * 2)),
    Stream.runCollect
  )
  values // => [ 1, 2, 2, 4, 3, 6 ]
}

await runPromise(program)
```

## switchMap

**Switching to the latest stream**

```efx
const program = Stream.make(1, 2, 3).pipe(
  Stream.switchMap((n) => (n === 3 ? Stream.make(n) : Stream.never)),
  Stream.runCollect
)

await runPromise(effect {
  const result = await program
  result // => [ 3 ]
})
```

## flatten

**Flattening nested streams**

```efx
const streamOfStreams = Stream.make(
  Stream.make(1, 2),
  Stream.make(3, 4),
  Stream.make(5, 6)
)

const program = effect {
  const values = await Stream.runCollect(Stream.flatten(streamOfStreams))
  values // => [ 1, 2, 3, 4, 5, 6 ]
}

await runPromise(program)
```

## flattenArray

**Flattening a stream of non-empty arrays into a stream of elements**

```efx
import { Array } from "effect"

const stream = Stream.make(Array.make(1, 2), Array.make(3))

const program = effect {
  const result = await Stream.runCollect(Stream.flattenArray(stream))
  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## drain

**Draining stream values**

```efx
const program = effect {
  const result = await Stream.range(1, 6).pipe(Stream.drain, Stream.runCollect)
  result // => []
}

await runPromise(program)
```

## drainFork

**Draining a stream in the background**

```efx
const events: Array<string> = []
const foreground = Stream.make(1, 2)
const background = Stream.fromEffect(sync(() => events.push("background task")))

const program = effect {
  const values = await foreground.pipe(
    Stream.drainFork(background),
    Stream.runCollect
  )
  values // => [1, 2]
}

await runPromise(program)
events // => ["background task"]
```

## repeat

**Repeating a stream on a schedule**

```efx
const program = effect {
  const result = await Stream.make(1).pipe(
    Stream.repeat(Schedule.recurs(4)),
    Stream.runCollect
  )

  result // => [ 1, 1, 1, 1, 1 ]
}

await runPromise(program)
```

## schedule

**Scheduling stream elements**

```efx
const program = effect {
  const result = await Stream.make(1, 2, 3).pipe(
    Stream.schedule(Schedule.recurs(3)),
    Stream.runCollect
  )

  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## timeout

**Timing out a stream**

```efx
const program = effect {
  const values = await Stream.make(1).pipe(
    Stream.concat(Stream.never),
    Stream.timeout("1 second"),
    Stream.runCollect
  )
  values // => [ 1 ]
}

await runPromise(program)
```

## repeatElements

**Repeating stream elements**

```efx
const program = effect {
  const values = await Stream.make("A", "B", "C").pipe(
    Stream.repeatElements(Schedule.recurs(1)),
    Stream.runCollect
  )
  values // => [ 'A', 'A', 'B', 'B', 'C', 'C' ]
}

await runPromise(program)
```

## forever

**Repeating a stream forever**

```efx
const stream = Stream.make("A", "B").pipe(
  Stream.forever,
  Stream.take(5)
)

const program = effect {
  const output = await Stream.runCollect(stream)
  output // => [ 'A', 'B', 'A', 'B', 'A' ]
}

await runPromise(program)
```

## flattenIterable

**Flattening iterable values**

```efx
const program = effect {
  const stream = Stream.make([1, 2], [3, 4]).pipe(Stream.flattenIterable)
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 3, 4 ]
}

await runPromise(program)
```

## flattenTake

**Flattening Take values**

```efx
import { Array } from "effect"

const program = effect {
  const takes = Stream.make(
    Array.make(1, 2),
    Array.make(3),
    Exit.succeed<void>(undefined)
  )

  const values = await Stream.flattenTake(takes).pipe(Stream.runCollect)
  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## concat

**Concatenating streams**

```efx
const stream = Stream.concat(Stream.make(1, 2, 3), Stream.make(4, 5, 6))

await runPromise(effect {
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 3, 4, 5, 6 ]
})
```

## prepend

**Prepending values**

```efx
const program = effect {
  const values = await Stream.make(3, 4).pipe(
    Stream.prepend([1, 2]),
    Stream.runCollect
  )

  values // => [ 1, 2, 3, 4 ]
}

await runPromise(program)
```

## merge

**Merging stream values**

```efx
const fast = Stream.make(1, 2, 3)
const slow = Stream.fromEffect(delay(succeed(4), "50 millis"))

const program = effect {
  const result = await Stream.runCollect(Stream.merge(fast, slow))
  result // => [ 1, 2, 3, 4 ]
}

await runPromise(program)
```

## mergeEffect

**Merging with a background effect**

```efx
const events: Array<string> = []
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.mergeEffect(sync(() => events.push("side task"))),
    Stream.runCollect
  )

  values // => [1, 2, 3]
}

await runPromise(program)
events // => ["side task"]
```

## mergeResult

**Merging streams into results**

```efx
const left = Stream.fromEffect(succeed("left"))
const right = Stream.fromEffect(delay(succeed("right"), "10 millis"))

const merged = left.pipe(
  Stream.mergeResult(right),
  Stream.map(
    Result.match({
      onFailure: (value) => `right:${value}`,
      onSuccess: (value) => `left:${value}`
    })
  )
)

const program = effect {
  const result = await Stream.runCollect(merged)
  result // => [ 'left:left', 'right:right' ]
}

await runPromise(program)
```

## mergeLeft

**Merging streams while keeping left values**

```efx
const program = effect {
  const left = Stream.make(1, 2)
  const right = Stream.make("a", "b")
  const values = await left.pipe(Stream.mergeLeft(right), Stream.runCollect)
  values // => [ 1, 2 ]
}

await runPromise(program)
```

## mergeRight

**Merging streams while keeping right values**

```efx
const left = Stream.make("left-1", "left-2").pipe(
  Stream.tap(() => sync(() => undefined))
)
const right = Stream.make(1, 2)

const merged = Stream.mergeRight(left, right)

const program = effect {
  const result = await Stream.runCollect(merged)
  result // => [ 1, 2 ]
}

await runPromise(program)
```

## mergeAll

**Merging streams with bounded concurrency**

```efx
const streams = [
  Stream.fromEffect(delay(succeed("A"), "20 millis")),
  Stream.fromEffect(delay(succeed("B"), "10 millis"))
]

const program = effect {
  const values = await Stream.mergeAll(streams, { concurrency: 2 }).pipe(
    Stream.runCollect
  )
  values // => [ 'B', 'A' ]
}

await runPromise(program)
```

## cross

**Computing cartesian products**

```efx
const program = effect {
  const left = Stream.make(1, 2)
  const right = Stream.make("a", "b")
  const values = await Stream.runCollect(Stream.cross(left, right))
  values // => [ [ 1, 'a' ], [ 1, 'b' ], [ 2, 'a' ], [ 2, 'b' ] ]
}

await runPromise(program)
```

## crossWith

**Combining cartesian products**

```efx
const program = effect {
  const left = Stream.make(1, 2)
  const right = Stream.make("a", "b")
  const combined = Stream.crossWith(left, right, (n, s) => `${n}-${s}`)
  const result = await Stream.runCollect(combined)
  result // => [ '1-a', '1-b', '2-a', '2-b' ]
}

await runPromise(program)
```

## zipWith

**Zipping streams with a function**

```efx
const stream1 = Stream.make(1, 2, 3, 4, 5, 6)
const stream2 = Stream.make("a", "b", "c")

const zipped = Stream.zipWith(stream1, stream2, (n, s) => `${n}-${s}`)

const program = effect {
  const result = await Stream.runCollect(zipped)
  result // => [ '1-a', '2-b', '3-c' ]
}

await runPromise(program)
```

## zipWithArray

**Zipping stream chunks**

```efx
import { Array } from "effect"

const left = Stream.fromArrays([1, 2, 3], [4, 5])
const right = Stream.fromArrays(["a", "b"], ["c", "d", "e"])

const zipped = Stream.zipWithArray(left, right, (leftChunk, rightChunk) => {
  const minLength = Math.min(leftChunk.length, rightChunk.length)
  const output = Array.makeBy(minLength, (i) => [leftChunk[i], rightChunk[i]] as const)

  return [output, leftChunk.slice(minLength), rightChunk.slice(minLength)]
})

const program = effect {
  const result = await Stream.runCollect(zipped)
  result // => [ [ 1, 'a' ], [ 2, 'b' ], [ 3, 'c' ], [ 4, 'd' ], [ 5, 'e' ] ]
}

await runPromise(program)
```

## zip

**Zipping streams**

```efx
const stream1 = Stream.make(1, 2, 3)
const stream2 = Stream.make("a", "b", "c")

const zipped = Stream.zip(stream1, stream2)

const program = effect {
  const result = await Stream.runCollect(zipped)
  result // => [ [ 1, 'a' ], [ 2, 'b' ], [ 3, 'c' ] ]
}

await runPromise(program)
```

## zipLeft

**Zipping streams while keeping left values**

```efx
const stream1 = Stream.make(1, 2, 3, 4)
const stream2 = Stream.make("a", "b")

const program = effect {
  const result = await Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)
  result // => [ 1, 2 ]
}

await runPromise(program)
```

## zipRight

**Zipping streams while keeping right values**

```efx
const stream1 = Stream.make(1, 2)
const stream2 = Stream.make("a", "b", "c", "d")

const program = effect {
  const result = await Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)
  result // => [ 'a', 'b' ]
}

await runPromise(program)
```

## zipFlatten

**Zipping and flattening tuples**

```efx
const program = effect {
  const stream1 = Stream.make(
    [1, "a"] as const,
    [2, "b"] as const,
    [3, "c"] as const
  )
  const stream2 = Stream.make("x", "y", "z")
  const result = await Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

  result // => [ [ 1, 'a', 'x' ], [ 2, 'b', 'y' ], [ 3, 'c', 'z' ] ]
}

await runPromise(program)
```

## zipWithIndex

**Zipping elements with indices**

```efx
const program = effect {
  const indexed = await Stream.make("a", "b", "c", "d").pipe(
    Stream.zipWithIndex,
    Stream.runCollect
  )
  indexed // => [ [ 'a', 0 ], [ 'b', 1 ], [ 'c', 2 ], [ 'd', 3 ] ]
}

await runPromise(program)
```

## zipWithNext

**Zipping elements with next values**

```efx
import { Effect, Option } from "effect"

const stream = Stream.zipWithNext(Stream.make(1, 2, 3, 4))

await runPromise(effect {
  const values = await Stream.runCollect(stream)
  values // => [[1, Option.some(2)], [2, Option.some(3)], [3, Option.some(4)], [4, Option.none()]]
})
```

## zipWithPrevious

**Zipping elements with previous values**

```efx
import { Effect, Option } from "effect"

const stream = Stream.zipWithPrevious(Stream.make(1, 2, 3, 4))

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [[Option.none(), 1], [Option.some(1), 2], [Option.some(2), 3], [Option.some(3), 4]]
}

await runPromise(program)
```

## zipWithPreviousAndNext

**Zipping elements with neighbors**

```efx
import { Console, Effect, Option } from "effect"

const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.zipWithPreviousAndNext,
    Stream.runCollect
  )
  values // => [[Option.none(), 1, Option.some(2)], [Option.some(1), 2, Option.some(3)], [Option.some(2), 3, Option.none()]]
}

await runPromise(program)
```

## zipLatestAll

**Zipping latest values from many streams**

```efx
const stream = Stream.zipLatestAll(
  Stream.make(1, 2, 3).pipe(Stream.rechunk(1)),
  Stream.make("a", "b", "c").pipe(Stream.rechunk(1)),
  Stream.make(true, false, true).pipe(Stream.rechunk(1))
)

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [[1, "a", true], [2, "a", true], [2, "b", true], [2, "b", false], [3, "b", false], [3, "c", false], [3, "c", true]]
}

await runPromise(program)
```

## zipLatest

**Zipping latest values**

```efx
const program = effect {
  const result = await Stream.zipLatest(
    Stream.make(1),
    Stream.make("a")
  ).pipe(Stream.runCollect)

  result // => [ [ 1, 'a' ] ]
}
await runPromise(program)
```

## zipLatestWith

**Zipping latest values with a function**

```efx
await runPromise(effect {
  const result = await Stream.make(1, 2, 3).pipe(
    Stream.rechunk(1),
    Stream.zipLatestWith(
      Stream.make(10, 20).pipe(Stream.rechunk(1)),
      (n, m) => n + m
    ),
    Stream.runCollect
  )

  result // => [ 11, 12, 22, 23 ]
})
```

## raceAll

**Racing multiple streams**

```efx
import { Effect, Schedule } from "effect"

const program = effect {
  const result = await Stream.raceAll(
    Stream.empty,
    Stream.make(0, 1, 2)
  ).pipe(Stream.runCollect)
  result // => [ 0, 1, 2 ]
}

await runPromise(program)
```

## race

**Racing two streams**

```efx
const stream = Stream.race(
  Stream.empty,
  Stream.make(0, 1, 2)
)

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [ 0, 1, 2 ]
}

await runPromise(program)
```

## filter

**Filtering stream values**

```efx
const program = effect {
  const stream = Stream.make(1, 2, 3, 4).pipe(
    Stream.filter((n) => n % 2 === 0)
  )
  const values = await Stream.runCollect(stream)
  values // => [ 2, 4 ]
}

await runPromise(program)
```

## filterEffect

**Effectfully filtering stream values**

```efx
const stream = Stream.make(1, 2, 3, 4).pipe(Stream.filterEffect((n) => succeed(n > 2)))

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [ 3, 4 ]
}

await runPromise(program)
```

## partitionQueue

**Partitioning a stream into queues**

```efx
const program = effect {
  const [passes, fails] = await Stream.make(1, 2, 3, 4).pipe(
    Stream.partitionQueue((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n))
  )

  const passValues = await Stream.fromQueue(passes).pipe(Stream.runCollect)
  const failValues = await Stream.fromQueue(fails).pipe(Stream.runCollect)

  passValues // => [ 2, 4 ]
  failValues // => [ 1, 3 ]
}

await runPromise(scoped(program))
```

## partition

**Partitioning a stream**

```efx
const program = effect {
  const [passes, fails] = await Stream.partition(
    Stream.make(1, 2, 3, 4),
    (n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)
  )
  const evens = await Stream.runCollect(passes)
  const odds = await Stream.runCollect(fails)
  evens // => [ 2, 4 ]
  odds // => [ 1, 3 ]
}
await runPromise(scoped(program))
```

## when

**Conditionally keeping a stream**

```efx
const program = effect {
  const result = await Stream.runCollect(
    Stream.when(Stream.make(1, 2, 3), succeed(false))
  )
  result // => []
}

await runPromise(program)
```

## peel

**Peeling a stream with a sink**

```efx
const stream = Stream.fromArrays([1, 2, 3], [4, 5, 6])
const sink = Sink.take<number>(3)

const program = scoped(
  effect {
    const [peeled, rest] = await Stream.peel(stream, sink)
    const remaining = await Stream.runCollect(rest)
    const result = [peeled, remaining] // => [[1, 2, 3], [4, 5, 6]]
  }
)

await runPromise(program)
```

## buffer

**Buffering stream elements**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.buffer({ capacity: 1 }),
    Stream.runCollect
  )
  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## bufferArray

**Buffering stream chunks**

```efx
const program = effect {
  const result = await Stream.fromArrays([1, 2], [3, 4]).pipe(
    Stream.bufferArray({ capacity: 2 }),
    Stream.runCollect
  )
  result // => [ 1, 2, 3, 4 ]
}

await runPromise(program)
```

## catchCause

**Catching stream causes**

```efx
const stream = Stream.make(1, 2).pipe(
  Stream.concat(Stream.fail("Oops!")),
  Stream.concat(Stream.make(3, 4))
)

const recovered = stream.pipe(
  Stream.catchCause(() => Stream.make(999))
)

const program = effect {
  const values = await Stream.runCollect(recovered)
  values // => [ 1, 2, 999 ]
}

await runPromise(program)
```

## catchDefect

**Recovering from a defect**

```efx
const stream = Stream.die("boom").pipe(
  Stream.catchDefect((defect) => Stream.succeed(`recovered: ${defect}`))
)

const result = runSync(Stream.runCollect(stream))
result // => ["recovered: boom"]
```

## tapCause

**Tapping stream causes**

```efx
const observations: Array<boolean> = []
const stream = Stream.make(1, 2).pipe(
  Stream.concat(Stream.fail("boom")),
  Stream.tapCause((cause) => sync(() => observations.push(Cause.isReason(cause)))),
  Stream.catch(() => Stream.succeed(0))
)

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [1, 2, 0]
}

await runPromise(program)
observations // => [false]
```

## catch

**Catching stream failures**

```efx
const stream = Stream.make(1, 2).pipe(
  Stream.concat(Stream.fail("Oops!")),
  Stream.catch(() => Stream.make(999))
)

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 999 ]
}

await runPromise(program)
```

## tapError

**Effectfully peeking at errors**

```efx
const errors: Array<string> = []
const stream = Stream.make(1, 2).pipe(
  Stream.concat(Stream.fail("boom")),
  Stream.tapError((error) => sync(() => errors.push(error))),
  Stream.catch(() => Stream.make(999))
)

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [1, 2, 999]
}

await runPromise(program)
errors // => ["boom"]
```

## tapErrorTag

**Effectfully peeking at a tagged error**

```efx
class NetworkError extends Data.TaggedError("NetworkError")<{
  statusCode: number
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  field: string
}> {}

const seen: Array<number> = []
const stream: Stream<number, NetworkError | ValidationError> = Stream.fail(
  new NetworkError({ statusCode: 504 })
)

const program = stream.pipe(
  Stream.tapErrorTag("NetworkError", (error) => sync(() => seen.push(error.statusCode))),
  Stream.catch(() => Stream.make(0)),
  Stream.runCollect
)

await runPromise(program) // => [ 0 ]
seen // => [ 504 ]
```

## tapDefect

**Effectfully peeking at defects**

```efx
const defects: Array<unknown> = []
const stream = Stream.make(1, 2).pipe(
  Stream.concat(Stream.die("boom")),
  Stream.tapDefect((defect) => sync(() => defects.push(defect))),
  Stream.catchCause(() => Stream.make(3))
)

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 3 ]
}

await runPromise(program)
defects // => [ 'boom' ]
```

## catchIf

**Catching matching failures**

```efx
const stream = Stream.make(1, 2).pipe(
  Stream.concat(Stream.fail(42)),
  Stream.catchIf(
    (error): error is 42 => error === 42,
    () => Stream.make(999)
  )
)

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 999 ]
}

await runPromise(program)
```

## catchTag

**Catching tagged failures**

```efx
class HttpError extends Data.TaggedError("HttpError")<{ message: string }> {}

const stream = Stream.fail(new HttpError({ message: "timeout" }))

const recovered = Stream.catchTag(stream, "HttpError", (error) =>
  Stream.make(`Recovered: ${error.message}`)
)

const program = effect {
  const values = await Stream.runCollect(recovered)
  values // => [ 'Recovered: timeout' ]
}

await runPromise(program)
```

## catchTags

**Catching tagged failures with handlers**

```efx
class NotFound {
  readonly _tag = "NotFound"
  constructor(readonly resource: string) {}
}

class Unauthorized {
  readonly _tag = "Unauthorized"
  constructor(readonly user: string) {}
}

const stream = Stream.fail(new NotFound("profile"))

const program = effect {
  const result = await stream.pipe(
    Stream.catchTags({
      NotFound: () => Stream.succeed("fallback"),
      Unauthorized: () => Stream.succeed("login")
    }),
    Stream.runCollect
  )
  result // => [ 'fallback' ]
}

await runPromise(program)
```

## catchReason

**Catching a tagged error reason**

```efx
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const stream = Stream.fail(
  new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
)

const program = effect {
  const values = await stream.pipe(
    Stream.catchReason("AiError", "RateLimitError", (reason) =>
      Stream.succeed(`retry: ${reason.retryAfter}`)
    ),
    Stream.runCollect
  )
  values // => [ 'retry: 60' ]
}

await runPromise(program)
```

## catchReasons

**Catching tagged error reasons**

```efx
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const stream = Stream.fail(
  new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
)

const program = effect {
  const values = await stream.pipe(
    Stream.catchReasons("AiError", {
      RateLimitError: (reason) => Stream.succeed(`retry: ${reason.retryAfter}`),
      QuotaExceededError: (reason) => Stream.succeed(`quota: ${reason.limit}`)
    }),
    Stream.runCollect
  )
  values // => [ 'retry: 60' ]
}

await runPromise(program)
```

## unwrapReason

**Extracting the reason from a tagged error**

```efx
class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const stream: Stream<string, AiError> = Stream.fail(
  new AiError({ reason: new RateLimitError({ retryAfter: 30 }) })
)

// Before: Stream<string, AiError>
// After:  Stream<string, RateLimitError | QuotaExceededError>
const unwrapped = stream.pipe(Stream.unwrapReason("AiError"))

const program = effect {
  const error = await flip(Stream.runCollect(unwrapped))
  error._tag // => "RateLimitError"
}

await runPromise(program)
```

## mapError

**Mapping stream errors**

```efx
const program = effect {
  const result = await Stream.fail("bad").pipe(
    Stream.mapError((error) => `mapped: ${error}`),
    Stream.catch((error) => Stream.make(`recovered from ${error}`)),
    Stream.runCollect
  )
  result // => [ 'recovered from mapped: bad' ]
}

await runPromise(program)
```

## catchCauseIf

**Catching matching causes**

```efx
const program = effect {
  const failingStream = Stream.fail("NetworkError")
  const recovered = Stream.catchCauseIf(
    failingStream,
    (cause) => Cause.hasFails(cause),
    (cause) => Stream.make(`Recovered: ${Cause.squash(cause)}`)
  )

  const output = await Stream.runCollect(recovered)
  output // => [ 'Recovered: NetworkError' ]
}

await runPromise(program)
```

## orElseIfEmpty

**Switching on empty streams**

```efx
const program = effect {
  const values = await Stream.empty.pipe(
    Stream.orElseIfEmpty(() => Stream.make(1, 2)),
    Stream.runCollect
  )
  values // => [ 1, 2 ]
}

await runPromise(program)
```

## orElseSucceed

**Recovering with a fallback value**

```efx
const program = effect {
  const stream = Stream.fail("NetworkError").pipe(
    Stream.orElseSucceed((error) => `Recovered: ${error}`)
  )

  const values = await Stream.runCollect(stream)
  values // => [ 'Recovered: NetworkError' ]
}

await runPromise(program)
```

## orDie

**Turning failures into defects**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.orDie,
    Stream.runCollect
  )

  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## ignore

**Ignoring stream failures**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.concat(Stream.fail("boom")),
    Stream.ignore,
    Stream.runCollect
  )
  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

**Configuring ignore logging**

```efx
await runPromise(effect {
  const values = await Stream.fail("boom").pipe(
    Stream.ignore({ log: false }),
    Stream.runCollect
  )
  values // => []
})

```

## ignoreCause

**Ignoring stream failure causes**

```efx
await runPromise(effect {
  const values = await Stream.make(1, 2).pipe(
    Stream.concat(Stream.die("boom")),
    Stream.ignoreCause({ log: false }),
    Stream.runCollect
  )
  values // => [1, 2]
})

```

## retry

**Retrying stream failures**

```efx
const program = effect {
  const values = await Stream.make(1).pipe(
    Stream.concat(Stream.fail("boom")),
    Stream.retry(Schedule.recurs(1)),
    Stream.take(2),
    Stream.runCollect
  )

  values // => [ 1, 1 ]
}

await runPromise(program)
```

## withExecutionPlan

**Applying an execution plan**

```efx
class Service extends Context.Service<Service>()("Service", {
  make: succeed({
    stream: Stream.fail("A") as Stream<number, string>
  })
}) {
  static Bad = Layer.succeed(Service, Service.of({ stream: Stream.fail("A") }))
  static Good = Layer.succeed(Service, Service.of({ stream: Stream.make(1, 2, 3) }))
}

const plan = ExecutionPlan.make(
  { provide: Service.Bad },
  { provide: Service.Good }
)

const stream = Stream.unwrap(map(Service, (_) => _.stream))

const program = effect {
  const items = await stream.pipe(Stream.withExecutionPlan(plan), Stream.runCollect)
  items // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## take

**Taking values from the left**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.take(3),
    Stream.runCollect
  )
  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## limitBytes

**Truncating at a byte limit**

```efx
const program = Stream.make(
  new Uint8Array([1, 2]),
  new Uint8Array([3, 4, 5])
).pipe(
  Stream.limitBytes(ByteSize.bytes(4), () => Stream.empty),
  Stream.runCollect,
  map((chunks) => chunks.map((chunk) => [...chunk]))
)

await runPromise(program) // => [[1, 2]]
```

## takeRight

**Taking elements from the right**

```efx
const program = effect {
  const values = await Stream.range(1, 6).pipe(
    Stream.takeRight(3),
    Stream.runCollect
  )
  values // => [ 4, 5, 6 ]
}

await runPromise(program)
```

## takeUntil

**Taking until a predicate matches**

```efx
const stream = Stream.range(1, 5)

const program = effect {
  const inclusive = await stream.pipe(
    Stream.takeUntil((n) => n % 3 === 0),
    Stream.runCollect
  )
  inclusive // => [ 1, 2, 3 ]

  const exclusive = await stream.pipe(
    Stream.takeUntil((n) => n % 3 === 0, { excludeLast: true }),
    Stream.runCollect
  )
  exclusive // => [ 1, 2 ]
}
await runPromise(program)
```

## takeUntilEffect

**Taking until an effectful predicate matches**

```efx
const program = effect {
  const result = await Stream.range(1, 5).pipe(
    Stream.takeUntilEffect((n) => succeed(n % 3 === 0)),
    Stream.runCollect
  )
  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## takeWhile

**Taking while a predicate holds**

```efx
const stream = Stream.range(1, 5).pipe(
  Stream.takeWhile((n) => n % 3 !== 0)
)

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [ 1, 2 ]
}

await runPromise(program)
```

## takeWhileEffect

**Effectfully taking while a predicate holds**

```efx
const program = effect {
  const result = await Stream.range(1, 5).pipe(
    Stream.takeWhileEffect((n) => succeed(n % 3 !== 0)),
    Stream.runCollect
  )
  result // => [ 1, 2 ]
}

await runPromise(program)
```

## drop

**Dropping values from the left**

```efx
const stream = Stream.make(1, 2, 3, 4, 5)
const result = Stream.drop(stream, 2)

const program = effect {
  const items = await Stream.runCollect(result)
  items // => [ 3, 4, 5 ]
}

await runPromise(program)
```

## dropUntil

**Dropping until a predicate matches**

```efx
const stream = Stream.make(1, 2, 3, 4, 5)
const result = Stream.dropUntil(stream, (n) => n >= 3)

await runPromise(effect {
  const output = await Stream.runCollect(result)
  output // => [ 4, 5 ]
})
```

## dropUntilEffect

**Dropping until an effectful predicate matches**

```efx
const program = effect {
  const result = await Stream.range(1, 5).pipe(
    Stream.dropUntilEffect((n) => succeed(n % 3 === 0)),
    Stream.runCollect
  )
  result // => [ 4, 5 ]
}

await runPromise(program)
```

## dropWhile

**Dropping while a predicate holds**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.dropWhile((n) => n < 3),
    Stream.runCollect
  )
  values // => [ 3, 4, 5 ]
}

await runPromise(program)
```

## dropWhileEffect

**Effectfully dropping while a predicate holds**

```efx
const program = effect {
  const result = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.dropWhileEffect((n) => succeed(n < 3)),
    Stream.runCollect
  )
  result // => [ 3, 4, 5 ]
}

await runPromise(program)
```

## dropRight

**Dropping values from the right**

```efx
const program = effect {
  const result = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.dropRight(2),
    Stream.runCollect
  )
  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## chunks

**Exposing stream chunks**

```efx
const program = effect {
  const chunks = await Stream.make(1, 2, 3, 4).pipe(
    Stream.rechunk(2),
    Stream.chunks,
    Stream.runCollect
  )
  chunks // => [ [ 1, 2 ], [ 3, 4 ] ]
}

await runPromise(program)
```

## rechunk

**Rechunking stream elements**

```efx
const program = effect {
  const result = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.rechunk(2),
    Stream.chunks,
    Stream.runCollect
  )
  result // => [ [ 1, 2 ], [ 3, 4 ], [ 5 ] ]
}

await runPromise(program)
```

## sliding

**Emitting sliding windows**

```efx
import { Effect, pipe } from "effect"

await runPromise(effect {
  const result = await Stream.make(1, 2, 3, 4, 5)
    |> Stream.sliding(2)
    |> Stream.runCollect
  result // => [ [ 1, 2 ], [ 2, 3 ], [ 3, 4 ], [ 4, 5 ] ]
})
```

## slidingSize

**Emitting sliding windows with a step size**

```efx
const program = effect {
  const chunks = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.slidingSize(3, 2),
    Stream.runCollect
  )
  chunks // => [ [ 1, 2, 3 ], [ 3, 4, 5 ] ]
}

await runPromise(program)
```

## split

**Splitting on matching values**

```efx
const program = effect {
  const result = await Stream.range(0, 9).pipe(
    Stream.split((n) => n % 4 === 0),
    Stream.runCollect
  )
  result // => [ [ 1, 2, 3 ], [ 5, 6, 7 ], [ 9 ] ]
}

await runPromise(program)
```

## combine

**Combining streams with state**

```efx
const stream = Stream.combine(
  Stream.make("A", "B", "C"),
  Stream.make(1, 2, 3),
  () => true,
  (takeLeft, pullLeft, pullRight) =>
    takeLeft
      ? map(pullLeft, (value) => [`L:${value}`, false] as const)
      : map(pullRight, (value) => [`R:${value}`, true] as const)
)

const program = effect {
  const output = await Stream.runCollect(stream)
  output // => [ 'L:A', 'R:1', 'L:B', 'R:2', 'L:C', 'R:3' ]
}

await runPromise(program)
```

## combineArray

**Combining stream chunks with state**

```efx
const stream = Stream.make(1, 2).pipe(
  Stream.combineArray(
    Stream.make(10, 20),
    () => true,
    (useLeft, pullLeft, pullRight) =>
      effect {
        const array = useLeft ? await pullLeft : await pullRight
        return [array, !useLeft] as const
      }
  )
)

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 1, 2, 10, 20 ]
}

await runPromise(program)
```

## mapAccum

**Statefully mapping stream values**

```efx
import { Console } from "effect"

const program = effect {
  const totals = await Stream.make(0, 1, 2, 3, 4, 5, 6).pipe(
    Stream.mapAccum(() => 0, (total, n) => {
      const next = total + n
      return [next, [next]] as const
    }),
    Stream.runCollect
  )

  totals // => [0, 1, 3, 6, 10, 15, 21]
}

await runPromise(program)
```

## mapAccumArray

**Statefully mapping stream chunks**

```efx
const program = effect {
  const output = await Stream.make(1, 2, 3, 4, 5, 6).pipe(
    Stream.rechunk(2),
    Stream.mapAccumArray(() => 0, (sum: number, chunk) => {
      const next = chunk.reduce((acc, n) => acc + n, sum)
      return [next, [next]]
    }),
    Stream.runCollect
  )
  output // => [ 3, 10, 21 ]
}

await runPromise(program)
```

## mapAccumEffect

**Effectfully mapping stream values with state**

```efx
const program = effect {
  const result = await Stream.make(1, 1, 1).pipe(
    Stream.mapAccumEffect(() => 0, (total, n) =>
      succeed([total + n, [total + n]])
    ),
    Stream.runCollect
  )

  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## mapAccumArrayEffect

**Effectfully mapping stream chunks with state**

```efx
const program = effect {
  const totals = await Stream.make(1, 2, 3, 4).pipe(
    Stream.rechunk(2),
    Stream.mapAccumArrayEffect(() => 0, (total, chunk) =>
      effect {
        const next = chunk.reduce((sum, value) => sum + value, total)
        return [next, [next]] as const
      }
    ),
    Stream.runCollect
  )
  totals // => [ 3, 10 ]
}

await runPromise(program)
```

## scan

**Scanning stream state**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.scan(() => 0, (acc, n) => acc + n),
    Stream.runCollect
  )
  values // => [ 0, 1, 3, 6 ]
}

await runPromise(program)
```

## scanEffect

**Effectfully scanning stream state**

```efx
const program = effect {
  const states = await Stream.make(1, 2, 3).pipe(
    Stream.scanEffect(() => 0, (sum, n) => succeed(sum + n)),
    Stream.runCollect
  )
  states // => [ 0, 1, 3, 6 ]
}
await runPromise(program)
```

## debounce

**Debouncing stream elements**

```efx
const stream = Stream.make(1, 2, 3).pipe(Stream.debounce(Duration.zero))

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 3 ]
}
await runPromise(program)
```

## throttleEffect

**Throttling stream chunks effectfully**

```efx
const stream = Stream.range(0, 5).pipe(
  Stream.rechunk(1),
  Stream.throttleEffect({
    cost: (arr) => succeed(arr.length),
    units: 1,
    duration: 0,
    strategy: "shape"
  })
)

await runPromise(effect {
  const result = await Stream.runCollect(stream)
  result // => [ 0, 1, 2, 3, 4, 5 ]
})
```

## throttle

**Throttling stream chunks**

```efx
const stream = Stream.range(0, 5).pipe(
  Stream.rechunk(1),
  Stream.throttle({
    cost: (arr) => arr.length,
    units: 1,
    duration: 0,
    strategy: "shape"
  })
)

const program = effect {
  const values = await Stream.runCollect(stream)
  values // => [ 0, 1, 2, 3, 4, 5 ]
}
await runPromise(program)
```

## grouped

**Grouping elements by size**

```efx
const program = effect {
  const grouped = await Stream.range(1, 8).pipe(
    Stream.grouped(3),
    Stream.runCollect
  )
  grouped // => [ [ 1, 2, 3 ], [ 4, 5, 6 ], [ 7, 8 ] ]
}

await runPromise(program)
```

## groupedWithin

**Grouping elements by size or time**

```efx
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.groupedWithin(2, "5 seconds"),
    Stream.runCollect
  )
  values // => [ [ 1, 2 ], [ 3 ] ]
}

await runPromise(program)
```

## groupBy

**Grouping elements into keyed substreams using an effectful classifier**

```efx
const program = effect {
  const grouped = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.groupBy((n) =>
      succeed([n % 2 === 0 ? "even" : "odd", n] as const)
    ),
    Stream.mapEffect(
      effect ([key, stream]) => {
        return [key, await Stream.runCollect(stream)] as const
      },
      { concurrency: "unbounded" }
    ),
    Stream.runCollect
  )

  grouped // => [ [ 'odd', [ 1, 3, 5 ] ], [ 'even', [ 2, 4 ] ] ]
}

await runPromise(program)
```

## groupByKey

**Grouping elements by key**

```efx
const program = effect {
  const grouped = await Stream.make(1, 2, 3, 4, 5).pipe(
    Stream.groupByKey((n) => n % 2 === 0 ? "even" : "odd"),
    Stream.mapEffect(
      ([key, stream]) =>
        Stream.runCollect(stream).pipe(
          map((values) => [key, values] as const)
        ),
      { concurrency: "unbounded" }
    ),
    Stream.runCollect
  )
  grouped // => [ [ 'odd', [ 1, 3, 5 ] ], [ 'even', [ 2, 4 ] ] ]
}

await runPromise(program)
```

## transduce

**Transducing with a sink**

```efx
const program = effect {
  const result = await Stream.make(1, 2, 3, 4).pipe(
    Stream.transduce(Sink.take(2)),
    Stream.runCollect
  )

  result // => [ [ 1, 2 ], [ 3, 4 ], [] ]
}
await runPromise(program)
```

## aggregate

**Aggregating with a sink**

```efx
await runPromise(effect {
  const aggregated = await Stream.runCollect(
    Stream.make(1, 2, 3, 4, 5, 6).pipe(
      Stream.aggregate(
        Sink.foldUntil(() => 0, 3, (sum, n) => succeed(sum + n))
      )
    )
  )
  aggregated // => [ 6, 15 ]
})
```

## aggregateWithin

**Aggregating with a sink and schedule**

```efx
await runPromise(effect {
  const aggregated = await Stream.runCollect(
    Stream.make(1, 2, 3, 4, 5, 6).pipe(
      Stream.aggregateWithin(
        Sink.foldUntil(() => 0, 3, (sum, n) => succeed(sum + n)),
        Schedule.forever
      )
    )
  )
  aggregated // => [ 6, 15 ]
})
```

## broadcastN

**Broadcasting to two consumers**

```efx
const program = scoped(
  effect {
    const [left, right] = await Stream.make(1, 2, 3).pipe(
      Stream.broadcastN({ n: 2, capacity: 8 })
    )

    const values = await [
      Stream.runCollect(left),
      Stream.runCollect(right)
    ]

    values // => [ [ 1, 2, 3 ], [ 1, 2, 3 ] ]
  }
)

await runPromise(program)
```

## broadcast

**Broadcasting a stream**

```efx
const program = scoped(
  effect {
    const broadcasted = await Stream.broadcast(Stream.fromArray([1, 2, 3]), {
      capacity: 8,
      replay: 3
    })

    const [left, right] = await [
      Stream.runCollect(broadcasted),
      Stream.runCollect(broadcasted)
    ]

    const result = [left, right] // => [[1, 2, 3], [1, 2, 3]]
  }
)

await runPromise(program)
```

## share

**Sharing a stream**

```efx
const result = await runPromise(
  scoped(
    effect {
      const firstReady = await Deferred.make<void>()
      const secondReady = await Deferred.make<void>()
      const acquisitions = await Ref.make(0)
      const source = Stream.fromEffect(Ref.update(acquisitions, (n) => n + 1)).pipe(
        Stream.drain,
        Stream.concat(Stream.make(0)),
        Stream.concat(
          Stream.fromEffect(all([Deferred.await(firstReady), Deferred.await(secondReady)])).pipe(Stream.drain)
        ),
        Stream.concat(Stream.make(1, 2, 3))
      )
      const shared = await Stream.share(source, { capacity: 16, replay: 1 })
      const consume = (ready: Deferred<void>) =>
        shared.pipe(
          Stream.tap((value) => value === 0 ? Deferred.succeed(ready, void 0) : Effect.void),
          Stream.filter((value) => value !== 0),
          Stream.runCollect
        )

      const values = await [consume(firstReady), consume(secondReady)]
      return { values, acquisitions: await Ref.get(acquisitions) }
    }
  )
)
result // => { values: [[1, 2, 3], [1, 2, 3]], acquisitions: 1 }
```

## pipeThroughChannel

**Piping through a channel**

```efx
import { Array } from "effect"

type NumberChunk = readonly [number, ...Array<number>]

const doubleChunks = Channel.identity<NumberChunk, never, unknown>().pipe(
  Channel.map((chunk) => Array.map(chunk, (n) => n * 2))
)

const program = effect {
  const result = await Stream.fromArray([1, 2, 3]).pipe(
    Stream.rechunk(2),
    Stream.pipeThroughChannel(doubleChunks),
    Stream.runCollect
  )
  result // => [ 2, 4, 6 ]
}

await runPromise(program)
```

## pipeThroughChannelOrFail

**Piping through a channel with failures**

```efx
import { Array } from "effect"

type NumberChunk = readonly [number, ...Array<number>]

const stringifyChunks = Channel.identity<NumberChunk, "StreamError", unknown>().pipe(
  Channel.map((chunk) => Array.map(chunk, String))
)

await runPromise(effect {
  const result = await Stream.make(1, 2, 3).pipe(
    Stream.rechunk(2),
    Stream.pipeThroughChannelOrFail(stringifyChunks),
    Stream.runCollect
  )

  result // => ["1", "2", "3"]
})
```

## pipeThrough

**Piping through a sink**

```efx
const program = effect {
  const leftovers = await Stream.make(1, 2, 3, 4).pipe(
    Stream.pipeThrough(Sink.take(2)),
    Stream.runCollect
  )

  leftovers // => [ 3, 4 ]
}

await runPromise(program)
```

## collect

**Collecting values into a stream element**

```efx
const stream = Stream.make(1, 2, 3)

const program = effect {
  const collected = await stream.pipe(Stream.collect, Stream.runCollect)
  collected[0] // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## accumulate

**Accumulating stream elements**

```efx
const program = effect {
  const accumulated = await Stream.runCollect(
    Stream.fromArray([1, 2, 3]).pipe(
      Stream.rechunk(1),
      Stream.accumulate
    )
  )
  accumulated // => [ [ 1 ], [ 1, 2 ], [ 1, 2, 3 ] ]
}

await runPromise(program)
```

## changes

**Emitting changed values**

```efx
const program = effect {
  const values = await Stream.fromIterable([1, 1, 2, 2, 3]).pipe(
    Stream.changes,
    Stream.runCollect
  )

  values // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## changesWith

**Emitting values that changed by equivalence**

```efx
const stream = Stream.make("A", "a", "B", "b", "b").pipe(
  Stream.changesWith((left, right) => left.toLowerCase() === right.toLowerCase())
)

await runPromise(
  effect {
    const values = await Stream.runCollect(stream)
    values // => [ 'A', 'B' ]
  }
)
```

## changesWithEffect

**Effectfully emitting changed values**

```efx
const program = effect {
  const stream = Stream.make(1, 1, 2, 2, 3, 3).pipe(
    Stream.changesWithEffect((a, b) => succeed(a === b))
  )
  const result = await Stream.runCollect(stream)
  result // => [ 1, 2, 3 ]
}

await runPromise(program)
```

## decodeText

**Decoding Uint8Array chunks into strings using TextDecoder with an optional encoding**

```efx
const encoder = new TextEncoder()
const stream = Stream.make(
  encoder.encode("Hello"),
  encoder.encode(" World")
)

const program = effect {
  const decoded = await stream.pipe(
    Stream.decodeText,
    Stream.runCollect
  )
  decoded // => [ 'Hello', ' World' ]
}

await runPromise(program)
```

## encodeText

**Encoding a stream of strings into UTF-8 Uint8Array chunks**

```efx
const stream = Stream.make("Hello", " ", "World")
const program = effect {
  const encoded = Stream.encodeText(stream)
  const chunks = await Stream.runCollect(encoded)
  const bytes = chunks.map((chunk) => [...chunk])
  bytes // => [ [ 72, 101, 108, 108, 111 ], [ 32 ], [ 87, 111, 114, 108, 100 ] ]
}

await runPromise(program)
```

## splitLines

**Splitting streamed text into lines**

```efx
await runPromise(effect {
  const lines = await Stream.runCollect(
    Stream.make("a\nb\r\n", "c\n").pipe(Stream.splitLines)
  )
  lines // => [ 'a', 'b', 'c' ]
})
```

## intersperse

**Interspersing stream elements**

```efx
import { Console } from "effect"

const program = effect {
  const stream = Stream.make(1, 2, 3, 4).pipe(Stream.intersperse(0))
  const result = await Stream.runCollect(stream)
  result // => [1, 0, 2, 0, 3, 0, 4]
}

await runPromise(program)
```

## intersperseAffixes

**Interspersing stream affixes**

```efx
import { Console } from "effect"

const stream = Stream.make("a", "b", "c").pipe(
  Stream.intersperseAffixes({ start: "[", middle: ",", end: "]" })
)

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => ["[", "a", ",", "b", ",", "c", "]"]
}

await runPromise(program)
```

## interleave

**Interleaving streams**

```efx
const stream = Stream.interleave(
  Stream.make(2, 3),
  Stream.make(5, 6, 7)
)

const program = effect {
  const collected = await Stream.runCollect(stream)
  collected // => [ 2, 5, 3, 6, 7 ]
}

await runPromise(program)
```

## interleaveWith

**Interleaving two streams deterministically by following a boolean decider stream**

```efx
const program = effect {
  const left = Stream.make(1, 3, 5)
  const right = Stream.make(2, 4, 6)
  const decider = Stream.make(true, false, false, true, true)

  const values = await Stream.runCollect(
    Stream.interleaveWith(left, right, decider)
  )

  values // => [ 1, 2, 4, 3, 5 ]
}

await runPromise(program)
```

## interruptWhen

**Interrupting when an effect completes**

```efx
const program = effect {
  const interrupt = await Deferred.make<void>()
  const stream = Stream.make(1, 2, 3).pipe(
    Stream.tap((value) =>
      value === 2
        ? Deferred.succeed(interrupt, void 0)
        : Effect.void
    ),
    Stream.interruptWhen(Deferred.await(interrupt))
  )

  const result = await Stream.runCollect(stream)
  result // => [ 1 ]
}

await runPromise(program)
```

## haltWhen

**Halting a stream after an effect completes**

```efx
const program = effect {
  const halt = await Deferred.make<void>()
  const values = await Stream.fromArray([1, 2, 3]).pipe(
    Stream.tap((value) => value === 2 ? Deferred.succeed(halt, void 0) : Effect.void),
    Stream.haltWhen(Deferred.await(halt)),
    Stream.runCollect
  )
  values // => [ 1, 2 ]
}

await runPromise(program)
```

## onExit

**Running a finalizer on exit**

```efx
const exits: Array<string> = []
const stream = Stream.make(1, 2, 3).pipe(
  Stream.onExit((exit) =>
    Exit.isSuccess(exit)
      ? sync(() => exits.push("success"))
      : sync(() => exits.push("failure"))
  )
)

await runPromise(effect {
  await Stream.runCollect(stream)
})
exits // => ["success"]
```

## onError

**Running an effect on errors**

```efx
const errors: Array<string> = []
const program = effect {
  const stream = Stream.make(1, 2, 3).pipe(
    Stream.concat(Stream.fail("boom")),
    Stream.onError((cause) => sync(() => errors.push(String(Cause.squash(cause)))))
  )

  await Stream.runCollect(stream)
}

await runPromise(exit(program))
errors // => ["boom"]
```

## onStart

**Running an effect on start**

```efx
const events: Array<string> = []
const program = effect {
  const stream = Stream.fromArray([1, 2, 3]).pipe(
    Stream.onStart(sync(() => events.push("started")))
  )

  const values = await Stream.runCollect(stream)
  values // => [1, 2, 3]
}

await runPromise(program)
events // => ["started"]
```

## onFirst

**Running an effect on the first value**

```efx
const first: Array<number> = []
await runPromise(effect {
  await Stream.fromArray([1, 2, 3]).pipe(
    Stream.onFirst((value) => sync(() => first.push(value))),
    Stream.runDrain
  )
})
first // => [1]
```

## onEnd

**Running an effect on end**

```efx
const events: Array<string> = []
const program = effect {
  const values = await Stream.make(1, 2, 3).pipe(
    Stream.onEnd(sync(() => events.push("ended"))),
    Stream.runCollect
  )
  values // => [1, 2, 3]
}

await runPromise(program)
events // => ["ended"]
```

## ensuring

**Ensuring finalization**

```efx
const events: Array<string> = []
const stream = Stream.fromArray([1, 2]).pipe(
  Stream.ensuring(sync(() => events.push("cleanup")))
)

const program = effect {
  const collected = await Stream.runCollect(stream)
  collected // => [1, 2]
}

await runPromise(program)
events // => ["cleanup"]
```

## provide

**Providing stream requirements**

```efx
import { Console } from "effect"

service Env { readonly name: string }

const layer = Layer.succeed(Env)({ name: "Ada" })

const stream = Stream.fromEffect(
  effect {
    const env = await service(Env)
    return `Hello, ${env.name}`
  }
)

const withEnv = stream.pipe(Stream.provide(layer))

await runPromise(Stream.runCollect(withEnv)) // => ["Hello, Ada"]
```

## provideContext

**Providing multiple services to the stream using a context**

```efx
service Config { readonly prefix: string }
service Greeter { greet: (name: string) => string }

const context = Context.make(Config, { prefix: "Hello" }).pipe(
  Context.add(Greeter, { greet: (name: string) => `${name}!` })
)

const stream = Stream.fromEffect(
  effect {
    const config = await service(Config)
    const greeter = await service(Greeter)
    return greeter.greet(config.prefix)
  }
)

const program = effect {
  const result = await Stream.runCollect(Stream.provideContext(stream, context))
  result // => [ 'Hello!' ]
}

await runPromise(program)
```

## provideService

**Providing a stream service**

```efx
service Greeter {
  greet: (name: string) => string
}

const stream = Stream.fromEffect(
  service(Greeter).pipe(
    map((greeter) => greeter.greet("Ada"))
  )
)

const program = effect {
  const collected = await Stream.runCollect(
    stream.pipe(
      Stream.provideService(Greeter, {
        greet: (name) => `Hello, ${name}`
      })
    )
  )
  collected // => [ 'Hello, Ada' ]
}

await runPromise(program)
```

## provideServiceEffect

**Providing a stream service effectfully**

```efx
service ApiConfig { readonly baseUrl: string }

const stream = Stream.fromEffect(
  effect {
    const config = await service(ApiConfig)
    return config.baseUrl
  }
)

const events: Array<string> = []
const withConfig = stream.pipe(
  Stream.provideServiceEffect(
    ApiConfig,
    succeed({ baseUrl: "https://example.com" }).pipe(
      tap(() => sync(() => events.push("loading")))
    )
  )
)

await runPromise(Stream.runCollect(withConfig)) // => ["https://example.com"]
events // => ["loading"]
```

## updateContext

**Updating the stream context**

```efx
service Logger { prefix: string }
service Config { name: string }

const stream = Stream.fromEffect(
  effect {
    const logger = await service(Logger)
    const config = await service(Config)
    return `${logger.prefix}${config.name}`
  }
)

const updated = stream.pipe(
  Stream.updateContext((context: Context<Logger>) =>
    Context.add(context, Config, { name: "World" })
  )
)

const program = effect {
  const values = await Stream.runCollect(updated)
  values // => [ 'Hello World' ]
}

await runPromise(
  provideService(program, Logger, { prefix: "Hello " })
)
```

## updateService

**Updating a stream service**

```efx
service Counter { count: number }

const stream = Stream.fromEffect(service(Counter)).pipe(
  Stream.updateService(Counter, (counter) => ({ count: counter.count + 1 }))
)

const program = effect {
  const counters = await Stream.runCollect(stream)
  const message = `Updated count: ${counters[0].count}` // => "Updated count: 1"
}

await runPromise(provideService(program, Counter, { count: 0 }))
```

## withSpan

**Wrapping a stream in a span**

```efx
const stream = Stream.fromArray([1, 2, 3]).pipe(Stream.withSpan("numbers"))

await runPromise(
  effect {
    const values = await Stream.runCollect(stream)
    values // => [ 1, 2, 3 ]
  }
)
```

## Do

**Starting stream do notation**

```efx
import { Effect, pipe } from "effect"

const program = Stream.Do
  |> Stream.bind("value", () => Stream.fromArray([1, 2]))
  |> Stream.let("next", ({ value }) => value + 1)

const effect = effect {
  const collected = await Stream.runCollect(program)
  collected // => [ { value: 1, next: 2 }, { value: 2, next: 3 } ]
}

await runPromise(effect)
```

## let

**Adding a computed field**

```efx
const stream = Stream.Do.pipe(
  Stream.let("x", () => 2),
  Stream.let("y", ({ x }) => x * 3)
)

const program = effect {
  const records = await Stream.runCollect(stream)
  records // => [ { x: 2, y: 6 } ]
}

await runPromise(program)
```

## bind

**Binding a stream value**

```efx
const program = Stream.Do.pipe(
  Stream.bind("a", () => Stream.make(1, 2)),
  Stream.bind("b", ({ a }) => Stream.succeed(a + 1))
)

const result = Stream.runCollect(program)

await runPromise(result) // => [{ a: 1, b: 2 }, { a: 2, b: 3 }]
```

## bindEffect

**Binding an effect value**

```efx
const stream = Stream.Do.pipe(
  Stream.bind("value", () => Stream.make(1, 2)),
  Stream.bindEffect("double", ({ value }) => succeed(value * 2))
)

const program = effect {
  const result = await Stream.runCollect(stream)
  result // => [ { value: 1, double: 2 }, { value: 2, double: 4 } ]
}

await runPromise(program)
```

## bindTo

**Binding values to a record key**

```efx
const stream = Stream.make(1, 2, 3).pipe(Stream.bindTo("value"))

await runPromise(Stream.runCollect(stream)) // => [{ value: 1 }, { value: 2 }, { value: 3 }]
```

## run

**Running a stream with a sink**

```efx
const program = Stream.run(Stream.make(1, 2, 3), Sink.sum)

await runPromise(program) // => 6
```

## runCollect

**Collecting stream values**

```efx
const stream = Stream.make(1, 2, 3, 4, 5)

const program = effect {
  const collected = await Stream.runCollect(stream)
  collected // => [ 1, 2, 3, 4, 5 ]
}

await runPromise(program)
```

## runCount

**Counting stream values**

```efx
const stream = Stream.make(1, 2, 3, 4, 5)

const program = effect {
  const count = await Stream.runCount(stream)
  count // => 5
}

await runPromise(program)
```

## runSum

**Summing stream values**

```efx
const program = effect {
  const total = await Stream.runSum(Stream.make(1, 2, 3))
  total // => 6
}

await runPromise(program)
```

## runFold

**Folding stream values**

```efx
const program = effect {
  const total = await Stream.runFold(
    Stream.make(1, 2, 3),
    () => 0,
    (acc, n) => acc + n
  )
  total // => 6
}

await runPromise(program)
```

## runFoldEffect

**Effectfully folding stream values**

```efx
const program = effect {
  const total = await Stream.runFoldEffect(
    Stream.make(1, 2, 3),
    () => 0,
    (acc, n) => succeed(acc + n)
  )
  total // => 6
}

await runPromise(program)
```

## runHead

**Getting the first stream value**

```efx
const program = effect {
  const head = await Stream.runHead(Stream.make(1, 2, 3))
  Option.getOrThrow(head) // => 1
}

await runPromise(program)
```

## runForEach

**Running an effect for each value**

```efx
const stream = Stream.make(1, 2, 3)
const values: Array<string> = []

const program = effect {
  await Stream.runForEach(stream, (n) => sync(() => values.push(`Processing: ${n}`)))
}

await runPromise(program)
values // => ["Processing: 1", "Processing: 2", "Processing: 3"]
```

## runForEachWhile

**Running effects while a predicate holds**

```efx
const values: Array<number> = []
const program = effect {
  const stream = Stream.make(1, 2, 3, 4, 5)

  await Stream.runForEachWhile(stream, (n) =>
    effect {
      await sync(() => values.push(n))
      return n < 3
    }
  )
}

await runPromise(program)
values // => [1, 2, 3]
```

## runForEachArray

**Consuming stream chunks**

```efx
const stream = Stream.make(1, 2, 3, 4, 5)
const chunks: Array<string> = []
const program = effect {
  await Stream.runForEachArray(
    stream,
    (chunk) => sync(() => chunks.push(chunk.join(", ")))
  )
}

await runPromise(program)
chunks // => ["1, 2, 3, 4, 5"]
```

## runDrain

**Draining a stream run**

```efx
const values: Array<number> = []
const program = effect {
  const stream = Stream.make(1, 2, 3).pipe(
    Stream.mapEffect((n) => sync(() => values.push(n)))
  )

  await Stream.runDrain(stream)
}

await runPromise(program)
values // => [1, 2, 3]
```

## toPull

**Creating a scoped pull**

```efx
const stream = Stream.make(1, 2, 3)

const program = scoped(
  effect {
    const pull = await Stream.toPull(stream)
    const chunk = await pull
    chunk // => [ 1, 2, 3 ]
  }
)

await runPromise(program)
```

## mkString

**Joining strings from a stream**

```efx
const stream = Stream.make("Hello", " ", "World", "!")
const program = effect {
  const text = await Stream.mkString(stream)
  text // => "Hello World!"
}

await runPromise(program)
```

## mkArrayBuffer

**Joining byte chunks into an ArrayBuffer**

```efx
const program = Stream.make(
  new Uint8Array([1, 2]),
  new Uint8Array([3, 4])
).pipe(
  Stream.mkArrayBuffer,
  map((buffer) => [...new Uint8Array(buffer)])
)

await runPromise(program) // => [1, 2, 3, 4]
```

## mkUint8Array

**Joining Uint8Array chunks**

```efx
const stream = Stream.make(new Uint8Array([1, 2]), new Uint8Array([3, 4]))
const program = effect {
  const bytes = await Stream.mkUint8Array(stream)
  const values = Array.from(bytes) // => [1, 2, 3, 4]
}

await runPromise(program)
```

## toReadableStreamWith

**Converting to a ReadableStream with services**

```efx
import { Context, Stream } from "effect"

const stream = Stream.make(1, 2, 3, 4, 5)
const readableStream = Stream.toReadableStreamWith(stream, Context.empty())
const values = await Array.fromAsync(readableStream)
values // => [ 1, 2, 3, 4, 5 ]
```

## toReadableStream

**Converting a stream to a ReadableStream**

```efx
import { Stream } from "effect"

const readableStream = Stream.toReadableStream(Stream.make(1, 2, 3))
const values = await Array.fromAsync(readableStream)
values // => [ 1, 2, 3 ]
```

## toReadableStreamEffect

**Creating a ReadableStream effect**

```efx
const stream = Stream.make(1, 2, 3, 4, 5)

const effect = effect {
  const readableStream = await Stream.toReadableStreamEffect(stream)
  readableStream instanceof ReadableStream // => true
}

await runPromise(effect)
```

## toAsyncIterableWith

**Converting to an AsyncIterable with services**

```efx
import { Context, Stream } from "effect"

const stream = Stream.make(1, 2, 3)
const iterable = Stream.toAsyncIterableWith(stream, Context.empty())

await Array.fromAsync(iterable) // => [1, 2, 3]
```

## toAsyncIterableEffect

**Creating an AsyncIterable effect**

```efx
const stream = Stream.make(1, 2, 3)

const program = effect {
  const iterable = await Stream.toAsyncIterableEffect(stream)
  return await promise(() => Array.fromAsync(iterable))
}

await runPromise(program) // => [1, 2, 3]
```

## toAsyncIterable

**Converting to an async iterable**

```efx
import { Stream } from "effect"

const stream = Stream.make(1, 2, 3)

await Array.fromAsync(Stream.toAsyncIterable(stream)) // => [1, 2, 3]
```

## runIntoPubSub

**Running a stream into a PubSub**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.unbounded<number>()
  const subscription = await PubSub.subscribe(pubsub)

  await Stream.runIntoPubSub(Stream.fromIterable([1, 2]), pubsub)

  const first = await PubSub.take(subscription)
  const second = await PubSub.take(subscription)

  first // => 1
  second // => 2
})

await runPromise(program)
```

## toPubSub

**Converting a stream to a PubSub for concurrent consumption**

```efx
const program = scoped(effect {
  const pubsub = await Stream.fromArray([1, 2]).pipe(
    Stream.toPubSub({ capacity: 8 })
  )
  const subscription = await PubSub.subscribe(pubsub)
  const first = await PubSub.take(subscription)

  first // => 1
})
await runPromise(program)
```

## toPubSubTake

**Converting to a PubSub of takes**

```efx
const program = effect {
  const pubsub = await Stream.fromArray([1, 2, 3]).pipe(
    Stream.toPubSubTake({ capacity: 8 })
  )
  const subscription = await PubSub.subscribe(pubsub)
  const take = await PubSub.take(subscription)

  if (Array.isArray(take)) {
    take // => [ 1, 2, 3 ]
  }
}
await runPromise(scoped(program))
```

## toQueue

**Converting a stream to a Queue for concurrent consumption**

```efx
const program = effect {
  const queue = await Stream.toQueue(Stream.fromIterable([1, 2, 3]), { capacity: 8 })
  const chunk = await Queue.takeBetween(queue, 1, 3)
  chunk // => [ 1, 2, 3 ]
}
await runPromise(scoped(program))
```

## runIntoQueue

**Running a stream into a queue**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(4)

  await forkChild(
    Stream.runIntoQueue(Stream.fromIterable([1, 2, 3]), queue)
  )

  const values = [
    await Queue.take(queue),
    await Queue.take(queue),
    await Queue.take(queue)
  ]
  const done = await flip(Queue.take(queue))

  values // => [ 1, 2, 3 ]
  done._tag === "Done" // => true
}
await runPromise(program)
```
