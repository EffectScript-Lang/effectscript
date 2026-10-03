# effect/PubSub

The examples in the JSDoc of `packages/effect/src/PubSub.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## PubSub

**Publishing and subscribing to messages**

```efx
const program = scoped(effect {
  // Create a bounded PubSub with capacity 10
  const pubsub = await PubSub.bounded<string>(10)

  // Subscribe and consume messages
  const subscription = await PubSub.subscribe(pubsub)

  // Publish messages
  await PubSub.publish(pubsub, "Hello")
  await PubSub.publish(pubsub, "World")

  const message1 = await PubSub.take(subscription)
  const message2 = await PubSub.take(subscription)
  return [message1, message2]
})

const actual = await runPromise(program)
actual // => ["Hello", "World"]
```

## isPubSub

**Checking if a value is a PubSub**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(10)
  return [PubSub.isPubSub(pubsub), PubSub.isPubSub({}), PubSub.isPubSub(null)]
}

const actual = await runPromise(program)
actual // => [true, false, false]
```

## Subscription

**Taking messages from a subscription**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Subscribe within a scope for automatic cleanup
  const subscription: PubSub.Subscription<string> = await PubSub.subscribe(pubsub)

  await PubSub.publishAll(pubsub, ["msg1", "msg2", "msg3"])

  // Take individual messages
  const message = await PubSub.take(subscription)

  // Take multiple messages
  const messages = await PubSub.takeUpTo(subscription, 1)
  const allMessages = await PubSub.takeAll(subscription)
  return { message, messages, allMessages }
})

const actual = await runPromise(program)
actual // => { message: "msg1", messages: ["msg2"], allMessages: ["msg3"] }
```

## make

**Creating a PubSub with a custom strategy**

```efx
const program = effect {
  // Create custom PubSub with specific atomic implementation and strategy
  const pubsub = await PubSub.make<string>({
    atomicPubSub: () => PubSub.makeAtomicBounded(100),
    strategy: () => new PubSub.BackPressureStrategy()
  })

  // Use the created PubSub
  const published = await PubSub.publish(pubsub, "Hello")
  await PubSub.shutdown(pubsub)
  return published
}

const actual = await runPromise(program)
actual // => true
```

## bounded

**Creating a bounded PubSub**

```efx
const program = effect {
  // Create bounded PubSub with capacity 100
  const pubsub = await PubSub.bounded<string>(100)

  // Create with replay buffer for late subscribers
  const pubsubWithReplay = await PubSub.bounded<string>({
    capacity: 100,
    replay: 10 // Last 10 messages replayed to new subscribers
  })

  const capacities = [PubSub.capacity(pubsub), PubSub.capacity(pubsubWithReplay)]
  await PubSub.shutdown(pubsub)
  await PubSub.shutdown(pubsubWithReplay)
  return capacities
}

const actual = await runPromise(program)
actual // => [100, 100]
```

## dropping

**Dropping messages when full**

```efx
const program = scoped(effect {
  // Create dropping PubSub that drops new messages when full
  const pubsub = await PubSub.dropping<string>(3)

  const subscription = await PubSub.subscribe(pubsub)

  // Fill the PubSub and see dropping behavior
  await PubSub.publish(pubsub, "msg1") // succeeds
  await PubSub.publish(pubsub, "msg2") // succeeds
  await PubSub.publish(pubsub, "msg3") // succeeds
  const dropped = await PubSub.publish(pubsub, "msg4") // returns false (dropped)

  const messages = await PubSub.takeAll(subscription)
  return { dropped: !dropped, messages }
})

const actual = await runPromise(program)
actual // => { dropped: true, messages: ["msg1", "msg2", "msg3"] }
```

## sliding

**Sliding old messages when full**

```efx
const program = scoped(effect {
  // Create sliding PubSub that evicts old messages when full
  const pubsub = await PubSub.sliding<string>(3)

  const subscription = await PubSub.subscribe(pubsub)

  // Fill and overflow the PubSub
  await PubSub.publish(pubsub, "msg1")
  await PubSub.publish(pubsub, "msg2")
  await PubSub.publish(pubsub, "msg3")
  await PubSub.publish(pubsub, "msg4") // "msg1" is evicted

  return await PubSub.takeAll(subscription)
})

