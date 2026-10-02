# effect/TxDeferred

The examples in the JSDoc of `packages/effect/src/TxDeferred.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxDeferred

**Completing a transactional deferred**

```efx

const program = effect {
  const deferred = await TxDeferred.make<number>()

  // Complete the deferred
  const first = await TxDeferred.succeed(deferred, 42)

  // Second write is a no-op
  const second = await TxDeferred.succeed(deferred, 99)

  // Read the value
  const value = await TxDeferred.await(deferred)
  return [first, second, value]
}

await runPromise(program) // => [true, false, 42]
```

## make

**Creating a transactional deferred**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const deferred = await TxDeferred.make<string, Error>()
  return await TxDeferred.poll(deferred)
}

await runPromise(program) // => Option.none()
```

## await_

**Awaiting a deferred value**

```efx

const program = effect {
  const deferred = await TxDeferred.make<number>()
  await TxDeferred.succeed(deferred, 42)
  return await TxDeferred.await(deferred)
}

await runPromise(program) // => 42
```

## poll

**Polling a deferred**

```efx
import { Effect, Option, Result } from "effect"

const program = effect {
  const deferred = await TxDeferred.make<number>()
  const before = await TxDeferred.poll(deferred)

  await TxDeferred.succeed(deferred, 42)
  const after = await TxDeferred.poll(deferred)
  return [before, after]
}

await runPromise(program) // => [Option.none(), Option.some(Result.succeed(42))]
```

## done

**Completing with a result**

```efx

const program = effect {
  const deferred = await TxDeferred.make<number, string>()
  const first = await TxDeferred.done(deferred, Result.succeed(42))
  const second = await TxDeferred.done(deferred, Result.succeed(99))
  return [first, second]
}

await runPromise(program) // => [true, false]
```

## succeed

**Completing with a success value**

```efx

const program = effect {
  const deferred = await TxDeferred.make<number>()
  const first = await TxDeferred.succeed(deferred, 42)
  const second = await TxDeferred.succeed(deferred, 99)
  return [first, second]
}

await runPromise(program) // => [true, false]
```

## fail

**Completing with a failure**

```efx
import { Cause, Effect, Exit, Option } from "effect"

const program = effect {
  const deferred = await TxDeferred.make<number, string>()
  const first = await TxDeferred.fail(deferred, "boom")
  const second = await TxDeferred.fail(deferred, "boom2")
  const exit = await Effect.exit(TxDeferred.await(deferred))
  return [first, second, exit, Exit.getCause(exit)]
}

await runPromise(program) // => [true, false, Exit.fail("boom"), Option.some(Cause.fail("boom"))]
```

## isTxDeferred

**Checking transactional deferreds**

```efx

const program = effect {
  const deferred = await TxDeferred.make<number>()
  return [TxDeferred.isTxDeferred(deferred), TxDeferred.isTxDeferred("not a deferred")]
}

await runPromise(program) // => [true, false]
```
