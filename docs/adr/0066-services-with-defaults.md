# ADR-0066: A service with a `default` compiles to a `Context.Reference`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 22 (phase 16), from the spec §14 roadmap
- **Related:** spec §4.8; ADR-0014 (service keys)

## Context

A `service` compiles to a `Context.Service` class: code that uses it must have a layer
provided, and its type says so (`needs Users`). Some services have an obvious default (a clock, a
logger, a feature flag source) that tests or deployments override. Effect models those as
`Context.Reference`: a key with a `defaultValue`, which is never a requirement.

The class form of `Context.Service` accepts no `defaultValue` in its types, and its identifier is
the class, so a class-based service always shows up as a requirement. There is no class form of
`Context.Reference`.

## Decision

- **Syntax:** a `default = <value>` member in a `service`.
- **Output:**

  ```ts
  export interface Greeter {
    greet(name: string): Effect.Effect<string>
  }
  const GreeterReference = Context.Reference<Greeter>("app/Greeter", {
    defaultValue: () => ({ greet: … })
  })
  export const Greeter = Object.assign(GreeterReference, {
    layerTest: Layer.succeed(GreeterReference, GreeterReference.of({ … })),
    greet: (name: string) => GreeterReference.use((_) => _.greet(name))
  })
  ```

  The interface carries the shape; the reference carries the key and the default; the
  `Object.assign` puts the layers and the accessors where a class-based service has its statics,
  so call sites read the same.
- **The default is a plain value.** It is built on first use without running effects; an `effect`
  block (or a pipeline) there is error EFX4004, with a hint to use a `layer`.
- The reference's local name is fresh (`GreeterReference`, or `GreeterReference2` when taken)
  and is not exported.
- The reverse compiler gives the `service` back from the three statements when they are exactly
  as generated, with a blank line before the default and each layer.

## Consequences

- An effect that uses a service with a default type-checks and runs with nothing provided, and a
  provided layer overrides the default.
- The service is an interface plus a constant, not a class: `instanceof` and class statics beyond
  the generated ones aren't available, which a class-based service doesn't offer either.
- `Object.assign` adds the accessors onto the reference object itself.
- **Cost if wrong:** if Effect adds a class form for references, the output could move to it with a
  superseding ADR; call sites wouldn't change.

## Alternatives considered

- **The class form with `Self = never` and a cast for `defaultValue`:** keeps a class, but needs a
  type assertion in every output and an identifier that isn't the class.
- **A plain `Context.Reference` constant without accessors:** `Greeter.greet(…)` would stop
  working, and the service would read differently from every other one.
- **An effectful default (`default = effect { … }`):** Effect's references build their default
  synchronously; effects belong in a layer.

## Amendment 1 (Plan 22 final review)

- An effect member whose name the reference owns (`name`, `length`, `key`, `use`, `of`, `pipe`,
  `defaultValue`, …) gets no accessor, with warning EFX4003, as in a class-form service:
  `Object.assign` would overwrite the reference's own property.
- A field named `default` without a value is part of the shape, not a default.