const actual = await runPromise(program)
actual // => ["msg2", "msg3", "msg4"]
```

## unbounded

**Creating an unbounded PubSub**

```efx
const program = scoped(effect {
  // Create unbounded PubSub
  const pubsub = await PubSub.unbounded<string>()

  const subscription = await PubSub.subscribe(pubsub)

  // Can publish unlimited messages
  for (let i = 0; i < 3; i++) {
    await PubSub.publish(pubsub, `message-${i}`)
  }

  return await PubSub.takeAll(subscription)
})

const actual = await runPromise(program)
actual // => ["message-0", "message-1", "message-2"]
```

## capacity

**Getting PubSub capacity**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(100)
  const unboundedPubsub = await PubSub.unbounded<string>()
  return [PubSub.capacity(pubsub), PubSub.capacity(unboundedPubsub)]
}

const actual = await runPromise(program)
actual // => [100, Number.MAX_SAFE_INTEGER]
```

## size

**Getting PubSub size**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Initially empty
  const initialSize = await PubSub.size(pubsub)

  const subscription = await PubSub.subscribe(pubsub)

  // Publish some messages for the active subscription
  await PubSub.publish(pubsub, "msg1")
  await PubSub.publish(pubsub, "msg2")

  const afterPublish = await PubSub.size(pubsub)
  const messages = await PubSub.takeAll(subscription)
  return { initialSize, afterPublish, messages }
})

const actual = await runPromise(program)
actual // => { initialSize: 0, afterPublish: 2, messages: ["msg1", "msg2"] }
```

## sizeUnsafe

**Reading size synchronously**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(2)
  return PubSub.sizeUnsafe(pubsub)
}

const actual = await runPromise(program)
actual // => 0
```

## isFull

**Checking whether a PubSub is full**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(2)

  // Initially not full
  const initiallyFull = await PubSub.isFull(pubsub)

  const subscription = await PubSub.subscribe(pubsub)

  // Fill the PubSub for the active subscription
  await PubSub.publish(pubsub, "msg1")
  await PubSub.publish(pubsub, "msg2")

  const nowFull = await PubSub.isFull(pubsub)
  const messages = await PubSub.takeAll(subscription)
  return { initiallyFull, nowFull, messages }
})

const actual = await runPromise(program)
actual // => { initiallyFull: false, nowFull: true, messages: ["msg1", "msg2"] }
```

## isEmpty

**Checking whether a PubSub is empty**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Initially empty
  const initiallyEmpty = await PubSub.isEmpty(pubsub)

  const subscription = await PubSub.subscribe(pubsub)

  // Publish a message for the active subscription
  await PubSub.publish(pubsub, "Hello")

  const nowEmpty = await PubSub.isEmpty(pubsub)
  const message = await PubSub.take(subscription)
  return { initiallyEmpty, nowEmpty, message }
})

const actual = await runPromise(program)
actual // => { initiallyEmpty: true, nowEmpty: false, message: "Hello" }
```

## shutdown

**Shutting down a PubSub**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(1)

  // Shutdown the PubSub
  await PubSub.shutdown(pubsub)

  const isShutdown = await PubSub.isShutdown(pubsub)

  // Publishing after shutdown returns false
  const published = await PubSub.publish(pubsub, "msg1")
  return { isShutdown, published }
}

const actual = await runPromise(program)
actual // => { isShutdown: true, published: false }
```

## end

**Ending a PubSub**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(2)
  const subscription = await PubSub.subscribe(pubsub)

  await PubSub.publish(pubsub, "Hello")
  const ended = await PubSub.end(pubsub, "Bye")

  // Later publishes are rejected
  const published = await PubSub.publish(pubsub, "World")

  // Buffered messages are delivered before the final message
  const first = await PubSub.take(subscription)
  const last = await PubSub.take(subscription)

  // Late subscribers receive the final message too
  const late = await PubSub.subscribe(pubsub)
  const lateMessage = await PubSub.take(late)
  return [ended, published, first, last, lateMessage]
})

const actual = await runPromise(program)
actual // => [true, false, "Hello", "Bye", "Bye"]
```

## isShutdown

**Checking whether a PubSub is shut down**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Initially not shutdown
  const initiallyShutdown = await PubSub.isShutdown(pubsub)

  // Shutdown the PubSub
  await PubSub.shutdown(pubsub)

  const nowShutdown = await PubSub.isShutdown(pubsub)
  return [initiallyShutdown, nowShutdown]
}

