---
name: effectscript
description: Write, read, review and convert EffectScript (`.efx`), TypeScript with Effect as native syntax. Use when a project has `.efx` files or the `effectscript` package, when asked to write Effect code the EffectScript way, or to convert Effect TypeScript to EffectScript or back.
---

# EffectScript

EffectScript is TypeScript plus Effect v4 as syntax. Every `.ts` file is valid `.efx`, and every
`.efx` file compiles to plain, idiomatic Effect TypeScript, so there is no runtime and no lock-in.

## Workflow

1. **Check the project:** `.efx` files, `effectscript` in `package.json`, and a `tsconfig.json`
   with the `@effectscript/language` plugin. `efx doctor` reports what is missing; `efx init`
   sets it up.
2. **Write `.efx`.** Import other `.efx` modules with their extension: `import { x } from "./x.efx"`.
3. **See what it means:** `efx print src/x.efx` prints the TypeScript it compiles to. When unsure
   what a form does, print it.
4. **Verify:** `efx check` type-checks `.efx` and `.ts` together. Run the tests with the project's
   runner: `vitest` with the `effectscript/vite` plugin, or `bun test` with the
   `effectscript/bun-preload` preload. `efx run src/main.efx` runs a program.
5. **Convert:** `efx print src/x.ts` prints the EffectScript of a TypeScript file.
   `efx convert --write` converts a project on a new git branch and keeps it green. Inside `.efx`,
   `efx fix` rewrites leftover Effect TypeScript (`Effect.gen`, `Effect.fn`) as EffectScript.

## Core rules

- **Effectful code lives in `effect` functions and blocks.** Inside them, `await` runs an effect
  (it is `yield*`), `throw` fails with a typed error, and `console.log` logs through Effect.

  ```efx
  error UserNotFound { id: string }

  service Users {
    effect find(id: string): { name: string } throws UserNotFound
  }

  export effect greet(id: string): string throws UserNotFound needs Users {
    const user = await Users.find(id)
    console.log(`greeting ${user.name}`)
    return `Hello, ${user.name}`
  }
  ```

- **Write the contract in the signature:** `effect f(…): A throws E needs R`. Without `throws`
  the error channel is `never`, and without `needs` the function may use no services: the type
  checker holds you to both. Leave the return type out to let TypeScript infer all three.
- **Declare data, failures and dependencies.** Use `schema` for data, `error` for failures,
  `service` for dependencies, `config` for configuration, and `layer` for wiring.
- **Run once, at the edge:** `main { … } |> provide(AppLive)`. Never call `Effect.runPromise`
  inside `effect` code.
- **Compose with `|>`.** Effect's combinators are builtins when the name is free:
  `getUser(id) |> retry({ times: 3 }) |> timeout("5 seconds")`.
- **Run effects concurrently:** `const [a, b] = await [loadA, loadB]` (an array _literal_). For
  a computed list use `await all(effects)` or `await forEach(items, (x) => load(x))`; `await
  xs.map(f)` doesn't do what it looks like (EFX8112).
- **Handle errors with `try`:** `catch (e: NotFound)` catches by tag, and a final untyped `catch`
  catches the rest, defects included.
- **Branch on a union with `match`:** a `when` clause per case, checked for exhaustiveness. Match
  a `schema` union's cases by name, or literals with a `default`:

  ```efx
  schema Shape =
    | Circle { radius: number }
    | Square { side: number }

  export const area = (shape: Shape) =>
    match (shape) {
      when Circle({ radius }): Math.PI * radius ** 2
      when Square({ side }): side ** 2
    }
  ```

- **Clean up resources with `defer`** (Go-style, in reverse order) and `using x = await acquire`.

## `async` ↔ `effect`

| `async` TypeScript                | EffectScript                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `async function f() {}`           | `effect f() {}`                                                                    |
| `await promise`                   | `await effect` (an effect, never a Promise)                                        |
| `await somePromiseApi()`          | `await tryPromise(() => somePromiseApi())`: create the Promise inside the function |
| `throw new Error("x")`            | `throw new MyError({ … })` with `error MyError { … }`                              |
| `try` / `catch (e)` / `finally`   | the same, plus typed clauses `catch (e: NotFound)`                                 |
| `Promise.all([a, b])`             | `await [a, b]`                                                                     |
| `for await (const x of iterable)` | `for await (const x of stream)` over a `Stream`                                    |
| `using x = …` / `try … finally`   | `using x = await acquire` / `defer release`                                        |

The real difference is **laziness**. A Promise starts when it is created. An effect is a
description that runs only when it is `await`ed in `effect` code, or run by `main` or a test.
Calling `save(user)` without `await` does nothing. `efx check` reports it as a floating effect
(EFX8001).

## Effect best practices, the EffectScript way

| Practice                               | Write                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Reusable effectful functions           | `effect name(…) { … }`, not a function returning `effect { }`                |
| Inline effect code                     | `effect { … }` (not `Effect.gen`)                                            |
| Dependencies are services              | `service Users { effect find(id: string): User }` and `await Users.find(id)` |
| Failures are typed errors              | `error NotFound { id: string }` and `throw new NotFound({ id })`             |
| Parse, don't validate                  | a `schema`, decoded with `Schema.decodeUnknownEffect(User)(input)`           |
| Configuration                          | `config AppConfig { port: Port = 3000 }`                                     |
| Promises and callbacks at the boundary | `await tryPromise(() => makePromise())` once, in a service implementation    |
| Tests                                  | `test "…" { … }` inside `describe "…" { … }`                                 |
| One runtime entry point                | `main { … } \|> provide(AppLive)`                                            |

Plain TypeScript stays plain: pure functions, types and utilities need no `effect`.

## References

- [references/syntax.md](references/syntax.md): every construct with the TypeScript it compiles
  to, generated from the compiler's tests. Look up any form here.
- [references/patterns.md](references/patterns.md): services and layers, errors, schemas, config,
  testing, HTTP APIs, CLIs, resources, concurrency, retries and streams.
- [references/pitfalls.md](references/pitfalls.md): what trips people up. Read it before
  reviewing EffectScript.
- [references/effect-docs.md](references/effect-docs.md): Effect's own guide for agents, with
  the code in EffectScript.
