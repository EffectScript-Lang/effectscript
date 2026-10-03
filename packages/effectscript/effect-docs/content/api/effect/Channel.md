# effect/Channel

The examples in the JSDoc of `packages/effect/src/Channel.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## isChannel

**Checking for channels**

```efx
import { Channel } from "effect"

const channel = Channel.succeed(42)
Channel.isChannel(channel) // => true
Channel.isChannel("not a channel") // => false
```

## Channel

**Typing channels**

```efx
// A channel that outputs numbers and requires no environment
type NumberChannel = Channel<number>

// A channel that outputs strings, can fail with Error, completes with boolean
type StringChannel = Channel<string, Error, boolean>

// A channel with all type parameters specified
type FullChannel = Channel<
  string, // OutElem - output elements
  Error, // OutErr - output errors
  number, // OutDone - completion value
  number, // InElem - input elements
  string, // InErr - input errors
  boolean, // InDone - input completion
  { db: string } // Env - required environment
>

const channel: NumberChannel = Channel.succeed(1)
runSync(Channel.runCollect(channel)) // => [1]
```

## fromTransform

**Creating channels from transforms**

```efx
const channel = Channel.fromTransform((upstream, scope) =>
  succeed(upstream)
)
await runPromise(Channel.runCollect(channel)) // => []
```

## transformPull

**Transforming pull behavior**

```efx
// Transform a channel by modifying its pull behavior
const originalChannel = Channel.fromIterable([1, 2, 3])

const transformedChannel = Channel.transformPull(
  originalChannel,
  (pull, scope) =>
    succeed(
      map(pull, (value) => value * 2)
    )
)
await runPromise(Channel.runCollect(transformedChannel)) // => [2, 4, 6]
```

## fromPull

**Creating channels from pulls**

```efx
const channel = Channel.fromPull(sync(() => {
  let emitted = false
  return suspend(() => {
    if (emitted) return Cause.done()
    emitted = true
    return succeed(42)
  })
}))
await runPromise(Channel.runCollect(channel)) // => [42]
```

## toTransform

**Extracting channel transforms**

```efx
const channel = Channel.succeed(42)
const transform = Channel.toTransform(channel)
typeof transform // => "function"
runSync(Channel.runCollect(channel)) // => [42]
```

## DefaultChunkSize

**Reading the default chunk size**

```efx
import { Channel } from "effect"

Channel.DefaultChunkSize // => 4096
```

## callback

**Creating channels from callbacks**

```efx
const channel = Channel.callback<number>((queue) =>
  effect {
    await Queue.offer(queue, 1)
    await Queue.offer(queue, 2)
    await Queue.offer(queue, 3)
    await Queue.end(queue)
  }
)
await runPromise(Channel.runCollect(channel)) // => [1, 2, 3]
```

## callbackArray

**Creating array channels from callbacks**

```efx
const channel = Channel.callbackArray<number>(Effect.fn(function*(queue) {
  yield* Queue.offer(queue, 1)
  yield* Queue.offer(queue, 2)
  yield* Queue.end(queue)
}))
await runPromise(Channel.runCollect(channel)) // => [[1, 2]]
```

## suspend

**Suspending channel creation**

```efx
const channel = Channel.suspend(() => Channel.succeed(42))
runSync(Channel.runCollect(channel)) // => [42]
```

## acquireUseRelease

**Managing resources with acquire-use-release**

```efx
const released: Array<string> = []
const channel = Channel.acquireUseRelease(
  succeed("resource"),
  (resource) => Channel.succeed(resource.toUpperCase()),
  (resource, exit) => sync(() => released.push(resource))
)
const observed = [await runPromise(Channel.runCollect(channel)), released] // => [["RESOURCE"], ["resource"]]
```

## acquireRelease

**Managing resources with acquire-release**

```efx
const released: Array<string> = []
const channel = Channel.acquireRelease(
  succeed("resource"),
  (resource, exit) => sync(() => released.push(resource))
)
const observed = [await runPromise(Channel.runCollect(channel)), released] // => [["resource"], ["resource"]]
```

## fromIterator

**Creating channels from iterators**

```efx
const numbers = [1, 2, 3, 4, 5]
const channel = Channel.fromIterator(() => numbers[Symbol.iterator]())
runSync(Channel.runCollect(channel)) // => [1, 2, 3, 4, 5]
```

## fromArray

**Creating channels from arrays**

```efx
const channel = Channel.fromArray([1, 2, 3, 4, 5])
runSync(Channel.runCollect(channel)) // => [1, 2, 3, 4, 5]
```

## fromChunk

**Creating channels from chunks**

```efx
const chunk = Chunk.make(1, 2, 3)
const channel = Channel.fromChunk(chunk)
runSync(Channel.runCollect(channel)) // => [1, 2, 3]
```

## fromIteratorArray

**Batching iterator output**

```efx
// Create a channel from a simple iterator
const numberIterator = (): Iterator<number, string> => {
  let count = 0
  return {
    next: () => {
      if (count < 3) {
        return { value: count++, done: false }
      }
      return { value: "finished", done: true }
    }
  }
}

const channel = Channel.fromIteratorArray(() => numberIterator(), 2)
runSync(Channel.runCollect(channel)) // => [[0, 1], [2]]
```

**Batching generator output**

```efx
// Create channel from a generator function
function* fibonacci(): Generator<number, void, unknown> {
  let a = 0, b = 1
  for (let i = 0; i < 5; i++) {
    yield a
    ;[a, b] = [b, a + b]
  }
}

