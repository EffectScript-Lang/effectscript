# effect/Queue

The examples in the JSDoc of `packages/effect/src/Queue.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Enqueue

**Offering through enqueue handles**

```efx
// Function that only needs write access to a queue
const producer = (enqueue: Queue.Enqueue<string>) =>
  effect {
    await Queue.offer(enqueue, "hello")
    await Queue.offerAll(enqueue, ["world", "!"])
  }

const program = effect {
  const queue = await Queue.bounded<string>(10)
  await producer(queue)
  return await Queue.takeAll(queue)
}

await runPromise(program) // => ["hello", "world", "!"]
```

## Dequeue

**Taking through dequeue handles**

```efx
const program = effect {
  const queue = await Queue.bounded<string, never>(10)

  // A Dequeue can only take elements
  const dequeue: Queue.Dequeue<string> = queue

  // Pre-populate the queue
  await Queue.offerAll(queue, ["a", "b", "c"])

  // Take elements using dequeue interface
  const item = await Queue.take(dequeue)
  return item
}

await runPromise(program) // => "a"
```

## Queue

**Offering and taking queue values**

```efx
const program = effect {
  // Create a bounded queue
  const queue = await Queue.bounded<string>(10)

  // Producer: offer items to the queue
  await Queue.offer(queue, "hello")
  await Queue.offerAll(queue, ["world", "!"])

  // Consumer: take items from the queue
  const item1 = await Queue.take(queue)
  const item2 = await Queue.take(queue)
  const item3 = await Queue.take(queue)

  return [item1, item2, item3]
}

await runPromise(program) // => ["hello", "world", "!"]
```

## make

**Creating queues**

```efx
const program = effect {
  const queue = await Queue.make<number, string | Cause.Done>()

  // add messages to the queue
  await Queue.offer(queue, 1)
  await Queue.offer(queue, 2)
  await Queue.offerAll(queue, [3, 4, 5])

  // take messages from the queue
  const messages = await Queue.takeAll(queue)

  // signal that the queue is done
  await Queue.end(queue)
  const done = await flip(Queue.take(queue))

  // signal that another queue has failed
  const failedQueue = await Queue.make<number, string>()
  const failed = await Queue.fail(failedQueue, "boom")
  return { messages, done, failed }
}

await runPromise(program) // => { messages: [1, 2, 3, 4, 5], done: Cause.Done(), failed: true }
```

## bounded

**Creating bounded queues**

```efx
const program = effect {
  const queue = await Queue.bounded<string>(5)

  // This will succeed as queue has capacity
  await Queue.offer(queue, "first")
  await Queue.offer(queue, "second")

  const size = await Queue.size(queue)
  return size
}

await runPromise(program) // => 2
```

## sliding

**Creating sliding queues**

```efx
const program = effect {
  const queue = await Queue.sliding<number>(3)

  // Fill the queue to capacity
  await Queue.offer(queue, 1)
  await Queue.offer(queue, 2)
  await Queue.offer(queue, 3)

  // This will succeed, dropping the oldest element (1)
  await Queue.offer(queue, 4)

  const all = await Queue.takeAll(queue)
  return all
}

await runPromise(program) // => [2, 3, 4]
```

## dropping

**Creating dropping queues**

```efx
const program = effect {
  const queue = await Queue.dropping<number>(2)

  // Fill the queue to capacity
  const success1 = await Queue.offer(queue, 1)
  const success2 = await Queue.offer(queue, 2)

  // This will be dropped
  const success3 = await Queue.offer(queue, 3)

  const all = await Queue.takeAll(queue)
  return [success1, success2, success3, all]
}

await runPromise(program) // => [true, true, false, [1, 2]]
```

## unbounded

**Creating unbounded queues**

```efx
const program = effect {
  const queue = await Queue.unbounded<string>()

  // Producers can always add messages without blocking
  await Queue.offer(queue, "message1")
  await Queue.offer(queue, "message2")
  await Queue.offerAll(queue, ["message3", "message4", "message5"])

  // Check current size
  const size = await Queue.size(queue)

  // Take all messages
  const messages = await Queue.takeAll(queue)
  return { size, messages }
}

await runPromise(program) // => { size: 5, messages: ["message1", "message2", "message3", "message4", "message5"] }
```

## offer

**Offering a value**

```efx
const program = effect {
  const queue = await Queue.bounded<number>(3)

  // Successfully add messages to queue
  const success1 = await Queue.offer(queue, 1)
  const success2 = await Queue.offer(queue, 2)

  // Queue state
  const size = await Queue.size(queue)
  return { offered: [success1, success2], size }
}

