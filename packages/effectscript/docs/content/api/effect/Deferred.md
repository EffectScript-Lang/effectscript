# effect/Deferred

The examples in the JSDoc of `packages/effect/src/Deferred.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## Deferred

**Creating a Deferred for inter-fiber communication**

```efx

const program = effect {
  const deferred: Deferred<string> = await Deferred.make<string>()
  const producer = await forkChild(
    effect {
      await Deferred.succeed(deferred, "Hello, World!")
    }
  )

  const consumer = await forkChild(Deferred.await(deferred))
  await Fiber.join(producer)
  return await Fiber.join(consumer)
}

await runPromise(program) // => "Hello, World!"
```

## makeUnsafe

**Creating a Deferred unsafely**

```efx
import { Deferred } from "effect"

const deferred = Deferred.makeUnsafe<number>()
Deferred.isDoneUnsafe(deferred) // => false
```

## make

**Creating a Deferred**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  await Deferred.succeed(deferred, 42)
  return await Deferred.await(deferred)
}

await runPromise(program) // => 42
```

## Module

**Awaiting a Deferred value**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  await Deferred.succeed(deferred, 42)

  return await Deferred.await(deferred)
}

await runPromise(program) // => 42
```

## complete

**Completing a Deferred from an effect**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  const completed = await Deferred.complete(deferred, succeed(42))
  const value = await Deferred.await(deferred)
  return [completed, value]
}

await runPromise(program) // => [true, 42]
```

## completeWith

**Completing a Deferred with an effect**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  const completed = await Deferred.completeWith(deferred, succeed(42))
  const value = await Deferred.await(deferred)
  return [completed, value]
}

await runPromise(program) // => [true, 42]
```

## done

**Completing a Deferred with an Exit**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  await Deferred.done(deferred, Exit.succeed(42))
  return await exit(Deferred.await(deferred))
}

await runPromise(program) // => Exit.succeed(42)
```

## fail

**Failing a Deferred with an error**

```efx
import { Deferred, Effect, Exit } from "effect"

const program = effect {
  const deferred = await Deferred.make<number, string>()
  const success = await Deferred.fail(deferred, "Operation failed")
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.fail("Operation failed")]
```

## failSync

**Failing a Deferred with a lazy error**

```efx
import { Deferred, Effect, Exit } from "effect"

const program = effect {
  const deferred = await Deferred.make<number, string>()
  const success = await Deferred.failSync(deferred, () => "Lazy error")
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.fail("Lazy error")]
```

## failCause

**Failing a Deferred with a Cause**

```efx
import { Cause, Deferred, Effect, Exit } from "effect"

const program = effect {
  const deferred = await Deferred.make<number, string>()
  const success = await Deferred.failCause(deferred, Cause.fail("Operation failed"))
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.failCause(Cause.fail("Operation failed"))]
```

## failCauseSync

**Failing a Deferred with a lazy Cause**

```efx
import { Cause, Deferred, Effect, Exit } from "effect"

const program = effect {
  const deferred = await Deferred.make<number, string>()
  const success = await Deferred.failCauseSync(deferred, () => Cause.fail("Lazy error"))
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.failCause(Cause.fail("Lazy error"))]
```

## die

**Killing a Deferred with a defect**

```efx
import { Deferred, Effect, Exit } from "effect"

const defect = new Error("Something went wrong")
const program = effect {
  const deferred = await Deferred.make<number>()
  const success = await Deferred.die(deferred, defect)
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.die(defect)]
```

## dieSync

**Killing a Deferred with a lazy defect**

```efx
import { Deferred, Effect, Exit } from "effect"

const defect = new Error("Lazy error")
const program = effect {
  const deferred = await Deferred.make<number>()
  const success = await Deferred.dieSync(deferred, () => defect)
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.die(defect)]
```

## interrupt

**Interrupting a Deferred**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  const success = await Deferred.interrupt(deferred)
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit] as const
}

const [success, exit] = await runPromise(program)
success // => true
Exit.hasInterrupts(exit) // => true
```

## interruptWith

**Interrupting a Deferred with a fiber id**

```efx
import { Deferred, Effect, Exit } from "effect"

const program = effect {
  const deferred = await Deferred.make<number>()
  const success = await Deferred.interruptWith(deferred, 42)
  const exit = await Effect.exit(Deferred.await(deferred))
  return [success, exit]
}

await runPromise(program) // => [true, Exit.interrupt(42)]
```

## isDone

**Checking Deferred completion**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  const beforeCompletion = await Deferred.isDone(deferred)
  await Deferred.succeed(deferred, 42)
  const afterCompletion = await Deferred.isDone(deferred)
  return [beforeCompletion, afterCompletion]
}

await runPromise(program) // => [false, true]
```

## poll

**Polling Deferred completion**

```efx
import { Deferred, Effect, Option } from "effect"

const program = effect {
  const deferred = await Deferred.make<number>()
  const beforeCompletion = await Deferred.poll(deferred)
  await Deferred.succeed(deferred, 42)
  const afterCompletion = await Deferred.poll(deferred)
  const afterValue = await transposeOption(afterCompletion)
  return [beforeCompletion, afterValue]
}

await runPromise(program) // => [Option.none(), Option.some(42)]
```

## succeed

**Completing a Deferred with a value**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  await Deferred.succeed(deferred, 42)

  return await Deferred.await(deferred)
}

await runPromise(program) // => 42
```

## sync

**Completing a Deferred with a lazy value**

```efx

const program = effect {
  const deferred = await Deferred.make<number>()
  await Deferred.sync(deferred, () => 42)
  return await Deferred.await(deferred)
}

await runPromise(program) // => 42
```

## doneUnsafe

**Completing a Deferred unsafely**

```efx

const deferred = Deferred.makeUnsafe<number>()
Deferred.doneUnsafe(deferred, succeed(42)) // => true
```

## into

**Completing a Deferred from an effect result**

```efx

const successEffect = succeed(42)

const program = effect {
  const deferred = await Deferred.make<number, string>()
  const isCompleted = await Deferred.into(successEffect, deferred)
  const value = await Deferred.await(deferred)
  return [isCompleted, value]
}

await runPromise(program) // => [true, 42]
```
