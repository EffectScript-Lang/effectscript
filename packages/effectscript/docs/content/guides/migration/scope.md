> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

# Scope

## `Scope.extend` → `Scope.provide`

`Scope.extend` has been renamed to `Scope.provide` in v4. The behavior is
identical: it provides a `Scope` to an effect that requires one, removing
`Scope` from the effect's requirements without closing the scope when the
effect completes.

The new name better reflects the operation — you are providing a service (the
`Scope`) to an effect, consistent with how other services are provided in
Effect.

**v3**

```efx

const program = effect {
  const scope = await Scope.make()
  await Scope.extend(myEffect, scope)
}
```

**v4**

```efx

const program = effect {
  const scope = await Scope.make()
  await Scope.provide(scope)(myEffect)
}
```

Both data-first and data-last (curried) forms are supported:

```efx
// data-first
Scope.provide(myEffect, scope)

// data-last (curried)
myEffect.pipe(Scope.provide(scope))
```

## Quick Reference

| v3             | v4              |
| -------------- | --------------- |
| `Scope.extend` | `Scope.provide` |