const fibChannel = Channel.fromIteratorArray(() => fibonacci(), 3)
runSync(Channel.runCollect(fibChannel)) // => [[0, 1, 1], [2, 3]]
```

## fromIterable

**Creating channels from iterables**

```efx
const set = new Set([1, 2, 3])
const channel = Channel.fromIterable(set)
runSync(Channel.runCollect(channel)) // => [1, 2, 3]
```

## fromIterableArray

**Batching iterable output**

```efx
const numbers = [1, 2, 3, 4, 5]
const channel = Channel.fromIterableArray(numbers, 4)
runSync(Channel.runCollect(channel)) // => [[1, 2, 3, 4], [5]]
```

## succeed

**Creating channels that succeed**

```efx
const channel = Channel.succeed(42)
runSync(Channel.runCollect(channel)) // => [42]
```

## end

**Ending with a value**

```efx
const channel = Channel.end("done")
runSync(Channel.runCollect(channel)) // => []
```

## sync

**Computing values lazily**

```efx
let requests = 0

const channel = Channel.sync(() => {
  requests += 1
  return `request-${requests}`
})
runSync(Channel.runCollect(channel)) // => ["request-1"]
```

## empty

**Creating empty channels**

```efx
// Create an empty channel
const emptyChannel = Channel.empty

// Use empty channel in composition
const combined = Channel.concatWith(emptyChannel, () => Channel.succeed(42))
// Will immediately provide the second channel's output

// Empty channel can be used as a no-op in conditional logic
const conditionalChannel = (shouldEmit: boolean) =>
  shouldEmit ? Channel.succeed("data") : Channel.empty

runSync(Channel.runCollect(conditionalChannel(true))) // => ["data"]
```

## never

**Creating non-terminating channels**

```efx
import { Channel } from "effect"

// Create a channel that never completes
const neverChannel = Channel.never

// Use in conditional logic
const withFallback = Channel.concatWith(
  neverChannel,
  () => Channel.succeed("fallback")
)

// Never channel is useful for testing or as a placeholder
const conditionalChannel = (shouldComplete: boolean) =>
  shouldComplete ? Channel.succeed("done") : Channel.never

Channel.isChannel(conditionalChannel(false)) // => true
```

## fail

**Failing with an error**

```efx
import { Channel, Effect, Exit } from "effect"

const failedChannel = Channel.fail("Something went wrong")
runSync(exit(Channel.runCollect(failedChannel))) // => Exit.fail("Something went wrong")
```

## failSync

**Failing with a lazy error**

```efx
import { Channel, Effect, Exit } from "effect"

let attempts = 0
const conditionalError = Channel.failSync(() => {
  attempts += 1
  return `Error after attempt ${attempts}`
})
const observed = [
  runSync(exit(Channel.runCollect(conditionalError))),
  attempts
] // => [Exit.fail("Error after attempt 1"), 1]
```

## failCause

**Failing with causes**

```efx
import { Cause, Channel, Effect, Exit } from "effect"

const simpleCause = Cause.fail("Simple error")
const failedChannel = Channel.failCause(simpleCause)
runSync(exit(Channel.runCollect(failedChannel))) // => Exit.failCause(simpleCause)
```

## failCauseSync

**Failing with lazy causes**

```efx
import { Cause, Channel, Effect, Exit } from "effect"

// Create a channel that fails with a lazily computed cause
let attempts = 0
const failedChannel = Channel.failCauseSync(() => {
  attempts += 1
  return Cause.fail(`Runtime error after attempt ${attempts}`)
})

const observed = [
  runSync(exit(Channel.runCollect(failedChannel))),
  attempts
] // => [Exit.fail("Runtime error after attempt 1"), 1]
```

## die

**Dying with defects**

```efx
import { Cause, Channel, Effect, Exit } from "effect"

const defect = "Unrecoverable error"
const diedChannel = Channel.die(defect)
runSync(exit(Channel.runCollect(diedChannel))) // => Exit.failCause(Cause.die(defect))
```

## fromEffect

**Creating channels from effects**

```efx
const successChannel = Channel.fromEffect(
  succeed("Hello from effect!")
)
runSync(Channel.runCollect(successChannel)) // => ["Hello from effect!"]
```

## fromQueue

**Creating channels from queues**

```efx
const program = effect {
  const queue = await Queue.bounded<string, Cause.Done>(3)
  await Queue.offerAll(queue, ["item1", "item2", "item3"])
  await Queue.end(queue)
  const channel = Channel.fromQueue(queue)
  return await Channel.runCollect(channel)
}
await runPromise(program) // => ["item1", "item2", "item3"]
```

## fromQueueArray

**Creating batched channels from queues**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(4)
  await Queue.offerAll(queue, [1, 2, 3, 4])
  await Queue.end(queue)
  const arrayChannel = Channel.fromQueueArray(queue)
  return await Channel.runCollect(arrayChannel)
}
await runPromise(program) // => [[1, 2, 3, 4]]
```

## fromSubscription

**Creating channels from subscriptions**

