# effect/TxQueue

The examples in the JSDoc of `packages/effect/src/TxQueue.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## State

**Inspecting queue lifecycle states**

```efx
import type { TxQueue } from "effect"

const state: TxQueue.State<string, Error> = { _tag: "Open" }
state._tag // => "Open"
```

## TxEnqueue

**Offering values through enqueue handles**

```efx
import type { Cause } from "effect"

const program = effect {
  // Queue without error channel
  const queue = await TxQueue.bounded<number>(10)
  const accepted = await TxQueue.offer(queue, 42)

  // Queue with error channel for completion signaling
  const faultTolerantQueue = await TxQueue.bounded<number, string>(10)
  await TxQueue.offerAll(faultTolerantQueue, [1, 2, 3])
  await TxQueue.fail(faultTolerantQueue, "processing complete")

  // Works with Done for clean completion
  const completableQueue = await TxQueue.bounded<
    string,
    Cause.Done
  >(5)
  await TxQueue.offer(completableQueue, "task")
  await TxQueue.end(completableQueue)

  return accepted
}

await runPromise(program) // => true
```

## TxDequeue

**Taking values through dequeue handles**

```efx
const program = effect {
  // Queue without error channel
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offer(queue, 42)
  const item = await TxQueue.take(queue)

  // Queue with error channel - errors propagate through E-channel
  const faultTolerantQueue = await TxQueue.bounded<number, string>(10)
  await TxQueue.fail(faultTolerantQueue, "processing failed")

  // All dequeue operations now fail with the error directly
  const takeResult = await flip(TxQueue.take(faultTolerantQueue)) // "processing failed"
  const peekResult = await flip(TxQueue.peek(faultTolerantQueue)) // "processing failed"
  return [item, takeResult, peekResult] as const
}

await runPromise(program) // => [42, "processing failed", "processing failed"]
```

## TxQueue

**Combining enqueue and dequeue operations**

```efx
const program = effect {
  // Create a bounded transactional queue (E defaults to never)
  const queue = await TxQueue.bounded<number>(10)

  // Single operations - automatically transactional
  const accepted = await TxQueue.offer(queue, 42)
  const item = await TxQueue.take(queue) // Effect<number, never>

  // Queue with error channel
  const faultTolerantQueue = await TxQueue.bounded<number, string>(10)

  // Operations can handle queue-level failures
  await TxQueue.fail(faultTolerantQueue, "queue failed")
  const result = await flip(TxQueue.take(faultTolerantQueue))
  return [accepted, item, result] as const
}

await runPromise(program) // => [true, 42, "queue failed"]
```

## isTxEnqueue

**Checking enqueue handles**

```efx
import { TxQueue } from "effect"

const someValue: unknown = {}
TxQueue.isTxEnqueue(someValue) // => false
```

## isTxDequeue

**Checking dequeue handles**

```efx
import { TxQueue } from "effect"

const someValue: unknown = {}
TxQueue.isTxDequeue(someValue) // => false
```

## isTxQueue

**Checking queue handles**

```efx
import { TxQueue } from "effect"

const someValue: unknown = {}
TxQueue.isTxQueue(someValue) // => false
```

## bounded

**Creating bounded queues**

```efx
const program = effect {
  // Create a bounded queue (E defaults to never)
  const queue = await TxQueue.bounded<number>(10)

  // Create a bounded queue with error channel
  const faultTolerantQueue = await TxQueue.bounded<number, string>(10)

  // Offer items - will succeed until capacity is reached
  await TxQueue.offer(queue, 1)
  await TxQueue.offer(queue, 2)

  return await TxQueue.take(queue)
}

await runPromise(program) // => 1
```

## unbounded

**Creating unbounded queues**

```efx
const program = effect {
  // Create an unbounded queue (E defaults to never)
  const queue = await TxQueue.unbounded<string>()

  // Create an unbounded queue with error channel
  const faultTolerantQueue = await TxQueue.unbounded<string, Error>()

  // Can offer unlimited items
  await TxQueue.offer(queue, "hello")
  await TxQueue.offer(queue, "world")

  return await TxQueue.size(queue)
}

await runPromise(program) // => 2
```

## dropping

**Creating dropping queues**

```efx
const program = effect {
  // Create a dropping queue with capacity 2
  const queue = await TxQueue.dropping<number>(2)

  // Fill to capacity
  await TxQueue.offer(queue, 1)
  await TxQueue.offer(queue, 2)

  // This will be dropped (returns false)
  return await TxQueue.offer(queue, 3)
}

