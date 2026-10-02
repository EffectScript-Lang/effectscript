# EffectScript pitfalls

Blocks marked `efx wrong` show the mistake, and the diagnostic the compiler reports when it
catches one.

## An effect that is never awaited never runs

An effect is a description. `save(user)` builds the description, and `await save(user)` runs it.

```efx wrong EFX8001
effect save(name: string) {
  console.log(`saving ${name}`)
}

export effect register(name: string) {
  save(name)
  return name
}
```

```efx
effect save(name: string) {
  console.log(`saving ${name}`)
}

export effect register(name: string) {
  await save(name)
  return name
}
```

An `effect { … }` block on its own line is never run either (EFX2003). Use `main { … }` for a
program's entry point.

## `await` takes an effect, not a Promise

Inside `effect` code, `await` is `yield*`. Awaiting a Promise is a type error: the editor shows
"Cannot `await` a Promise inside `effect`". When the Promise is visible in the code, `efx check`
reports EFX8111. Wrap Promise APIs with `tryPromise`.

```efx wrong EFX8111
export effect load(url: string) {
  const response = await fetch(url)
  return response.status
}
```

```efx
export error LoadFailed { cause: unknown }

export effect load(url: string) {
  const response = await tryPromise({ try: () => fetch(url), catch: (cause) => new LoadFailed({ cause }) })
  return response.status
}
```

## A final untyped `catch` also catches defects

Inside `effect` code, every `try` compiles to Effect error handling:

- **Typed clauses** (`catch (e: NotFound)`) catch failures by their tag.
- **A final untyped `catch (e)`** also catches defects, meaning exceptions thrown by plain code
  such as `JSON.parse`. A defect arrives as `UnknownError`, with the thrown value in `e.cause`.
- **Interruption** is never caught.
- **A handler that fails** passes its failure up; the other clauses never see it.

```efx
export effect parse(json: string) {
  try {
    return JSON.parse(json) as unknown
  } catch (e) {
    console.warn(`not JSON: ${String(e)}`)
    return null
  }
}
```

Outside `effect` code, `try` is plain JavaScript.

## `throw` fails with your error type, not an exception

In `effect` code, `throw e` is `return yield* Effect.fail(e)`. The error lands in the typed error
channel, so declare it (`error`) and name it (`throws`). Throwing a primitive is rejected
(EFX8004). Throwing `new Error(…)` works, but strict mode warns (EFX8103): prefer an `error`
declaration, which you can catch by tag.

```efx wrong EFX8004
export effect check(n: number) {
  if (n < 0) throw "negative"
  return n
}
```

## `effect` declarations are `const`s: they are not hoisted

`effect f() {}` compiles to `const f = Effect.fn("f")(…)`. Calling `f` at module top level before
its declaration is a temporal-dead-zone error. Code in `main` and in other `effect` bodies runs
later, so order doesn't matter there.

## Nested functions are boundaries

`await`, `throw`, `defer` and the ambient forms (`console.log`, `Date.now()`) apply to the `effect`
body itself, not to nested `function`s or arrows. Inside `.map((x) => …)`, `console.log` is plain
JavaScript again. To run effects per item, use `forEach(items, effect (x) => …)` or `await` the
array of effects.

## `using x = await …` only at the top of an `effect`

A scoped resource must live as long as the whole `effect`. Inside a nested block it is an error
(EFX2013). Move it up, or put the block in its own `effect { … }` and `await` it.

## Don't run effects inside effects

`Effect.runPromise` and its siblings inside `effect` code are errors (EFX8003). Use `await`, and
keep a single `main` (or the framework's runtime) at the edge.

## Free names become Effect builtins

A free identifier that names an Effect combinator (`retry`, `timeout`, `succeed`, `sleep`, …) is
imported from `effect` automatically. A local declaration or import of the same name always wins.
JavaScript globals (`fetch`, `name`, `status`, …) keep their JavaScript meaning; use the qualified
form for those (`Effect.void`, `Effect.exit`). `// @efx no-prelude` turns this off for a file.

## When to stay in plain TypeScript

Pure functions, types and utilities need no `effect`, and they read best as plain TypeScript. Use
`effect` where the code does something: I/O, errors that callers must handle, dependencies, and
resources.