```efx
import { Channel, Data, Effect, Option } from "effect"

class SubscriptionError extends Data.TaggedError("SubscriptionError")<{
  readonly reason: string
}> {}

const program = effect {
  // Create a PubSub
  const pubsub = await PubSub.bounded<string>(32)

  // Create a subscription
  const subscription = await PubSub.subscribe(pubsub)

  // Publish some messages
  await PubSub.publish(pubsub, "Hello")
  await PubSub.publish(pubsub, "World")
  await PubSub.publish(pubsub, "from")
  await PubSub.publish(pubsub, "PubSub")

  // Create a channel from the subscription
  const channel = Channel.fromSubscription(subscription)

  // The channel will receive all published messages
  return channel
}
const result = scoped(flatMap(program, Channel.runHead))
await runPromise(result) // => Option.some("Hello")

// Real-time notifications example
const notificationChannel = effect {
  const eventBus = await PubSub.unbounded<{ type: string; payload: any }>()
  const userSubscription = await PubSub.subscribe(eventBus)

  return Channel.fromSubscription(userSubscription)
}
```

## fromSubscriptionArray

**Batching subscription values**

```efx
import { Channel, Data, Effect, Option } from "effect"

class StreamError extends Data.TaggedError("StreamError")<{
  readonly message: string
}> {}

const program = effect {
  const pubsub = await PubSub.bounded<number>(16)
  const subscription = await PubSub.subscribe(pubsub)

  // Create a channel that reads arrays of values
  const channel = Channel.fromSubscriptionArray(subscription)

  // Publish some values
  await PubSub.publish(pubsub, 1)
  await PubSub.publish(pubsub, 2)
  await PubSub.publish(pubsub, 3)
  await PubSub.publish(pubsub, 4)

  // The channel will output arrays like [1, 2, 3] and [4]
  return channel
}
const result = scoped(flatMap(program, Channel.runHead))
await runPromise(result) // => Option.some([1, 2, 3, 4])
```

**Processing subscription values in batches**

```efx
import { Channel, Data, Effect, Option } from "effect"

class BatchProcessingError extends Data.TaggedError("BatchProcessingError")<{
  readonly reason: string
}> {}

const batchProcessor = effect {
  const pubsub = await PubSub.bounded<string>(32)
  const subscription = await PubSub.subscribe(pubsub)

  // Create a channel that processes items in batches
  const batchChannel = Channel.fromSubscriptionArray(subscription)

  // Transform to process each batch
  const processedChannel = Channel.map(batchChannel, (batch) =>
    batch.map((item) => item.toUpperCase())
  )

  await PubSub.publishAll(pubsub, ["one", "two"])
  return processedChannel
}
const batch = scoped(flatMap(batchProcessor, Channel.runHead))
await runPromise(batch) // => Option.some(["ONE", "TWO"])
```

**Aggregating subscription metrics**

```efx
const metricsAggregator = effect {
  const metricsPubSub = await PubSub.bounded<
    { timestamp: number; value: number }
  >(100)
  const subscription = await PubSub.subscribe(metricsPubSub)

  // Create a channel that collects metrics in chunks
  const metricsChannel = Channel.fromSubscriptionArray(subscription)

  // Transform to calculate aggregate statistics
  const aggregatedChannel = Channel.map(metricsChannel, (metrics) => {
    const values = metrics.map((m) => m.value)
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)

    return {
      count: values.length,
      sum,
      average: avg,
      min,
      max,
      firstTimestamp: Math.min(...metrics.map((m) => m.timestamp)),
      lastTimestamp: Math.max(...metrics.map((m) => m.timestamp))
    }
  })

  await PubSub.publish(metricsPubSub, { timestamp: 1, value: 10 })
  return aggregatedChannel
}
const metric = scoped(flatMap(metricsAggregator, Channel.runHead))
const result = await runPromise(metric)
Option.map(result, ({ count, sum, average, min, max }) => ({ count, sum, average, min, max })) // => Option.some({ count: 1, sum: 10, average: 10, min: 10, max: 10 })
```

## fromPubSub

**Creating channels from PubSubs**

```efx
import { Channel, Data, Effect, Option } from "effect"

class StreamError extends Data.TaggedError("StreamError")<{
  readonly message: string
}> {}

const program = effect {
  const pubsub = await PubSub.unbounded<number>({ replay: 3 })

  // Create a channel that reads individual values
  const channel = Channel.fromPubSub(pubsub)

  // Publish some values
  await PubSub.publish(pubsub, 1)
  await PubSub.publish(pubsub, 2)
  await PubSub.publish(pubsub, 3)

  // The channel will output: 1, 2, 3 (individual values)
  return channel
}
const result = scoped(flatMap(program, Channel.runHead))
await runPromise(result) // => Option.some(1)
```

**Streaming PubSub notifications**

```efx
import { Channel, Effect, Option } from "effect"

const notificationService = effect {
  const notificationPubSub = await PubSub.unbounded<string>({ replay: 1 })

  // Create a channel for real-time notifications
  const notificationChannel = Channel.fromPubSub(notificationPubSub)

  // Transform notifications to add timestamps
  const receivedAt = "2024-01-01T00:00:00.000Z"
  const timestampedChannel = Channel.map(notificationChannel, (message) => ({
    message,
    receivedAt,
    id: `notification:${message}`
  }))

  await PubSub.publish(notificationPubSub, "ready")
  return timestampedChannel
}
const notification = scoped(flatMap(notificationService, Channel.runHead))
await runPromise(notification) // => Option.some({ message: "ready", receivedAt: "2024-01-01T00:00:00.000Z", id: "notification:ready" })
```

**Processing PubSub events**

