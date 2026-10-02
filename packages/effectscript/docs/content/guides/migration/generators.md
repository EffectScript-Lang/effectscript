> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

# Generators

## `Effect.gen`: Passing `this`

In v3, you could pass a `self` value directly as the first argument to
`Effect.gen`. In v4, `self` must be wrapped in an options object.

**v3**

```efx

class MyService {
  readonly local = 1
  compute = Effect.gen(this, function*() {
    return yield* succeed(this.local + 1)
  })
}
```

**v4**

```efx

class MyService {
  readonly local = 1
  compute = effect {
    return await succeed(this.local + 1)
  }
}
```