const actual = await runPromise(program)
actual // => [false, true]
```

## isShutdownUnsafe

**Checking shutdown synchronously**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(2)
  const initiallyShutdown = PubSub.isShutdownUnsafe(pubsub)
  await PubSub.shutdown(pubsub)
  return [initiallyShutdown, PubSub.isShutdownUnsafe(pubsub)]
}

const actual = await runPromise(program)
actual // => [false, true]
```

## awaitShutdown

**Waiting for shutdown**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Start a fiber that waits for shutdown
  const waiterFiber = await forkChild(
    effect {
      await PubSub.awaitShutdown(pubsub)
      return "PubSub has been shutdown!"
    }
  )

  // Shutdown the PubSub
  await PubSub.shutdown(pubsub)

  // The waiter will now complete
  return await Fiber.join(waiterFiber)
}

const actual = await runPromise(program)
actual // => "PubSub has been shutdown!"
```

## publish

**Publishing a message**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Publish a message
  const published = await PubSub.publish(pubsub, "Hello World")

  const subscription = await PubSub.subscribe(pubsub)

  await PubSub.publish(pubsub, "Hello")
  const message = await PubSub.take(subscription)
  return { published, message }
})

const actual = await runPromise(program)
actual // => { published: true, message: "Hello" }
```

## publishUnsafe

**Publishing without suspending**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(2)
  return PubSub.publishUnsafe(pubsub, "Hello")
}

const actual = await runPromise(program)
actual // => true
```

## publishAll

**Publishing multiple messages**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Publish multiple messages at once
  const allPublished = await PubSub.publishAll(pubsub, ["Hello", "World", "from", "Effect"])

  // With a smaller capacity and an active subscription
  const smallPubsub = await PubSub.bounded<string>(2)
  const subscription = await PubSub.subscribe(smallPubsub)

  // Will suspend until space becomes available for all messages
  const fiber = await forkChild(PubSub.publishAll(smallPubsub, ["msg1", "msg2", "msg3", "msg4"]))

  const firstBatch = await PubSub.takeBetween(subscription, 2, 2)
  const result = await Fiber.join(fiber)
  const secondBatch = await PubSub.takeAll(subscription)
  return { allPublished, firstBatch, result, secondBatch }
})

const actual = await runPromise(program)
actual // => { allPublished: true, firstBatch: ["msg1", "msg2"], result: true, secondBatch: ["msg3", "msg4"] }
```

## subscribe

**Subscribing to messages**

```efx
const program = effect {
  const pubsub = await PubSub.bounded<string>(10)

  // Subscribe within a scope for automatic cleanup
  const first = await scoped(effect {
    const subscription = await PubSub.subscribe(pubsub)

    // Publish some messages
    await PubSub.publish(pubsub, "Hello")
    await PubSub.publish(pubsub, "World")

    // Take messages one by one
    const msg1 = await PubSub.take(subscription)
    const msg2 = await PubSub.take(subscription)

    // Subscription is automatically cleaned up when scope exits
    return [msg1, msg2]
  })

  const second = await scoped(effect {
    const sub1 = await PubSub.subscribe(pubsub)
    const sub2 = await PubSub.subscribe(pubsub)

    // Multiple subscribers can receive the same messages
    await PubSub.publish(pubsub, "Broadcast")

    return await all([
      PubSub.take(sub1),
      PubSub.take(sub2)
    ])
  })
  return [first, second]
}

const actual = await runPromise(program)
actual // => [["Hello", "World"], ["Broadcast", "Broadcast"]]
```

## take

**Taking a message**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  const subscription = await PubSub.subscribe(pubsub)

  // Start a fiber to take a message (will suspend)
  const takeFiber = await forkChild(PubSub.take(subscription))

  // Publish a message
  await PubSub.publish(pubsub, "Hello")

  // The take will now complete
  return await Fiber.join(takeFiber)
})

const actual = await runPromise(program)
actual // => "Hello"
```

## takeAll

**Taking all available messages**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  const subscription = await PubSub.subscribe(pubsub)

  // Publish multiple messages
  await PubSub.publishAll(pubsub, ["msg1", "msg2", "msg3"])

  // Take all available messages at once
  return await PubSub.takeAll(subscription)
})

const actual = await runPromise(program)
actual // => ["msg1", "msg2", "msg3"]
```