```efx
import { Channel, Effect, Option } from "effect"

interface DomainEvent {
  readonly type: string
  readonly payload: unknown
  readonly timestamp: number
}

const eventProcessor = effect {
  const eventPubSub = await PubSub.unbounded<DomainEvent>({ replay: 1 })

  // Create a channel for processing domain events
  const eventChannel = Channel.fromPubSub(eventPubSub)

  // Filter and transform events
  const processedChannel = Channel.map(eventChannel, (event) => {
    if (event.type === "user.created") {
      return {
        ...event,
        processed: true,
        processedAt: event.timestamp + 1
      }
    }
    return event
  })

  await PubSub.publish(eventPubSub, { type: "user.created", payload: {}, timestamp: 1 })
  return processedChannel
}
const event = scoped(flatMap(eventProcessor, Channel.runHead))
const result = await runPromise(event) // => Option.some({ type: "user.created", payload: {}, timestamp: 1, processed: true, processedAt: 2 })
```

## fromPubSubArray

**Batching PubSub values**

```efx
import { Channel, Data, Effect, Option } from "effect"

class BatchError extends Data.TaggedError("BatchError")<{
  readonly message: string
}> {}

const program = effect {
  const pubsub = await PubSub.unbounded<number>({ replay: 4 })

  // Create a channel that reads arrays of values
  const channel = Channel.fromPubSubArray(pubsub)

  // Publish some values
  await PubSub.publish(pubsub, 1)
  await PubSub.publish(pubsub, 2)
  await PubSub.publish(pubsub, 3)
  await PubSub.publish(pubsub, 4)

  // The channel will output arrays like [1, 2, 3] and [4]
  return channel
}
const result = scoped(flatMap(program, Channel.runHead))
await runPromise(result) // => Option.some([1, 2, 3, 4])
```

**Processing PubSub orders in batches**

```efx
interface Order {
  readonly id: string
  readonly customerId: string
  readonly items: ReadonlyArray<string>
  readonly total: number
  readonly submittedAt: number
}

const orderBatchProcessor = effect {
  const orderPubSub = await PubSub.unbounded<Order>({ replay: 1 })

  // Create a channel that processes orders in batches
  const orderChannel = Channel.fromPubSubArray(orderPubSub)

  // Transform to process each batch of orders
  const processedChannel = Channel.map(orderChannel, (orderBatch) => {
    const totalRevenue = orderBatch.reduce((sum, order) => sum + order.total, 0)
    const customerCount = new Set(orderBatch.map((order) =>
      order.customerId
    )).size

    return {
      batchSize: orderBatch.length,
      totalRevenue,
      uniqueCustomers: customerCount,
      firstSubmittedAt: Math.min(...orderBatch.map((order) => order.submittedAt)),
      orders: orderBatch
    }
  })

  await PubSub.publish(orderPubSub, {
    id: "1", customerId: "a", items: ["book"], total: 10, submittedAt: 1
  })
  return processedChannel
}
const order = scoped(flatMap(orderBatchProcessor, Channel.runHead))
const result = await runPromise(order)
Option.map(result, (batch) => [batch.batchSize, batch.totalRevenue, batch.uniqueCustomers]) // => Option.some([1, 10, 1])
```

**Processing PubSub logs in batches**

```efx
interface LogEntry {
  readonly timestamp: number
  readonly level: "info" | "warn" | "error"
  readonly message: string
  readonly source: string
}

const logAggregator = effect {
  const logPubSub = await PubSub.unbounded<LogEntry>({ replay: 1 })

  // Create a channel that collects logs in batches
  const logChannel = Channel.fromPubSubArray(logPubSub)

  // Transform to analyze log batches
  const analysisChannel = Channel.map(logChannel, (logBatch) => {
    const errorCount = logBatch.filter((log) => log.level === "error").length
    const warnCount = logBatch.filter((log) => log.level === "warn").length
    const infoCount = logBatch.filter((log) => log.level === "info").length

    const timeRange = {
      start: Math.min(...logBatch.map((log) => log.timestamp)),
      end: Math.max(...logBatch.map((log) => log.timestamp))
    }

    return {
      batchId: `${timeRange.start}-${timeRange.end}`,
      totalEntries: logBatch.length,
      errorCount,
      warnCount,
      infoCount,
      timeRange,
      sources: [...new Set(logBatch.map((log) => log.source))]
    }
  })

  await PubSub.publish(logPubSub, {
    timestamp: 1,
    level: "info",
    message: "ready",
    source: "app"
  } satisfies LogEntry)
  return analysisChannel
}
const log = scoped(flatMap(logAggregator, Channel.runHead))
const result = await runPromise(log)
Option.map(result, (batch) => [batch.batchId, batch.totalEntries, batch.infoCount]) // => Option.some(["1-1", 1, 1])
```

## fromReadableStream

**Reading from a Web stream**

```efx
const channel = Channel.fromReadableStream({
  evaluate: () => new ReadableStream({
    start(controller) {
      controller.enqueue(1)
      controller.close()
    }
  }),
  onError: (cause) => new Error(String(cause))
})

await runPromise(Channel.runCollect(channel)) // => [[1]]
```

## fromWritableStream

**Writing channel input**

```efx
const written: Array<number> = []
const sink = Channel.fromWritableStream<never, Error, number>({
  evaluate: () => new WritableStream({
    write(value) {
      written.push(value)
    }
  }),
  onError: (cause) => new Error(String(cause))
})

const program = Channel.fromArray([[1, 2] as [number, number]]).pipe(
  Channel.pipeTo(sink),
  Channel.runDrain
)

await runPromise(program)
written // => [1, 2]
```

## fromTransformStream

**Transforming channel input**

