# ADR-0095: `layer Name for Service` implements a service declared anywhere

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** agent ruling, from the real-projects corpus (ADR-0094) and an AI rewrite of a
  t3code service in native EffectScript
- **Related:** ADR-0066 (services with defaults), ADR-0092 (the audit), ADR-0094; spec §4.8, §4.14

## Context

A `service` declaration holds its own layers (`layer = effect { … }`, `layer test = { … }`), and
their spans are named `Service.method`. Real Effect applications don't keep a service and its
implementations in one module. They declare tags in one place (`Services/`) and implement them in
another (`Layers/`), often several times (live, test, in-memory).

In the 16 real projects of ADR-0094:

- 1,470 implementations are written `Tag.of({ … })`;
- 745 layers are `Layer.effect(Tag, Effect.gen(…))`, and 188 are `Layer.effect(Tag, make…)`;
- 3,652 spans are named `"Service.method"`.

EffectScript had no form for this. The reverse compiler left every such layer as TypeScript. An
AI rewriting t3code's `ProviderAuthService.ts` natively still had to write
`ProviderAuthService.of({ … })` and a separate `Layer.effect(…)`, and its spans lost their
`ProviderAuthService.` prefix. That was the rewrite's first wish.

`impl Name { … }` can't be reused: it compiles to `Name.toLayer(…)`, which services don't have, and
an imported name doesn't say whether it is a service, an rpc group or a toolkit.

## Decision

- **Form:** `[export] layer Name for Service = <value> [|> …]`, where `Service` is a name or a
  dotted name (`Registry.Registry`). `for` is a keyword only after a top-level `layer`'s name, on
  its line.
- **Lowering**, exactly as a `service` body's `layer` lowers:
  - `effect { … }` → `Layer.effect(Service, Effect.gen(…))`, with every top-level `return { … }`
    wrapped in `Service.of(…)`;
  - `{ … }` → `Layer.succeed(Service, Service.of({ … }))`;
  - any other value → `Layer.effect(Service, value)`;
  - pipes resolve in the `Layer` namespace.
- **Spans** are named `Service.method` and `Service.helper`, after the last segment of a dotted
  name, for the returned object's `effect` methods and for the block's local `effect` functions:
  what a `service` body already does, and what real code writes by hand.
- **Reverse:** a top-level `const X = Layer.effect(S, Effect.gen(…))` whose returns are `S.of(…)`,
  `Layer.succeed(S, S.of({ … }))`, or `Layer.effect(S, value)` becomes `layer X for S = …`, where
  it compiles back to the same code (ADR-0030). A block that returns a bare object stays
  `Layer.effect(S, effect { … })`, since `for` would wrap it.
- **Editors:** tree-sitter gives `layer_declaration` an optional `service` field.

## Consequences

- An implementation reads as what it is: "the live layer for Users". The tag isn't repeated in
  `Layer.effect(Tag, …)` and `Tag.of(…)`, and spans keep their conventional names.
- Implementing a local `service` has two forms: inside its body (`layer = …`) and after it
  (`layer UsersLive for Users = …`). They mean the same thing except for where the layer lives, a
  static of the service versus its own binding, so they are two intents (ADR-0092 rule 3).
- `layer X for S` doesn't check that `S` is a service; TypeScript does, on `Layer.effect` and `S.of`.

## Alternatives considered

- **`layer X: Service = …`:** reads as a type annotation, and `X` is a `Layer`, not a `Service`
  (ADR-0092 rule 1, rule 5).
- **`impl Service { … }`:** `impl` builds a layer through the target's `toLayer`. Without types the
  compiler can't tell a service from an rpc group by an imported name.
- **Reopening a service (`service Users { layer live = … }` in another module):** a second
  declaration of the same class, which TypeScript has no meaning for.
