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
| [0027](0027-ambient-process-env-preserves-undefined.md) | Ambient `process.env.NAME` keeps its `string \| undefined` meaning | Accepted |
| [0028](0028-strict-mode-syntactic-rules.md)          | Strict-mode rules are syntactic; warnings never affect the superset guarantee | Accepted |
| [0029](0029-otlp-through-layer-from-config.md)        | `main` telemetry uses `Otlp.layerFromConfig`                  | Accepted |
| [0030](0030-reverse-rewrites-must-recompile-identically.md) | A reverse rewrite applies only where the forward compiler reproduces its input | Accepted |
| [0031](0031-reverse-compiler-in-two-plans.md) | Deliver the full reverse compiler in two plans | Accepted |
| [0032](0032-cli-integrations-distribution-in-three-plans.md) | Deliver phase 7 in three plans, with a dogfooded CLI that depends on `effect` | Accepted |
| [0033](0033-cli-conventions-and-convert-verification.md) | CLI argument passthrough and `efx convert` verification | Accepted |
| [0034](0034-efx-run-runtime-selection.md) | `efx run` picks Bun only when the project can run `main` on Bun | Accepted |
| [0035](0035-import-efx-with-its-extension.md) | Import `.efx` modules with their extension | Accepted |
| [0036](0036-github-coordinates-under-effectscript-lang.md) | GitHub coordinates live under the EffectScript-Lang organization | Accepted |
| [0037](0037-standalone-binary-runs-on-its-own-bun.md) | The standalone binary runs programs on its own Bun | Accepted |
| [0038](0038-install-channels-and-plan-10b.md) | Install channels, release assets, and moving `setup`/`--ai`/`skill` to Plan 10b | Accepted |
| [0039](0039-await-guardrails-in-the-editor.md) | The `await` guardrails in the editor | Accepted |
| [0040](0040-standalone-language-server-and-efx-lsp.md) | A standalone language server, run by `efx lsp` | Accepted |

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