```efx
const transform = Channel.fromTransformStream<never, number, number, Error>({
  evaluate: () => new TransformStream({
    transform(value, controller) {
      controller.enqueue(value * 2)
    }
  }),
  onError: (cause) => new Error(String(cause))
})

const program = Channel.fromArray([[1, 2] as [number, number]]).pipe(
  Channel.pipeTo(transform),
  Channel.runCollect
)

await runPromise(program) // => [[2], [4]]
```

## map

**Mapping channel output**

```efx
class TransformError extends Data.TaggedError("TransformError")<{
  readonly reason: string
}> {}

// Basic mapping of channel values
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
const doubledChannel = Channel.map(numbersChannel, (n) => n * 2)
runSync(Channel.runCollect(doubledChannel)) // => [2, 4, 6, 8, 10]

// Transform string data
const wordsChannel = Channel.fromIterable(["hello", "world", "effect"])
const upperCaseChannel = Channel.map(wordsChannel, (word) => word.toUpperCase())
runSync(Channel.runCollect(upperCaseChannel)) // => ["HELLO", "WORLD", "EFFECT"]

// Complex object transformation
type User = { id: number; name: string }
type UserDisplay = { displayName: string; isActive: boolean }

const usersChannel = Channel.fromIterable([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" }
])
const displayChannel = Channel.map(usersChannel, (user): UserDisplay => ({
  displayName: `User: ${user.name}`,
  isActive: true
}))
runSync(Channel.runCollect(displayChannel)) // => [{ displayName: "User: Alice", isActive: true }, { displayName: "User: Bob", isActive: true }]
```

## mapEffect

**Mapping channel output with effects**

```efx
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
const processedChannel = Channel.mapEffect(
  numbersChannel,
  (n) => succeed(n * n)
)
await runPromise(Channel.runCollect(processedChannel)) // => [1, 4, 9, 16, 25]
```

## tap

**Tapping channel output**

```efx
class LogError extends Data.TaggedError("LogError")<{
  readonly message: string
}> {}

// Create a channel that outputs numbers
const numberChannel = Channel.fromIterable([1, 2, 3])

// Tap into each output element to perform side effects
const processed: Array<number> = []
const tappedChannel = Channel.tap(
  numberChannel,
  (n) => sync(() => processed.push(n))
)

const observed = [await runPromise(Channel.runCollect(tappedChannel)), processed] // => [[1, 2, 3], [1, 2, 3]]
```

## flatMap

**Flat mapping channel output**

```efx
class ProcessError extends Data.TaggedError("ProcessError")<{
  readonly cause: string
}> {}

// Create a channel that outputs numbers
const numberChannel = Channel.fromIterable([1, 2, 3])

// FlatMap each number to create new channels
const flatMappedChannel = Channel.flatMap(
  numberChannel,
  (n) =>
    Channel.fromIterable(Array.from({ length: n }, (_, i) => `item-${n}-${i}`))
)

runSync(Channel.runCollect(flatMappedChannel)) // => ["item-1-0", "item-2-0", "item-2-1", "item-3-0", "item-3-1", "item-3-2"]
```

## concatWith

**Concatenating with completion values**

```efx
class ConcatError extends Data.TaggedError("ConcatError")<{
  readonly reason: string
}> {}

// Create a channel that outputs numbers and terminates with sum
const numberChannel = Channel.fromIterable([1, 2, 3]).pipe(
  Channel.concatWith((sum: void) => Channel.succeed(`Completed processing`))
)

runSync(Channel.runCollect(numberChannel)) // => [1, 2, 3, "Completed processing"]
```

## concat

**Concatenating channels**

```efx
class ConcatError extends Data.TaggedError("ConcatError")<{
  readonly reason: string
}> {}

// Create two channels
const firstChannel = Channel.fromIterable([1, 2, 3])
const secondChannel = Channel.fromIterable(["a", "b", "c"])

// Concatenate them
const concatenatedChannel = Channel.concat(firstChannel, secondChannel)

runSync(Channel.runCollect(concatenatedChannel)) // => [1, 2, 3, "a", "b", "c"]
```

## flatten

**Flattening nested channels**

```efx
class FlattenError extends Data.TaggedError("FlattenError")<{
  readonly cause: string
}> {}

// Create a channel that outputs channels
const nestedChannels = Channel.fromIterable([
  Channel.fromIterable([1, 2]),
  Channel.fromIterable([3, 4]),
  Channel.fromIterable([5, 6])
])

// Flatten the nested channels
const flattenedChannel = Channel.flatten(nestedChannels)

runSync(Channel.runCollect(flattenedChannel)) // => [1, 2, 3, 4, 5, 6]
```

## flattenArray

**Flattening arrays of channel output**

```efx
class FlattenError extends Data.TaggedError("FlattenError")<{
  readonly message: string
}> {}

// Create a channel that outputs arrays
const arrayChannel = Channel.fromIterable([
  [1, 2, 3],
  [4, 5],
  [6, 7, 8, 9]
])

// Flatten the arrays into individual elements
const flattenedChannel = Channel.flattenArray(arrayChannel)

runSync(Channel.runCollect(flattenedChannel)) // => [1, 2, 3, 4, 5, 6, 7, 8, 9]
```

## drain

**Draining channel output**

```efx
// Create a channel that outputs values
const sourceChannel = Channel.fromIterable([1, 2, 3, 4, 5])

// Drain all output, keeping only the completion
const drainedChannel = Channel.drain(sourceChannel)

runSync(Channel.runCollect(drainedChannel)) // => []
```