await runPromise(program) // => false
```

## sliding

**Creating sliding queues**

```efx
const program = effect {
  // Create a sliding queue with capacity 2
  const queue = await TxQueue.sliding<number>(2)

  // Fill to capacity
  await TxQueue.offer(queue, 1)
  await TxQueue.offer(queue, 2)

  // This will evict item 1 and add 3
  await TxQueue.offer(queue, 3)

  return await TxQueue.take(queue)
}

await runPromise(program) // => 2
```

## offer

**Offering a value**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  // Offer an item - returns true if accepted
  return await TxQueue.offer(queue, 42)
}

await runPromise(program) // => true
```

## offerAll

**Offering multiple values**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  // Offer multiple items - returns rejected items as array
  return await TxQueue.offerAll(queue, [1, 2, 3, 4, 5])
}

await runPromise(program) // => []
```

## take

**Taking a value**

```efx
import { Exit } from "effect"

const program = effect {
  const queue = await TxQueue.bounded<number, string>(10)
  await TxQueue.offer(queue, 42)

  // Take an item - blocks if empty
  const item = await TxQueue.take(queue)

  // When queue fails, take fails with the same error
  await TxQueue.fail(queue, "queue error")
  const result = await exit(TxQueue.take(queue))
  return [item, result] as const
}

await runPromise(program) // => [42, Exit.fail("queue error")]
```

## poll

**Polling without blocking**

```efx
import { Option } from "effect"

const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  // Poll returns Option.none if empty
  const maybe = await TxQueue.poll(queue)

  await TxQueue.offer(queue, 42)
  const item = await TxQueue.poll(queue)
  return [maybe, item] as const
}

await runPromise(program) // => [Option.none(), Option.some(42)]
```

## takeAll

**Taking all queued values**

```efx
import { Exit } from "effect"

const program = effect {
  const queue = await TxQueue.bounded<number, string>(10)
  await TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

  // Take all items atomically - returns NonEmptyArray
  return await TxQueue.takeAll(queue)
}

// Error propagation example
const errorExample = effect {
  const queue = await TxQueue.bounded<number, string>(5)
  await TxQueue.offerAll(queue, [1, 2])
  await TxQueue.fail(queue, "processing error")

  // takeAll() propagates the queue error through E-channel
  return await exit(TxQueue.takeAll(queue))
}

await runPromise(program) // => [1, 2, 3, 4, 5]
await runPromise(errorExample) // => Exit.fail("processing error")
```

## takeN

**Taking a fixed number of values**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(5)
  await TxQueue.offerAll(queue, [1, 2, 3, 4])

  const items = await TxQueue.takeN(queue, 4)

  // This requests more than capacity (5), so takes all available (up to 5)
  await TxQueue.offerAll(queue, [5, 6, 7, 8, 9])
  const all = await TxQueue.takeN(queue, 10)
  return [items, all] as const
}

await runPromise(program) // => [[1, 2, 3, 4], [5, 6, 7, 8, 9]]
```

## takeBetween

**Taking batches within bounds**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offerAll(queue, [1, 2, 3, 4, 5, 6, 7, 8])

  // Take between 2 and 5 items
  const batch1 = await TxQueue.takeBetween(queue, 2, 5)

  // Take between 1 and 10 items (but only 3 remain)
  const batch2 = await TxQueue.takeBetween(queue, 1, 10)

  // Would wait for at least 1 item to be available
  // const batch3 = yield* TxQueue.takeBetween(queue, 1, 3)
  return [batch1, batch2] as const
}

await runPromise(program) // => [[1, 2, 3, 4, 5], [6, 7, 8]]
```

## peek

**Peeking without removing values**

```efx
import { Exit } from "effect"

const program = effect {
  const queue = await TxQueue.bounded<number, string>(10)
  await TxQueue.offer(queue, 42)

  // Peek at the next item without removing it
  const item = await TxQueue.peek(queue)

  // Item is still in the queue
  const size = await TxQueue.size(queue)
  return [item, size] as const
}

// Error handling example
const errorExample = effect {
  const queue = await TxQueue.bounded<number, string>(5)
  await TxQueue.fail(queue, "queue failed")

  // peek() propagates the queue error through E-channel
  return await exit(TxQueue.peek(queue))
}

await runPromise(program) // => [42, 1]
await runPromise(errorExample) // => Exit.fail("queue failed")
```

## size

**Reading queue size**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offerAll(queue, [1, 2, 3])

  return await TxQueue.size(queue)
}

await runPromise(program) // => 3
```