## takeUpTo

**Taking up to a maximum number of messages**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  const subscription = await PubSub.subscribe(pubsub)

  // Publish multiple messages
  await PubSub.publishAll(pubsub, ["msg1", "msg2", "msg3", "msg4", "msg5"])

  // Take up to 3 messages
  const upTo3 = await PubSub.takeUpTo(subscription, 3)

  // Take up to 5 more (only 2 remaining)
  const upTo5 = await PubSub.takeUpTo(subscription, 5)

  // No more messages available
  const noMore = await PubSub.takeUpTo(subscription, 10)
  return [upTo3, upTo5, noMore]
})

const actual = await runPromise(program)
actual // => [["msg1", "msg2", "msg3"], ["msg4", "msg5"], []]
```

## takeBetween

**Taking between a minimum and maximum**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  const subscription = await PubSub.subscribe(pubsub)

  // Start taking between 2 and 5 messages (will suspend)
  const takeFiber = await forkChild(PubSub.takeBetween(subscription, 2, 5))

  // Publish 3 messages
  await PubSub.publishAll(pubsub, ["msg1", "msg2", "msg3"])

  // Now the take will complete with 3 messages
  return await Fiber.join(takeFiber)
})

const actual = await runPromise(program)
actual // => ["msg1", "msg2", "msg3"]
```

## remaining

**Checking remaining messages**

```efx
const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(10)

  const subscription = await PubSub.subscribe(pubsub)

  // Publish some messages
  await PubSub.publishAll(pubsub, ["msg1", "msg2", "msg3"])

  // Check how many messages are available
  const count = await PubSub.remaining(subscription)

  // Take one message
  const message = await PubSub.take(subscription)

  const remaining = await PubSub.remaining(subscription)
  return { count, message, remaining }
})

const actual = await runPromise(program)
actual // => { count: 3, message: "msg1", remaining: 2 }
```

## remainingUnsafe

**Checking remaining messages synchronously**

```efx
import { Effect, Option } from "effect"

const program = scoped(effect {
  const pubsub = await PubSub.bounded<string>(2)
  const subscription = await PubSub.subscribe(pubsub)
  return PubSub.remainingUnsafe(subscription)
})

const actual = await runPromise(program)
actual // => Option.some(0)
```

## DroppingStrategy

**Applying a dropping strategy**

```efx
const program = scoped(effect {
  // Explicitly create a PubSub with a dropping strategy
  const pubsub = await PubSub.make<string>({
    atomicPubSub: () => PubSub.makeAtomicBounded(2),
    strategy: () => new PubSub.DroppingStrategy()
  })

  const subscription = await PubSub.subscribe(pubsub)

  // Fill the PubSub
  const pub1 = await PubSub.publish(pubsub, "msg1") // true
  const pub2 = await PubSub.publish(pubsub, "msg2") // true
  const pub3 = await PubSub.publish(pubsub, "msg3") // false (dropped)

  // Subscribers will only see the first two messages
  const messages = await PubSub.takeAll(subscription)
  return { published: [pub1, pub2, pub3], messages }
})

const actual = await runPromise(program)
actual // => { published: [true, true, false], messages: ["msg1", "msg2"] }
```

## SlidingStrategy

**Applying a sliding strategy**

```efx
const program = scoped(effect {
  // Explicitly create a PubSub with a sliding strategy
  const pubsub = await PubSub.make<string>({
    atomicPubSub: () => PubSub.makeAtomicBounded(2),
    strategy: () => new PubSub.SlidingStrategy()
  })

  const subscription = await PubSub.subscribe(pubsub)

  // Publish messages that exceed capacity
  await PubSub.publish(pubsub, "msg1") // stored
  await PubSub.publish(pubsub, "msg2") // stored
  await PubSub.publish(pubsub, "msg3") // "msg1" evicted, "msg3" stored
  await PubSub.publish(pubsub, "msg4") // "msg2" evicted, "msg4" stored

  // Subscribers will see the most recent messages
  return await PubSub.takeAll(subscription)
})

const actual = await runPromise(program)
actual // => ["msg3", "msg4"]
```
