This is the Effect TypeScript monorepo. The git base branch is `main`; use `pnpm` from the repository root.

## Layout

- Core library source, runtime tests, and type tests are in `packages/effect/src`, `packages/effect/test`, and
  `packages/effect/typetest`.
- Other package families include `packages/ai`, `packages/atom`, `packages/platform`, `packages/sql`, and
  `packages/tools`; standalone packages also live directly under `packages`.
- Package tests and type tests live beside source in `test` and `typetest` directories.
- AI documentation sources are in `ai-docs/src`.
- Changesets are in `.changeset`.
- Migration sources (v3-to-v4) are in `migration/annotations`.
- Inspect nearby code before editing.

## Validation

Use the narrowest validation that covers the change:

| Change type                        | Validation                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Runtime source or test changes     | `pnpm lint-fix`, targeted `pnpm test --run <test_file.ts>`, `pnpm check`           |
| Type-system behavior or type tests | Targeted `pnpm test-types <filename>`, plus `pnpm check` when source types changed |
| JSDoc text/category/link changes   | `pnpm jsdocs --check`, `pnpm lint`                                                 |
| JSDoc example changes              | `pnpm jsdocs --check`, `pnpm lint`, root `pnpm doctest --run <files>`              |
| Docs-only changes                  | `pnpm lint-fix`; no tests unless examples or code changed                          |

Choose coverage from the contract being changed. Runtime tests cover executed
behavior. Tstyche tests cover intended compiler behavior such as inference,
assignability, rejection, or displayed public types. An ordinary source edit or
exported declaration is covered by `pnpm check` unless compiler behavior is part
of the task.

Never run bare `pnpm test` or `pnpm doctest`; both start the full suite in watch mode. Always pass `--run` and the
specific files covering the change. CI runs the full suite.

For an ad hoc runnable probe, create `scratchpad/<name>.ts`, run it with plain `node`, and remove it when finished.

Report any commands that could not be run.

## Generated Files

Do not edit generated output directly.

Some `index.ts` sections marked with `@barrel` are generated. Do not edit those
sections manually; update their source modules and run `pnpm codegen`.
Hand-maintained `index.ts` files and unmarked sections are not covered by this
rule.

`LLMS.md` is generated from `ai-docs/src`, and `migration/v3-to-v4.md` is
generated from `migration/annotations`. Update checked-in third-party assets
through their generator or documented import procedure.

## Architecture Decision Records

Every decision gets a written rationale in `docs/adr/`, so future agents and people know why
something is the way it is, not only what it is.

- **What needs an ADR:** any choice that shapes language semantics, compiler output, public APIs,
  architecture, tooling, versioning, delivery order, or process, and any choice among real
  alternatives that a later reader could reasonably question. Bug fixes and refactors that keep a
  documented contract don't need one.
- **When:** in the same change that implements the decision. A decision made in conversation
  with the user, in a review, or as a ruling while executing a plan is recorded before or with
  the code that depends on it.
- **Before changing a decided area:** read `docs/adr/README.md` and the ADRs it lists for that
  area. To change a decision, write a new ADR that supersedes the old one. Don't rewrite history:
  in the old ADR, change only its status line (`Superseded by ADR-NNNN`).
- **Format:** `docs/adr/NNNN-kebab-title.md`, numbered sequentially, following the template in
  `docs/adr/README.md`: status, date, deciders, context, decision, consequences, and alternatives
  considered (each with why it was rejected). Add the ADR to the index table in the README.
- **Specs and plans:** design specs (`docs/superpowers/specs`) describe _what_ is built;
  ADRs record _why_. When a spec or plan section follows from an ADR, link it (`ADR-0010`). When
  they disagree, the newest accepted ADR wins and the spec is updated to match.
- **Reviews:** external reviews live in `docs/reviews/`. Every finding that changes a decision
  ends in an ADR that cites the review.
