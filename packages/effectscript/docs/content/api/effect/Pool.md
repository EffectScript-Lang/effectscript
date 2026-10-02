# effect/Pool

The examples in the JSDoc of `packages/effect/src/Pool.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## makeWithTTL

**Creating a connection pool**

```efx

interface Connection {
  readonly execute: (sql: string) => Effect<ReadonlyArray<string>>
  readonly close: Effect<void>
}

const acquireDBConnection = acquireRelease(
  succeed({
    execute: (sql) => succeed([`executed: ${sql}`]),
    close: Effect.void
  } satisfies Connection),
  (connection) => connection.close
)

const program = scoped(
  flatMap(
    Pool.makeWithTTL({
      acquire: acquireDBConnection,
      min: 10,
      max: 20,
      timeToLive: Duration.seconds(60)
    }),
    (pool) => flatMap(Pool.get(pool), (connection) => connection.execute("select 1"))
  )
)

await runPromise(program) // => ["executed: select 1"]
```

## use

**Running a single operation with a pooled item**

```efx

const program = scoped(
  flatMap(
    Pool.make({ acquire: succeed("resource"), size: 2 }),
    (pool) => Pool.use(pool, (item) => succeed(item.length))
  )
)

await runPromise(program) // => 8
```