## filter

**Filtering channel output**

```efx
// Create a channel with mixed numbers
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5, 6, 7, 8])

// Filter to keep only even numbers
const evenChannel = Channel.filter(numbersChannel, (n) => n % 2 === 0)
runSync(Channel.runCollect(evenChannel)) // => [2, 4, 6, 8]

// Filter with type refinement
const mixedChannel = Channel.fromIterable([1, "hello", 2, "world", 3])
const numbersOnlyChannel = Channel.filter(
  mixedChannel,
  (value): value is number => typeof value === "number"
)
runSync(Channel.runCollect(numbersOnlyChannel)) // => [1, 2, 3]
```

## filterArray

**Filtering array output**

```efx
import { Array } from "effect"

const nonEmptyArrayPredicate = Array.isReadonlyArrayNonEmpty

// Create a channel that outputs arrays of mixed data
const arrayChannel = Channel.fromIterable([
  Array.make(1, 2, 3, 4, 5),
  Array.make(6, 7, 8, 9, 10),
  Array.make(11, 12, 13, 14, 15)
]).pipe(Channel.filter(nonEmptyArrayPredicate))

// Filter arrays to keep only even numbers
const evenArraysChannel = Channel.filterArray(arrayChannel, (n) => n % 2 === 0)
runSync(Channel.runCollect(evenArraysChannel)) // => [[2, 4], [6, 8, 10], [12, 14]]
// Note: Only non-empty filtered arrays are emitted

// Arrays that would become empty after filtering are discarded entirely
const oddChannel = Channel.fromIterable([
  Array.make(1, 3, 5),
  Array.make(2, 4),
  Array.make(7, 9)
]).pipe(Channel.filter(nonEmptyArrayPredicate))
const filteredOddChannel = Channel.filterArray(oddChannel, (n) => n % 2 === 0)
runSync(Channel.runCollect(filteredOddChannel)) // => [[2, 4]]
```

## mapAccum

**Mapping with accumulated state**

```efx
// Create a channel with numbers
const numbersChannel = Channel.fromIterable([1, 2, 3, 4])

// Use mapAccum to create running sums and emit both current and sum
const runningSum = Channel.mapAccum(
  numbersChannel,
  () => 0, // initial accumulator state
  (sum, current) => {
    const newSum = sum + current
    // Return [newState, outputValues]
    return [newSum, [current, newSum]] as const
  }
)
// Using with Effect for async processing
const asyncMapAccum = Channel.mapAccum(
  numbersChannel,
  () => "",
  (acc, value) =>
    effect {
      const newAcc = acc + value.toString()
      return [newAcc, [`${value}-processed`, newAcc]] as const
    }
)
runSync(Channel.runCollect(runningSum)) // => [1, 1, 2, 3, 3, 6, 4, 10]
runSync(Channel.runCollect(asyncMapAccum)) // => ["1-processed", "1", "2-processed", "12", "3-processed", "123", "4-processed", "1234"]
```

## scan

**Scanning channel output**

```efx
// Create a channel with numbers
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])

// Scan to create running sum
const runningSumChannel = Channel.scan(numbersChannel, 0, (sum, n) => sum + n)
runSync(Channel.runCollect(runningSumChannel)) // => [0, 1, 3, 6, 10, 15]
// Note: emits the initial value and each intermediate result

// Scan with string concatenation
const wordsChannel = Channel.fromIterable(["hello", "world", "from", "effect"])
const sentenceChannel = Channel.scan(
  wordsChannel,
  "",
  (sentence, word) => sentence === "" ? word : `${sentence} ${word}`
)
runSync(Channel.runCollect(sentenceChannel)) // => ["", "hello", "hello world", "hello world from", "hello world from effect"]
```

## scanEffect

**Scanning channel output with effects**

```efx
class ScanError extends Data.TaggedError("ScanError")<{
  readonly reason: string
}> {}

// Create a channel with numbers
const numbersChannel = Channel.fromIterable([1, 2, 3, 4])

// Effectful scan with async operations
const asyncScanChannel = Channel.scanEffect(
  numbersChannel,
  "",
  (acc, value) =>
    effect {
      return acc + value.toString()
    }
)
await runPromise(Channel.runCollect(asyncScanChannel)) // => ["", "1", "12", "123", "1234"]

// Scan with error handling
const errorHandlingScan = Channel.scanEffect(
  numbersChannel,
  0,
  (sum, n) => {
    if (n < 0) {
      return fail(new ScanError({ reason: "negative number" }))
    }
    return succeed(sum + n)
  }
)
await runPromise(Channel.runCollect(errorHandlingScan)) // => [0, 1, 3, 6, 10]
```

## catchCause

**Recovering from failure causes**

```efx
class ProcessError extends Data.TaggedError("ProcessError")<{
  readonly reason: string
}> {}

class RecoveryError extends Data.TaggedError("RecoveryError")<{
  readonly message: string
}> {}

// Create a failing channel
const failingChannel = Channel.fail(
  new ProcessError({ reason: "network error" })
)

// Catch the cause and provide recovery
const recoveredChannel = Channel.catchCause(failingChannel, (cause) => {
  if (Cause.hasFails(cause)) {
    return Channel.succeed("Recovered from failure")
  }
  return Channel.succeed("Recovered from interruption")
})

runSync(Channel.runCollect(recoveredChannel)) // => ["Recovered from failure"]
```

## catchDefect

