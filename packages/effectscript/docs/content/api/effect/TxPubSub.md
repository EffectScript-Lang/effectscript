# effect/TxPubSub

The examples in the JSDoc of `packages/effect/src/TxPubSub.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## TxPubSub

**Subscribing to a transactional pub/sub**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<string>()

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, "hello")
      return await TxQueue.take(sub)
    }
  )
}

await runPromise(program) // => "hello"
```

## bounded

**Creating a bounded pub/sub**

```efx

const program = effect {
  const hub = await TxPubSub.bounded<number>(16)

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, 42)
      return await TxQueue.take(sub)
    }
  )
}

await runPromise(program) // => 42
```

## dropping

**Creating a dropping pub/sub**

```efx

const program = effect {
  const hub = await TxPubSub.dropping<number>(2)

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, 1)
      await TxPubSub.publish(hub, 2)
      await TxPubSub.publish(hub, 3) // dropped
      const v1 = await TxQueue.take(sub)
      const v2 = await TxQueue.take(sub)
      return [v1, v2]
    }
  )
}

await runPromise(program) // => [1, 2]
```

## sliding

**Creating a sliding pub/sub**

```efx

const program = effect {
  const hub = await TxPubSub.sliding<number>(2)

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, 1)
      await TxPubSub.publish(hub, 2)
      await TxPubSub.publish(hub, 3) // evicts 1
      return await TxQueue.take(sub)
    }
  )
}

await runPromise(program) // => 2
```

## unbounded

**Creating an unbounded pub/sub**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<string>()

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, "msg")
      return await TxQueue.take(sub)
    }
  )
}

await runPromise(program) // => "msg"
```

## capacity

**Reading pub/sub capacity**

```efx

const program = effect {
  const hub = await TxPubSub.bounded<number>(16)
  return TxPubSub.capacity(hub)
}

await runPromise(program) // => 16
```

## size

**Reading subscriber queue size**

```efx
import { Effect, TxPubSub, TxQueue } from "effect"

const program = effect {
  const hub = await TxPubSub.unbounded<number>()

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, 1)
      await TxPubSub.publish(hub, 2)
      return await TxPubSub.size(hub)
    }
  )
}

await runPromise(program) // => 2
```

## isEmpty

**Checking whether a pub/sub is empty**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<number>()
  return await TxPubSub.isEmpty(hub)
}

await runPromise(program) // => true
```

## isNonEmpty

**Checking whether a pub/sub is non-empty**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<number>()
  const empty = await TxPubSub.isNonEmpty(hub)

  const nonEmpty = await scoped(effect {
    await TxPubSub.subscribe(hub)
    await TxPubSub.publish(hub, 1)
    return await TxPubSub.isNonEmpty(hub)
  })
  return [empty, nonEmpty] as const
}

await runPromise(program) // => [false, true]
```

## isFull

**Checking whether a pub/sub is full**

```efx

const program = effect {
  const hub = await TxPubSub.bounded<number>(2)
  return await TxPubSub.isFull(hub)
}

await runPromise(program) // => false
```

## isShutdown

**Checking whether a pub/sub is shut down**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<number>()
  const before = await TxPubSub.isShutdown(hub)
  await TxPubSub.shutdown(hub)
  return [before, await TxPubSub.isShutdown(hub)]
}

await runPromise(program) // => [false, true]
```

## publish

**Publishing a message to subscribers**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<string>()

  // No subscribers - publish is a no-op
  const r1 = await TxPubSub.publish(hub, "no one listening")

  const msg = await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publish(hub, "hello")
      return await TxQueue.take(sub)
    }
  )
  return [r1, msg]
}

await runPromise(program) // => [true, "hello"]
```

## publishAll

**Publishing multiple messages to subscribers**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<number>()

  return await scoped(
    effect {
      const sub = await TxPubSub.subscribe(hub)
      await TxPubSub.publishAll(hub, [1, 2, 3])
      const v1 = await TxQueue.take(sub)
      const v2 = await TxQueue.take(sub)
      const v3 = await TxQueue.take(sub)
      return [v1, v2, v3]
    }
  )
}

await runPromise(program) // => [1, 2, 3]
```

## subscribe

**Subscribing multiple queues**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<string>()

  return await scoped(
    effect {
      const sub1 = await TxPubSub.subscribe(hub)
      const sub2 = await TxPubSub.subscribe(hub)

      await TxPubSub.publish(hub, "broadcast")

      const msg1 = await TxQueue.take(sub1)
      const msg2 = await TxQueue.take(sub2)
      return [msg1, msg2]
    }
  )
}

await runPromise(program) // => ["broadcast", "broadcast"]
```

## shutdown

**Shutting down a pub/sub**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<number>()
  await TxPubSub.shutdown(hub)

  const shut = await TxPubSub.isShutdown(hub)
  const accepted = await TxPubSub.publish(hub, 1)
  return [shut, accepted]
}

await runPromise(program) // => [true, false]
```

## awaitShutdown

**Waiting for shutdown**

```efx

const program = effect {
  const hub = await TxPubSub.unbounded<number>()

  const fiber = await forkChild(TxPubSub.awaitShutdown(hub))
  await TxPubSub.shutdown(hub)
  await Fiber.await(fiber)
  return await TxPubSub.isShutdown(hub)
}

await runPromise(program) // => true
```

## isTxPubSub

**Checking for a TxPubSub**

```efx
import { TxPubSub } from "effect"

const someValue: unknown = {}
TxPubSub.isTxPubSub(someValue) // => false
```
