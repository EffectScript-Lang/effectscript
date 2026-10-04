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
| [0036](0036-github-coordinates-under-effectscript-lang.md) | GitHub coordinates live under the EffectScript-Lang organization | Superseded by 0060 |
| [0037](0037-standalone-binary-runs-on-its-own-bun.md) | The standalone binary runs programs on its own Bun | Accepted |
| [0038](0038-install-channels-and-plan-10b.md) | Install channels, release assets, and moving `setup`/`--ai`/`skill` to Plan 10b | Accepted |
| [0039](0039-await-guardrails-in-the-editor.md) | The `await` guardrails in the editor | Accepted |
| [0040](0040-standalone-language-server-and-efx-lsp.md) | A standalone language server, run by `efx lsp` | Accepted |
| [0041](0041-vscode-extension-packaging-and-commands.md) | VS Code extension packaging and commands | Accepted |
| [0042](0042-docs-are-tsdoc-documented-once-with-doctests.md) | Docs are TSDoc comments, written once at the definition, with Elixir-style doctests | Accepted, amended by 0044 |
| [0043](0043-efx-docs-generator-and-blume.md) | `efx docs` is our own syntactic generator that writes Markdown for Blume | Accepted, amended by 0044, partly superseded by 0079 |
| [0044](0044-living-docs-review-amendments.md) | Living-docs amendments from the Plan 12 review | Accepted |
| [0045](0045-private-research-and-strategy-repo.md) | Research and strategy live in a private repository | Superseded by 0061 |
| [0050](0050-effect-docs-corpus-in-effectscript.md) | The Effect docs, translated to EffectScript by the reverse compiler | Accepted |
| [0051](0051-the-effectscript-agent-skill.md) | The EffectScript agent skill: generated where it can be, type-checked where it's written | Accepted |
| [0052](0052-efx-setup-targets-links-and-consent.md) | `efx setup`: what it touches, how it links the skill, and when it asks | Accepted, amended by 0059 |
| [0053](0053-efx8112-await-on-a-runtime-array.md) | EFX8112 warns when `await` gets an array built at runtime | Accepted |
| [0054](0054-site-stack-and-content-sources.md) | The site's stack deviations and where its content comes from | Accepted |
| [0055](0055-versioning-notes-and-packing-in-the-fork.md) | How EffectScript is versioned, noted and packed in a fork whose changesets are upstream's | Accepted, amended |
| [0056](0056-efx-fix.md) | `efx fix` rewrites through the round trip, and only EFX8101 | Accepted |
| [0057](0057-first-run-defaults.md) | The CLI's defaults for a first run | Accepted |
| [0058](0058-tree-sitter-grammar-and-zed.md) | A tree-sitter grammar that extends TypeScript's, and a Zed extension on it | Accepted |
| [0059](0059-efx-setup-upgrades-and-config-locations.md) | `efx setup` upgrades what it installed, and follows the tools' config variables | Accepted |
| [0060](0060-the-repository-is-effectscript-lang-effectscript.md) | The repository is `EffectScript-Lang/effectscript` | Accepted |
| [0061](0061-the-private-repository-is-effectscript-internal.md) | The private repository is `EffectScript-Lang/effectscript-internal` | Accepted |
| [0062](0062-release-order-grammar-pin-and-latest.md) | The grammar is pinned before the tag, and only the newest release is latest | Accepted |
| [0063](0063-match-guards-and-object-patterns.md) | `match` guards and object patterns | Accepted |
| [0064](0064-http-status-on-errors.md) | An error declares its HTTP status in its header | Accepted |
| [0065](0065-effect-methods-in-classes.md) | `effect` methods in classes are prototype methods returning `Effect.gen` | Accepted |
| [0066](0066-services-with-defaults.md) | A service with a `default` compiles to a `Context.Reference` | Accepted |
| [0067](0067-generator-streams.md) | `effect*` declares a generator stream on `Stream.callback` | Accepted |
| [0068](0068-linked-dev-install-of-the-editor-extension.md) | The editor extension installs from the checkout as a symlink | Accepted |
| [0069](0069-rpc-groups-and-generic-impl.md) | `rpc` groups, signature lines, and a generic `impl Name` | Accepted |
| [0070](0070-tools-and-toolkits.md) | `tool` declares an AI tool with its doc comment as the description | Accepted |
| [0071](0071-cluster-entities.md) | `entity` declares a cluster entity whose `impl` holds its state | Accepted |
| [0072](0072-workflows-and-activities.md) | A `workflow` declaration carries its body as its layer; `activity` is an expression | Accepted |
| [0073](0073-private-preview-of-the-site.md) | The site launches as a private preview behind an invite link, on Workers with `cf` | Accepted |
| [0074](0074-proofs-through-bend2-from-one-source.md) | Proofs go through Bend2, from one `.efx` source; Lean 4 is dropped | Accepted |
| [0075](0075-law-declarations.md) | `law` declares a rule the program must keep; it runs as a property test and is what a proof proves | Proposed |
| [0076](0076-the-bend-model.md) | The Bend model: what translates, how it's encoded, and what stays opaque | Proposed |
| [0077](0077-brand-declarations-and-where-checks.md) | `brand` takes its key from its name, and `where` adds checks | Accepted |
| [0078](0078-signal-colours-for-state.md) | Signal colours for state in a monochrome brand | Accepted, amended by 0085 (the playground) |
| [0079](0079-effectscript-dev-on-blume-with-a-public-theme.md) | effectscript.dev moves to Blume, with a public EffectScript theme | Accepted |
| [0080](0080-code-ligatures-on.md) | Code is set with JetBrains Mono's ligatures on | Accepted |
| [0081](0081-signature-clause-scopes.md) | The grammar scopes an effect's success, error and requirement types | Accepted |
| [0082](0082-the-landing-page-as-an-exhibition.md) | The landing page is an exhibition: computed rooms, vgpu WebGPU scenes and generated photography | Accepted |
| [0083](0083-language-extensions.md) | Abstractions outside Effect come as language extensions that never overlap | Accepted (mechanism open) |
| [0084](0084-the-playground-maps-each-part-live.md) | The playground is a full-screen editor that links each EffectScript part to its TypeScript | Accepted, partly superseded by 0085 |
| [0085](0085-the-playground-maps-concepts-and-colours-intent.md) | The playground maps whole concepts, colours code by intent, and previews decided syntax | Accepted |

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