**Recovering from a defect**

```efx
const channel = Channel.fromEffect(die("boom")).pipe(
  Channel.catchDefect((defect) => Channel.succeed(`recovered: ${defect}`))
)

runSync(Channel.runCollect(channel)) // => ["recovered: boom"]
```

## catchReason

**Recovering from nested reasons**

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

const reason = new RateLimitError({ retryAfter: 60 })
const channel = Channel.fail(new AiError({ reason }))

const recovered = channel.pipe(
  Channel.catchReason("AiError", "RateLimitError", (reason) =>
    Channel.succeed(`retry: ${reason.retryAfter}`)
  )
)
runSync(Channel.runCollect(recovered)) // => ["retry: 60"]
```

## unwrapReason

**Promoting nested reasons**

```efx
import { Channel, Data, Effect, Exit } from "effect"

class RateLimitError extends Data.TaggedError("RateLimitError")<{
  retryAfter: number
}> {}

class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  limit: number
}> {}

class AiError extends Data.TaggedError("AiError")<{
  reason: RateLimitError | QuotaExceededError
}> {}

const reason = new RateLimitError({ retryAfter: 60 })
const channel = Channel.fail(new AiError({ reason }))

const unwrapped = channel.pipe(Channel.unwrapReason("AiError"))
runSync(exit(Channel.runCollect(unwrapped))) // => Exit.fail(reason)
```

## orDie

**Converting failures to defects**

```efx
import { Cause, Channel, Data, Effect, Exit } from "effect"

class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
}> {}

// Create a channel that might fail
const error = new ValidationError({ field: "email" })
const failingChannel = Channel.fail(error)

// Convert failures to defects
const fatalChannel = Channel.orDie(failingChannel)

runSync(exit(Channel.runCollect(fatalChannel))) // => Exit.failCause(Cause.die(error))
```

## switchMap

**Switching mapped channels**

```efx
class SwitchError extends Data.TaggedError("SwitchError")<{
  readonly reason: string
}> {}

// Create a channel that outputs numbers
const numberChannel = Channel.fromIterable([1, 2, 3])

// Switch to new channels based on each value
const switchedChannel = Channel.switchMap(
  numberChannel,
  (n) => Channel.fromIterable([`value-${n}`])
)

await runPromise(Channel.runCollect(switchedChannel)) // => ["value-3"]
```

## mergeAll

**Merging nested channels**

```efx
class MergeAllError extends Data.TaggedError("MergeAllError")<{
  readonly reason: string
}> {}

// Create channels that output other channels
const nestedChannels = Channel.fromIterable([
  Channel.fromIterable([1, 2]),
  Channel.fromIterable([3, 4]),
  Channel.fromIterable([5, 6])
])

// Merge all channels with bounded concurrency
const mergedChannel = Channel.mergeAll({
  concurrency: 1,
  bufferSize: 16
})(nestedChannels)

await runPromise(Channel.runCollect(mergedChannel)) // => [1, 2, 3, 4, 5, 6]
```

## HaltStrategy

**Choosing merge halt strategies**

```efx
import { Channel } from "effect"

// Different halt strategies for channel merging
const strategies: Array<Channel.HaltStrategy> = ["left", "right", "both", "either"] // => ["left", "right", "both", "either"]
```

## merge

**Merging channels**

```efx
// Create two channels
const leftChannel = Channel.fromIterable([1, 2, 3])
const rightChannel = Channel.fromIterable(["a", "b", "c"])

// The default "both" strategy waits for both channels to complete
const mergedChannel = Channel.merge(leftChannel, rightChannel)

const values = await runPromise(Channel.runCollect(mergedChannel))
values.map(String).sort() // => ["1", "2", "3", "a", "b", "c"]
```

## splitLines

**Splitting string chunks into lines**

```efx
const result = await runPromise(Stream.runCollect(
  Stream.splitLines(Stream.make("hel", "lo\r\nwor", "ld\n"))
))
result // => ["hello", "world"]
```

## pipeTo

**Piping one channel into another**

```efx
class PipeError extends Data.TaggedError("PipeError")<{
  readonly stage: string
}> {}

// Create source and transform channels
const sourceChannel = Channel.fromIterable([1, 2, 3])
const transformChannel = Channel.map(sourceChannel, (n: number) => n * 2)

// Pipe the source into the transform
const pipedChannel = Channel.pipeTo(sourceChannel, transformChannel)

runSync(Channel.runCollect(pipedChannel)) // => [2, 4, 6]
```

## pipeToOrFail

**Piping while preserving failures**

```efx
import { Channel, Data, Effect, Exit } from "effect"

class SourceError extends Data.TaggedError("SourceError")<{
  readonly code: number
}> {}

// Create a failing source channel
const error = new SourceError({ code: 404 })
const failingSource = Channel.fail(error)
const safeTransform = Channel.identity<never, never, never>()

// Pipe while preserving source failures
const safePipedChannel = Channel.pipeToOrFail(failingSource, safeTransform)

runSync(exit(Channel.runCollect(safePipedChannel))) // => Exit.fail(error)
```

## unwrap

**Unwrapping channel effects**

```efx
class UnwrapError extends Data.TaggedError("UnwrapError")<{
  readonly reason: string
}> {}

// Create an effect that produces a channel
const channelEffect = succeed(
  Channel.fromIterable([1, 2, 3])
)

// Unwrap the effect to get the channel
const unwrappedChannel = Channel.unwrap(channelEffect)

