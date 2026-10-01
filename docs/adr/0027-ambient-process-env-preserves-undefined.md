# ADR-0027: Ambient `process.env.NAME` keeps its `string | undefined` meaning

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 4, from review D07 and §4.15
- **Related:** spec §4.15; review D07

## Context

Spec §4.15 lowered `process.env.NAME` to `yield* Config.String("NAME")`, which fails with a
`ConfigError` when the variable is unset. It also lowered `process.env.NAME ?? d` to
`Config.withDefault(d)`. That changes JavaScript meaning in two ways:

- `if (process.env.DEBUG)` would fail instead of being false.
- `withDefault(d)` evaluates `d` eagerly, while `??` only evaluates it when needed (D07).

## Decision

Inside `effect` code, a read of free `process.env.NAME` (or `process.env["NAME"]`) becomes:

```ts
(yield* Config.String("NAME").pipe(Config.withDefault(undefined)))
```

- The type stays `string | undefined`, and an unset variable is `undefined`, as in JavaScript.
- The read goes through the `ConfigProvider`, so tests can supply values.
- `??`, `||` and conditionals keep their JavaScript meaning and laziness, because they now apply to
  an ordinary value. There is no special `??` lowering.
- Writes (`process.env.X = …`), `delete`, dynamic keys and bare `process.env` are left alone.

## Consequences

- No surprising failures, and the default expression is evaluated lazily.
- Code that wants a required, typed config uses a `config` declaration (§4.14), which fails with
  `ConfigError` by design.

## Alternatives considered

- **`Config.String("NAME")` (the spec's version):** changes truthiness checks into failures.
- **A special `?? d` lowering with `Config.withDefault`:** evaluates `d` eagerly (D07).
