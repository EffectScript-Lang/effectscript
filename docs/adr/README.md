# Architecture Decision Records

Each file records one decision: the context, what was decided, what it costs, and the alternatives
that were rejected and why. The record is how future agents and people learn *why* something is
the way it is. See the "Architecture Decision Records" section of `.agents/AGENTS.md` for when to
write one.

Decisions evolve. To change one, write a new ADR that supersedes it, and set the old ADR's status
to `Superseded by ADR-NNNN`. Never rewrite an accepted decision in place.

## Index

| ADR                                                   | Title                                                         | Status   |
| ----------------------------------------------------- | ------------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)         | Record architecture decisions                                 | Accepted |
| [0002](0002-typescript-superset-efx-extension.md)     | A TypeScript superset with one `.efx` extension               | Accepted |
| [0003](0003-in-place-compilation-to-idiomatic-effect.md) | Compile in place to idiomatic Effect TypeScript             | Accepted |
| [0004](0004-acorn-parser-no-typescript-fork.md)       | Parse with acorn plugins; no TypeScript fork, no wasm         | Accepted |
| [0005](0005-effect-keyword.md)                        | `effect` is the keyword                                       | Accepted |
| [0006](0006-await-as-effect-bind.md)                  | `await` binds effects, with guardrails                        | Accepted |
| [0007](0007-prelude-and-bare-builtins.md)             | Automatic prelude and bare Effect builtins                    | Accepted |
| [0008](0008-monorepo-fork-and-public-org.md)          | Live in a public fork of the Effect monorepo                  | Accepted |
| [0009](0009-hygienic-generated-references.md)         | Generated references are hygienic                             | Accepted |
| [0010](0010-try-catch-contract.md)                    | One `try`/`catch` contract inside `effect` code               | Accepted |
| [0011](0011-resource-lifetimes.md)                    | `using` is function-level only; `defer` is function-scoped    | Accepted |
| [0012](0012-pipeline-evaluation-order.md)             | Pipelines evaluate the head first                             | Accepted |
| [0013](0013-exact-optional-schema-fields.md)          | `name?: T` maps to `Schema.optionalKey`                       | Accepted |
| [0014](0014-service-key-module-identity.md)           | Service keys include the module                               | Accepted, amended by 0018 |
| [0015](0015-lockstep-versioning.md)                   | Version in lockstep with Effect                               | Accepted |
| [0016](0016-harden-then-adoption-slice.md)            | Harden semantics, then prove an adoption slice                | Accepted |
| [0017](0017-syntactic-vs-checker-diagnostics.md)      | Syntactic diagnostics in the compiler, typed ones in the checker | Accepted |
| [0018](0018-relative-filenames-in-service-keys.md)    | Relative filenames keep their directories in service keys    | Accepted |
| [0019](0019-volar-on-typescript-6-js-api.md)          | Editor and checker integration through Volar on the TS 6 JS API | Accepted |
| [0020](0020-incomplete-code-recovery.md)              | Recover incomplete code by neutralizing failing lines         | Accepted |
| [0021](0021-node-runtime-register-hooks.md)           | Run `.efx` on Node with `registerHooks` and transform stripping | Accepted, amended by 0024 and 0026 |
| [0022](0022-build-staging-and-typescript-emit.md)     | `efx build` compiles to a staging tree, then TypeScript emits | Accepted |
| [0023](0023-reverse-compiler-subset.md)               | Ship the reverse compiler for the adoption-slice subset first | Accepted |
| [0024](0024-register-strip-mode-fallback.md)          | `effectscript/register` falls back to strip mode              | Accepted, amended by 0026 |
| [0025](0025-launch-film-made-from-code.md)            | The launch film is made from code; generated photos are plates only | Accepted |
| [0026](0026-register-strip-first-with-source-maps.md)  | `effectscript/register` strips first and maps stack traces to `.efx` | Accepted |

## Template

```markdown
# ADR-NNNN: <decision as a short statement>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** <who decided: the user, an agent ruling, a review>
- **Related:** <spec sections, plans, reviews, other ADRs>

## Context

<The forces at play: the problem, the constraints, the evidence.>

## Decision

<What was decided, precisely enough to implement and test.>

## Consequences

<What becomes easier, what becomes harder, what it costs if wrong, and how we'd notice.>

## Alternatives considered

- **<Alternative>:** <why it was rejected>.
```