runSync(Channel.runCollect(unwrappedChannel)) // => [1, 2, 3]
```

## embedInput

**Embedding custom input handling**

```efx
// Create a base channel
const baseChannel = Channel.fromIterable([1, 2, 3])

// Drain the embedded input while the base channel runs
const embeddedChannel = Channel.embedInput(
  baseChannel,
  (upstream) =>
    upstream.pipe(
      forever,
      ignore
    )
)
await runPromise(Channel.runCollect(embeddedChannel)) // => [1, 2, 3]
```

## onExit

**Running exit finalizers**

```efx
class ExitError extends Data.TaggedError("ExitError")<{
  readonly stage: string
}> {}

// Create a channel
const dataChannel = Channel.fromIterable([1, 2, 3])

// Attach exit handler
const exits: Array<Exit<void, ExitError>> = []
const channelWithExit = Channel.onExit(dataChannel, (exit) => {
  exits.push(exit)
  return Effect.void
})
const observed = [await runPromise(Channel.runCollect(channelWithExit)), exits] // => [[1, 2, 3], [Exit.void]]
```

## ensuring

**Ensuring cleanup runs**

```efx
class EnsureError extends Data.TaggedError("EnsureError")<{
  readonly operation: string
}> {}

// Create a channel
const dataChannel = Channel.fromIterable([1, 2, 3])

// Ensure cleanup always runs
const events: Array<string> = []
const channelWithCleanup = Channel.ensuring(
  dataChannel,
  sync(() => events.push("cleanup"))
)
const observed = [await runPromise(Channel.runCollect(channelWithCleanup)), events] // => [[1, 2, 3], ["cleanup"]]
```

## runCount

**Counting channel output**

```efx
class CountError extends Data.TaggedError("CountError")<{
  readonly reason: string
}> {}

// Create a channel with multiple elements
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])

// Count the elements
const countEffect = Channel.runCount(numbersChannel)

runSync(countEffect) // => 5
```

## runDrain

**Draining channel output at runtime**

```efx
class DrainError extends Data.TaggedError("DrainError")<{
  readonly stage: string
}> {}

// Create a channel that outputs elements and completes with a result
const resultChannel = Channel.fromIterable([1, 2, 3])
const completedChannel = Channel.concat(resultChannel, Channel.end("completed"))

// Drain all elements and get only the final result
const drainEffect = Channel.runDrain(completedChannel)

runSync(drainEffect) // => "completed"
```

## runForEach

**Running effects for each output**

```efx
class ForEachError extends Data.TaggedError("ForEachError")<{
  readonly element: unknown
}> {}

// Create a channel with numbers
const numbersChannel = Channel.fromIterable([1, 2, 3])

// Run forEach to process each element
const processed: Array<number> = []
const forEachEffect = Channel.runForEach(
  numbersChannel,
  (n) => sync(() => processed.push(n))
)

await runPromise(forEachEffect)
processed // => [1, 2, 3]
```

## mkUint8Array

**Joining channel byte chunks**

```efx
const channel = Channel.fromArray([
  [new Uint8Array([1, 2])],
  [new Uint8Array([3, 4])]
] as const)

const bytes = runSync(Channel.mkUint8Array(channel))
Array.from(bytes) // => [1, 2, 3, 4]
```

## runCollect

**Collecting channel output**

```efx
class CollectError extends Data.TaggedError("CollectError")<{
  readonly reason: string
}> {}

// Create a channel with elements
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])

// Collect all elements into an array
const collectEffect = Channel.runCollect(numbersChannel)

runSync(collectEffect) // => [1, 2, 3, 4, 5]
```

## runFold

**Folding channel output**

```efx
class FoldError extends Data.TaggedError("FoldError")<{
  readonly operation: string
}> {}

// Create a channel with numbers
const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])

// Fold to calculate sum
const sumEffect = Channel.runFold(numbersChannel, () => 0, (acc, n) => acc + n)

runSync(sumEffect) // => 15
```

## toPull

**Converting channels to pulls**

```efx
class PullError extends Data.TaggedError("PullError")<{
  readonly step: string
}> {}

// Create a channel
const numbersChannel = Channel.fromIterable([1, 2, 3])

const program = scoped(effect {
  const pull = await Channel.toPull(numbersChannel)
  return [await pull, await pull, await pull]
})
await runPromise(program) // => [1, 2, 3]
```

## toPullScoped

**Converting channels to scoped pulls**

```efx
import { Channel, Data, Effect, Scope } from "effect"

class ScopedPullError extends Data.TaggedError("ScopedPullError")<{
  readonly reason: string
}> {}

// Create a channel
const numbersChannel = Channel.fromIterable([1, 2, 3])

// Convert to Pull with explicit scope
const scopedPullEffect = effect {
  const scope = await Effect.scope
  const pull = await Channel.toPullScoped(numbersChannel, scope)
  return [await pull, await pull, await pull]
}
await runPromise(scoped(scopedPullEffect)) // => [1, 2, 3]
```

## toQueue

**Converting channels to queues**

```efx
class QueueError extends Data.TaggedError("QueueError")<{
  readonly operation: string
}> {}

// Create a channel with data
const dataChannel = Channel.fromIterable([1, 2, 3, 4, 5])

// Convert to queue for concurrent processing
const program = scoped(effect {
  const queue = await Channel.toQueue(dataChannel, { capacity: 32 })
  return await Queue.takeBetween(queue, 5, 5)
})
await runPromise(program) // => [1, 2, 3, 4, 5]
```