await runPromise(program) // => { offered: [true, true], size: 2 }
```

## offerUnsafe

**Offering a value synchronously**

```efx
// Create a queue effect and extract the queue for unsafe operations
const program = effect {
  const queue = await Queue.bounded<number>(3)

  // Add messages synchronously using unsafe API
  const success1 = Queue.offerUnsafe(queue, 1)
  const success2 = Queue.offerUnsafe(queue, 2)

  // Check current size
  const size = Queue.sizeUnsafe(queue)
  return { offered: [success1, success2], size }
}

await runPromise(program) // => { offered: [true, true], size: 2 }
```

## offerAll

**Offering multiple values**

```efx
const program = effect {
  const queue = await Queue.dropping<number>(3)

  // Try to add more messages than capacity without suspending
  const remaining1 = await Queue.offerAll(queue, [1, 2, 3, 4, 5])
  return remaining1
}

await runPromise(program) // => [4, 5]
```

## offerAllUnsafe

**Offering multiple values synchronously**

```efx
// Create a bounded queue and use unsafe API
const program = effect {
  const queue = await Queue.bounded<number>(3)

  // Try to add 5 messages to capacity-3 queue using unsafe API
  const remaining = Queue.offerAllUnsafe(queue, [1, 2, 3, 4, 5])

  // Check what's in the queue
  const size = Queue.sizeUnsafe(queue)
  return { remaining, size }
}

await runPromise(program) // => { remaining: [4, 5], size: 3 }
```

## fail

**Failing queues with an error**

```efx
import { Effect, Exit } from "effect"

const program = effect {
  const queue = await Queue.bounded<number, string>(10)

  // Fail the queue with an error
  const failed = await Queue.fail(queue, "Something went wrong")

  // Taking from the failed queue fails with the error
  const exit = await Effect.exit(Queue.take(queue))
  return [failed, exit]
}

await runPromise(program) // => [true, Exit.fail("Something went wrong")]
```

## failCause

**Failing queues with a cause**

```efx
import { Cause, Effect, Exit } from "effect"

const program = effect {
  const queue = await Queue.bounded<number, string>(10)

  // Create a cause and fail the queue
  const cause = Cause.fail("Queue processing failed")
  const failed = await Queue.failCause(queue, cause)

  // The queue is now done with the specified failure cause
  const exit = await Effect.exit(Queue.take(queue))
  return [failed, exit]
}

await runPromise(program) // => [true, Exit.failCause(Cause.fail("Queue processing failed"))]
```

## failCauseUnsafe

**Failing queues with a cause synchronously**

```efx
import { Cause, Effect, Exit } from "effect"

const program = effect {
  const queue = await Queue.bounded<number, string>(10)

  // Create a cause and fail the queue synchronously
  const cause = Cause.fail("Processing error")
  const failed = Queue.failCauseUnsafe(queue, cause)

  // The queue is now done with the specified failure cause
  const exit = Queue.takeUnsafe(queue)
  return [failed, exit]
}

await runPromise(program) // => [true, Exit.failCause(Cause.fail("Processing error"))]
```

## end

**Ending queues**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)

  // Add some messages
  await Queue.offer(queue, 1)
  await Queue.offer(queue, 2)

  // Signal completion - no more messages will be accepted
  const ended = await Queue.end(queue)

  // Trying to offer more messages will return false
  const offerResult = await Queue.offer(queue, 3)

  // But we can still take existing messages
  const message = await Queue.take(queue)
  return [ended, offerResult, message]
}

await runPromise(program) // => [true, false, 1]
```

## endUnsafe

**Ending queues synchronously**

```efx
// Create a queue and use unsafe operations
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)

  // Add some messages
  Queue.offerUnsafe(queue, 1)
  Queue.offerUnsafe(queue, 2)

  // End the queue synchronously
  const ended = Queue.endUnsafe(queue)

  // Existing messages can still be consumed while the queue is closing
  const states = [queue.state._tag]

  Queue.takeUnsafe(queue)
  Queue.takeUnsafe(queue)

  // After buffered messages are consumed, the queue is done
  states.push(queue.state._tag)
  return { ended, states }
}

await runPromise(program) // => { ended: true, states: ["Closing", "Done"] }
```

## interrupt

**Interrupting queues gracefully**