## isEmpty

**Checking whether a queue is empty**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  const empty = await TxQueue.isEmpty(queue)

  await TxQueue.offer(queue, 42)
  const stillEmpty = await TxQueue.isEmpty(queue)
  return [empty, stillEmpty] as const
}

await runPromise(program) // => [true, false]
```

## isNonEmpty

**Checking whether a queue is non-empty**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  const empty = await TxQueue.isNonEmpty(queue)

  await TxQueue.offer(queue, 42)
  const nonEmpty = await TxQueue.isNonEmpty(queue)
  return [empty, nonEmpty] as const
}

await runPromise(program) // => [false, true]
```

## isFull

**Checking whether a queue is full**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(2)

  const full = await TxQueue.isFull(queue)

  await TxQueue.offerAll(queue, [1, 2])
  const nowFull = await TxQueue.isFull(queue)
  return [full, nowFull] as const
}

await runPromise(program) // => [false, true]
```

## interrupt

**Interrupting queues**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offer(queue, 42)

  // Interrupt gracefully - allows remaining items to be consumed
  return await TxQueue.interrupt(queue)
}

await runPromise(program) // => true
```

## fail

**Failing queues**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number, string>(10)

  // Fail the queue with an error
  return await TxQueue.fail(queue, "connection lost")
}

await runPromise(program) // => true
```

## failCause

**Failing queues with causes**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  // Complete with specific cause
  const cause = Cause.interrupt()
  const result = await TxQueue.failCause(queue, cause)
  return [cause, result] as const
}

await runPromise(program) // => [Cause.interrupt(), true]
```

## end

**Ending queues**

```efx
import { Exit } from "effect"

const program = effect {
  const queue = await TxQueue.bounded<number, Cause.Done>(10)

  // Signal the end of the queue
  const result = await TxQueue.end(queue)

  // All operations will now fail with Done
  const takeResult = await exit(TxQueue.take(queue))

  const peekResult = await exit(TxQueue.peek(queue))
  return [result, takeResult, peekResult] as const
}

await runPromise(program) // => [true, Exit.fail(Cause.Done()), Exit.fail(Cause.Done())]
```

## clear

**Clearing queues**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

  const sizeBefore = await TxQueue.size(queue)

  const cleared = await TxQueue.clear(queue)

  const sizeAfter = await TxQueue.size(queue)
  return [sizeBefore, cleared, sizeAfter] as const
}

await runPromise(program) // => [5, [1, 2, 3, 4, 5], 0]
```

## shutdown

**Shutting down queues**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offerAll(queue, [1, 2, 3, 4, 5])

  const sizeBefore = await TxQueue.size(queue)

  await TxQueue.shutdown(queue)

  const sizeAfter = await TxQueue.size(queue)

  const isShutdown = await TxQueue.isShutdown(queue)
  return [sizeBefore, sizeAfter, isShutdown] as const
}

await runPromise(program) // => [5, 0, true]
```

## isOpen

**Checking open state**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  const open = await TxQueue.isOpen(queue)

  await TxQueue.interrupt(queue)
  const stillOpen = await TxQueue.isOpen(queue)
  return [open, stillOpen] as const
}

await runPromise(program) // => [true, false]
```

## isClosing

**Checking closing state**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)
  await TxQueue.offer(queue, 42)

  const closing = await TxQueue.isClosing(queue)

  await TxQueue.interrupt(queue)
  const nowClosing = await TxQueue.isClosing(queue)
  return [closing, nowClosing] as const
}

await runPromise(program) // => [false, true]
```

## isDone

**Checking done state**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  const done = await TxQueue.isDone(queue)

  await TxQueue.interrupt(queue)
  const nowDone = await TxQueue.isDone(queue)
  return [done, nowDone] as const
}

await runPromise(program) // => [false, true]
```

## isShutdown

**Checking shutdown state**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number>(10)

  const isShutdown = await TxQueue.isShutdown(queue)

  await TxQueue.shutdown(queue)
  const nowShutdown = await TxQueue.isShutdown(queue)
  return [isShutdown, nowShutdown] as const
}

await runPromise(program) // => [false, true]
```

## awaitCompletion

**Awaiting queue completion**

```efx
const program = effect {
  const queue = await TxQueue.bounded<number, string>(10)

  const waiter = await forkChild(TxQueue.awaitCompletion(queue))
  await TxQueue.interrupt(queue)

  await Fiber.join(waiter)
  return "Queue completed successfully"
}

await runPromise(program) // => "Queue completed successfully"
```
