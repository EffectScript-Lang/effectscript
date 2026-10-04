# ADR-0070: `tool` declares an AI tool with its doc comment as the description

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 23 (phase 17), from the spec §14 roadmap
- **Related:** spec §4.14; ADR-0069 (signature lines and `impl`)

## Context

`effect/ai` describes a tool to a model with `Tool.make(name, { description, parameters,
success, failure })`, groups tools with `Toolkit.make`, and implements them with
`toolkit.toLayer(handlers)`. The description is what the model reads to decide when to call the
tool, so it is documentation that ships. `parameters` takes a schema (`Schema.Struct({ … })`),
unlike `Rpc.make`'s `payload`, which takes struct fields.

## Decision

- **`tool Name(field: T, …): A throws E`**, one signature line (ADR-0069) as a declaration. It
  compiles to `const Name = Tool.make("Name", { description, parameters: Schema.Struct({ … }),
  success: A, failure: E })`. The tool's name is the declaration's name.
- **The doc comment above the declaration is the description.** It also stays in the output, so
  editors show it on hover. No doc comment, no description.
- No fields → no `parameters` (Effect's empty default); no return type → no `success`; `throws A |
  B` → `failure: Schema.Union([A, B])`.
- **`toolkit Name { A, B }`** → `const Name = Toolkit.make(A, B)`.
- Handlers are written with `impl Name { … }` (ADR-0069), and receive the parameters.
- The reverse compiler gives `tool` back only when the `description` equals the doc comment above
  the declaration (or neither exists), and `toolkit` from `Toolkit.make` of plain references.

## Consequences

- A tool reads like a function signature with its documentation, and the model sees exactly the
  doc comment a person reads.
- `failureMode`, `dependencies`, `needsApproval`, dynamic and provider-defined tools stay
  TypeScript.
- **Cost if wrong:** a description that should differ from the doc comment needs TypeScript;
  a later annotation could add one.

## Alternatives considered

- **A `description "…"` clause:** duplicates the doc comment people already write, and the two
  drift apart.
- **Tools as lines inside `toolkit { … }`:** tools are often shared between toolkits; separate
  declarations can be listed in several.