```efx
import { Cause } from "effect"

const program = effect {
  const queue = await Queue.bounded<number>(10)

  // Add some messages
  await Queue.offer(queue, 1)
  await Queue.offer(queue, 2)

  // Interrupt gracefully - no more offers accepted, but messages can be consumed
  const interrupted = await Queue.interrupt(queue)

  // Trying to offer more messages will return false
  const offerResult = await Queue.offer(queue, 3)

  // But we can still take existing messages
  const message1 = await Queue.take(queue)

  const message2 = await Queue.take(queue)

  // After all messages are consumed, queue is done
  const isDone = queue.state._tag === "Done"
  return { interrupted, offerResult, messages: [message1, message2], isDone }
}

await runPromise(program) // => { interrupted: true, offerResult: false, messages: [1, 2], isDone: true }
```

## shutdown

**Shutting down queues**

```efx
const program = effect {
  const queue = await Queue.bounded<number>(2)

  // Add messages
  await Queue.offer(queue, 1)
  await Queue.offer(queue, 2)

  // Shutdown clears buffered messages and prevents further offers
  const wasShutdown = await Queue.shutdown(queue)

  // Queue is now done and cleared
  const size = await Queue.size(queue)
  return { wasShutdown, size }
}

await runPromise(program) // => { wasShutdown: true, size: 0 }
```

## clear

**Clearing queued values**

```efx
const program = effect {
  const queue = await Queue.bounded<number>(10)

  // Add several messages
  await Queue.offerAll(queue, [1, 2, 3, 4, 5])

  // Clear all messages from the queue
  const messages = await Queue.clear(queue)

  // Queue is now empty
  const size = await Queue.size(queue)

  // Clearing empty queue returns empty array
  const empty = await Queue.clear(queue)
  return { messages, size, empty }
}

await runPromise(program) // => { messages: [1, 2, 3, 4, 5], size: 0, empty: [] }
```

## takeAll

**Taking all available values**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(5)

  // Add several messages
  await Queue.offerAll(queue, [1, 2, 3, 4, 5])

  // Take all available messages
  const messages1 = await Queue.takeAll(queue)
  return messages1
}

await runPromise(program) // => [1, 2, 3, 4, 5]
```

## collect

**Collecting values until completion**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(5)

  // Add several messages
  await Queue.offerAll(queue, [1, 2, 3, 4, 5])
  await Queue.end(queue)

  // Collect all available messages
  return await Queue.collect(queue)
}

await runPromise(program) // => [1, 2, 3, 4, 5]
```

## takeN

**Taking a fixed number of values**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)

  // Add several messages
  await Queue.offerAll(queue, [1, 2, 3, 4, 5, 6, 7])

  // Take exactly 3 messages
  const first3 = await Queue.takeN(queue, 3)

  // Take exactly 2 more messages
  const next2 = await Queue.takeN(queue, 2)

  // Take remaining messages
  const remaining = await Queue.takeN(queue, 2)
  return [first3, next2, remaining]
}

await runPromise(program) // => [[1, 2, 3], [4, 5], [6, 7]]
```

## takeBetween

**Taking a bounded batch of values**

```efx
import { Cause } from "effect"

const program = effect {
  const queue = await Queue.bounded<number>(10)

  // Add several messages
  await Queue.offerAll(queue, [1, 2, 3, 4, 5, 6, 7, 8])

  // Take between 2 and 5 messages
  const batch1 = await Queue.takeBetween(queue, 2, 5)

  // Take between 1 and 10 messages (but only 3 remain)
  const batch2 = await Queue.takeBetween(queue, 1, 10)

  // No more messages available, will wait or return done
  // const batch3 = yield* Queue.takeBetween(queue, 1, 3)
  return [batch1, batch2]
}

await runPromise(program) // => [[1, 2, 3, 4, 5], [6, 7, 8]]
```

## take

**Taking one value**

```efx
import { Cause, Effect, Exit } from "effect"

const program = effect {
  const queue = await Queue.bounded<string, Cause.Done>(3)

  // Add some messages
  await Queue.offer(queue, "first")
  await Queue.offer(queue, "second")

  // Take messages one by one
  const msg1 = await Queue.take(queue)
  const msg2 = await Queue.take(queue)

  // End the queue
  await Queue.end(queue)

  // Taking from an ended queue fails with Done
  const result = await exit(Queue.take(queue))
  return [[msg1, msg2], result]
}

await runPromise(program) // => [["first", "second"], Exit.fail(Cause.Done())]
```

## poll

**Polling without blocking**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const queue = await Queue.bounded<number>(10)

  // Poll returns Option.none if empty
  const maybe1 = await Queue.poll(queue)

  // Add an item
  await Queue.offer(queue, 42)

  // Poll returns Option.some with the item
  const maybe2 = await Queue.poll(queue)
  return [maybe1, maybe2]
}

await runPromise(program) // => [Option.none(), Option.some(42)]
```

