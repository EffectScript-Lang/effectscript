# effect/TxReentrantLock

The examples in the JSDoc of `packages/effect/src/TxReentrantLock.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxReentrantLock

**Using read and write locks**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()

  // Multiple readers can proceed concurrently
  const read = await TxReentrantLock.withReadLock(lock, succeed("reading"))

  // Writer gets exclusive access
  const write = await TxReentrantLock.withWriteLock(lock, succeed("writing"))
  return [read, write]
}

await runPromise(program) // => ["reading", "writing"]
```

## make

**Creating a reentrant lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.locked(lock)
}

await runPromise(program) // => false
```

## acquireRead

**Acquiring a read lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  const count = await TxReentrantLock.acquireRead(lock)
  await TxReentrantLock.releaseRead(lock)
  return count
}

await runPromise(program) // => 1
```

## acquireWrite

**Acquiring a write lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  const count = await TxReentrantLock.acquireWrite(lock)
  await TxReentrantLock.releaseWrite(lock)
  return count
}

await runPromise(program) // => 1
```

## releaseReadFor

**Releasing a read lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  await TxReentrantLock.acquireRead(lock)
  return await TxReentrantLock.releaseRead(lock)
}

await runPromise(program) // => 0
```

## releaseWriteFor

**Releasing a write lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  await TxReentrantLock.acquireWrite(lock)
  return await TxReentrantLock.releaseWrite(lock)
}

await runPromise(program) // => 0
```

## readLock

**Holding a scoped read lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()

  const held = await scoped(
    effect {
      await TxReentrantLock.readLock(lock)
      // read lock is held for the duration of the scope
      return await TxReentrantLock.readLocks(lock)
    }
  )
  // read lock is released
  return [held, await TxReentrantLock.readLocks(lock)]
}

await runPromise(program) // => [1, 0]
```

## writeLock

**Holding a scoped write lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()

  const held = await scoped(
    effect {
      await TxReentrantLock.writeLock(lock)
      // write lock is held for the duration of the scope
      return await TxReentrantLock.writeLocks(lock)
    }
  )
  // write lock is released
  return [held, await TxReentrantLock.writeLocks(lock)]
}

await runPromise(program) // => [1, 0]
```

## withReadLock

**Running an effect with a read lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.withReadLock(
    lock,
    succeed("read data")
  )
}

await runPromise(program) // => "read data"
```

## withWriteLock

**Running an effect with a write lock**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.withWriteLock(
    lock,
    succeed("wrote data")
  )
}

await runPromise(program) // => "wrote data"
```

## withLock

**Running an effect with exclusive access**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.withLock(
    lock,
    succeed("exclusive operation")
  )
}

await runPromise(program) // => "exclusive operation"
```

## readLocks

**Counting read locks**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  await TxReentrantLock.acquireRead(lock)
  const count = await TxReentrantLock.readLocks(lock)
  await TxReentrantLock.releaseRead(lock)
  return count
}

await runPromise(program) // => 1
```

## writeLocks

**Counting write locks**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.writeLocks(lock)
}

await runPromise(program) // => 0
```

## locked

**Checking whether a lock is held**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.locked(lock)
}

await runPromise(program) // => false
```

## readLocked

**Checking whether a read lock is held**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.readLocked(lock)
}

await runPromise(program) // => false
```

## writeLocked

**Checking whether a write lock is held**

```efx

const program = effect {
  const lock = await TxReentrantLock.make()
  return await TxReentrantLock.writeLocked(lock)
}

await runPromise(program) // => false
```

## isTxReentrantLock

**Checking for TxReentrantLock values**

```efx
import { TxReentrantLock } from "effect"

const someValue: unknown = {}

TxReentrantLock.isTxReentrantLock(someValue) // => false
```
