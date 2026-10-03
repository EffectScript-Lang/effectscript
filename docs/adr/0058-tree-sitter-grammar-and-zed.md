# ADR-0058: A tree-sitter grammar that extends TypeScript's, and a Zed extension on it

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 19 (phase 13)
- **Related:** spec §4.19, §7.4, §7.5; ADR-0036, ADR-0040, ADR-0041, ADR-0052

## Context

Neovim, Helix and Zed highlight, fold and indent with tree-sitter. EffectScript had no grammar,
so they borrowed TypeScript's, which turns every `effect`, `schema`, `|>` or `match` into an ERROR
node. Zed can't register a language without a grammar and an extension, so `efx setup` could only
print instructions for it. The language server (`efx lsp`, ADR-0040) already gives every editor
diagnostics and completions; tree-sitter is for what editors do locally.

## Decision

- **`tree-sitter-effectscript` extends `tree-sitter-typescript`'s grammar** (0.23.2) with
  `grammar(TypeScript, …)`, and reuses its external scanner unchanged.
  - Every EffectScript keyword is contextual, as in the compiler (§4.19): each is also a
    `_reserved_identifier`, so `const effect = 1` stays an identifier, and a type name where
    TypeScript's grammar reads one (`typeof schema`, `f<effect>()`, `[schema: X]`, `x is test`;
    Plan 19 review C1).
  - Overlaps between a keyword and an identifier, or between constructs, are GLR conflicts.
  - `|>` binds looser than `??` and tighter than the conditional, as in the compiler: `??` gets
    its own precedence name just above the conditional's, which TypeScript's trees don't notice.
    `await a |> f` still parses as `(await a) |> f`, while the compiler awaits the whole
    pipeline; highlighting is the same.
  - Where valid TypeScript and EffectScript both fit, TypeScript wins: `defer(x)` is a call, and
    `do { … }` is an expression only as an initializer (`const x = do { … }`), so a `do` statement
    is always the loop.
  - A `try` takes several `catch` clauses (ADR-0010).
- **The superset test:** on every `packages/effect/src` file that `tree-sitter-typescript` parses
  cleanly, the trees are identical (all of them, not a sample: a sample missed one). Where TypeScript's grammar is in error recovery (newer
  syntax than 0.23 knows), recovery isn't a contract.
- **Every shipped `.efx` parses without errors** (fixtures, the CLI's own sources, examples, site
  samples), and a corpus pins each construct's tree.
- **The generated parser (about 28 MB) isn't committed here.** `scripts/export.mjs` writes the
  publishable repository, `EffectScript-Lang/tree-sitter-effectscript`, with the generated parser,
  the scanner and the queries. A test builds and parses with that repository alone.
- **Queries:** one self-contained `highlights.scm` (JavaScript's, TypeScript's, then EffectScript's
  patterns; later patterns win, as in Neovim and Zed), without the `#is-not? local` predicate
  Neovim lacks; a Helix copy with the patterns in reverse, because in Helix the first pattern
  wins (Helix's own TypeScript queries name nodes this grammar doesn't have, so they can't be
  inherited); folds and indents for Neovim and Helix. Tests load them in headless Neovim and in
  Helix through a pseudo-terminal.
- **The Zed extension** (`packages/effectscript/zed`) uses the grammar and starts `efx lsp`: the
  project's `node_modules/.bin/efx` when there is one, otherwise `efx` on PATH. `scripts/dev.mjs`
  builds a dev extension whose grammar is a local git repository, so it can be tried before
  anything is published. Its manifest and crate carry the release version (`release.ts version`).
- **`efx setup`** points Zed users at the extension. Its Neovim and Helix configs keep the LSP,
  and the README documents the grammar settings; `efx setup` writes them once the grammar
  repository is published, because a config naming an unpublished repository fails.

## Consequences

- Highlighting, folding, the outline and indentation follow EffectScript's structure in three
  more editors.
- **Cost:** the grammar follows `tree-sitter-typescript`'s releases, and a new TypeScript syntax
  needs that grammar first. The generated parser is a release artifact, not a source file.
- **If wrong:** a construct that misparses shows as an ERROR node only in those editors'
  highlighting; the compiler and the language server are unaffected.

## Alternatives considered

- **A grammar written from scratch:** months of work to match TypeScript, and the superset
  guarantee would be untestable.
- **Commit the generated parser here:** 28 MB of churn on every grammar change in the monorepo.
- **TextMate grammar in Zed:** Zed has no TextMate support.
- **A Zed extension that runs `npx efx lsp`:** slow to start and network-dependent; the project's
  own `efx`, then PATH, is what the other editors do.