## peek

**Peeking at the next value**

```efx
import { Cause } from "effect"

const program = effect {
  const queue = await Queue.bounded<number>(10)
  await Queue.offer(queue, 42)

  // Peek at the next item without removing it
  const item = await Queue.peek(queue)
  return item
}

await runPromise(program) // => 42
```

## takeUnsafe

**Taking one value synchronously**

```efx
import { Effect, Exit } from "effect"

// Create a queue and use unsafe operations
const program = effect {
  const queue = await Queue.bounded<number>(10)

  // Add some messages
  Queue.offerUnsafe(queue, 1)
  Queue.offerUnsafe(queue, 2)

  // Take a message synchronously
  const result1 = Queue.takeUnsafe(queue)

  const result2 = Queue.takeUnsafe(queue)

  // No more messages - returns undefined
  const result3 = Queue.takeUnsafe(queue)
  return [result1, result2, result3]
}

await runPromise(program) // => [Exit.succeed(1), Exit.succeed(2), undefined]
```

## flushUnsafe

**Releasing a waiting taker synchronously**

```efx
const program = effect {
  const queue = await Queue.unbounded<number>()
  const taker = await Queue.take(queue).pipe(forkChild)
  await yieldNow

  Queue.offerUnsafe(queue, 1)
  Queue.flushUnsafe(queue)

  return await Fiber.join(taker)
}

await runPromise(program) // => 1
```

## flush

**Releasing a waiting taker**

```efx
const program = effect {
  const queue = await Queue.unbounded<number>()
  const taker = await Queue.take(queue).pipe(forkChild)
  await yieldNow

  Queue.offerUnsafe(queue, 1)
  await Queue.flush(queue)

  return await Fiber.join(taker)
}

await runPromise(program) // => 1
```

## size

**Checking queue size**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)

  // Check size of empty queue
  const size1 = await Queue.size(queue)

  // Add some messages
  await Queue.offerAll(queue, [1, 2, 3, 4, 5])

  // Check size after adding messages
  const size2 = await Queue.size(queue)

  // End the queue
  await Queue.end(queue)

  // Ending retains the buffered size while the queue is Closing
  const size3 = await Queue.size(queue)
  return [size1, size2, size3]
}

await runPromise(program) // => [0, 5, 5]
```

## isFull

**Checking if queues are full**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(3)

  const before = await Queue.isFull(queue)

  // Add some messages
  await Queue.offerAll(queue, [1, 2, 3])

  const after = await Queue.isFull(queue)
  return [before, after]
}

await runPromise(program) // => [false, true]
```

## sizeUnsafe

**Checking queue size synchronously**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)

  // Check size of empty queue
  const size1 = Queue.sizeUnsafe(queue)

  // Add some messages
  Queue.offerUnsafe(queue, 1)
  Queue.offerUnsafe(queue, 2)
  Queue.offerUnsafe(queue, 3)

  // Check size after adding messages
  const size2 = Queue.sizeUnsafe(queue)

  // End the queue
  Queue.endUnsafe(queue)

  // Ending retains the buffered size while the queue is Closing
  const size3 = Queue.sizeUnsafe(queue)
  return [size1, size2, size3]
}

await runPromise(program) // => [0, 3, 3]
```

## isFullUnsafe

**Checking fullness synchronously**

```efx
const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(3)

  const before = Queue.isFullUnsafe(queue)

  // Add some messages
  await Queue.offerAll(queue, [1, 2, 3])

  const after = Queue.isFullUnsafe(queue)
  return [before, after]
}

await runPromise(program) // => [false, true]
```

## into

**Running effects into queues**

```efx
import { Cause, Effect, Exit } from "effect"

const program = effect {
  const queue = await Queue.bounded<number, Cause.Done>(10)

  // Create an effect that succeeds
  const dataProcessing = effect {
    await yieldNow
    return "Processing completed successfully"
  }

  // Pipe the effect into the queue
  // If dataProcessing succeeds, queue ends successfully
  // If dataProcessing fails, queue fails with the error
  const effectIntoQueue = Queue.into(queue)(dataProcessing)

  const wasCompleted = await effectIntoQueue
  const exit = await Effect.exit(Queue.take(queue))
  return [wasCompleted, exit]
}

await runPromise(program) // => [true, Exit.fail(Cause.Done())]
```
