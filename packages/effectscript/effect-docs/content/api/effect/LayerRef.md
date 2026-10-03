# effect/LayerRef

The examples in the JSDoc of `packages/effect/src/LayerRef.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## make

**Sharing one layer-built service**

```efx
service Database {
  readonly query: Effect<string>
}

const databaseLayer = Layer.succeed(Database, {
  query: succeed("result")
})

const query = effect {
  const database = await Database
  return await database.query
}

const program = scoped(
  effect {
    const ref = await LayerRef.make(databaseLayer, {
      idleTimeToLive: "5 seconds"
    })

    const result = await provide(query, ref.get)

    await ref.invalidate

    return result
  }
)

await runPromise(program) // => "result"
```

## Service

**Defining a refreshable service**

```efx
service Database {
  readonly query: Effect<string>
}

const databaseLayer = Layer.succeed(Database, {
  query: succeed("result")
})

class DatabaseRef extends LayerRef.Service<DatabaseRef>()("DatabaseRef", {
  layer: databaseLayer,
  preload: true
}) {}

const program = effect {
  const database = await Database
  return await database.query
}
  |> provide(DatabaseRef.get)
  |> provide(DatabaseRef.layer)

await runPromise(program) // => "result"
```
