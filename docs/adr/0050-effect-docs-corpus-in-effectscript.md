# ADR-0050: The Effect docs, translated to EffectScript by the reverse compiler

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** the user ("all the effect docs … translated to effectscript, also all sample code
  … so the users can see this, and also AI, for training"); agent ruling on the design
- **Related:** spec §0, §6, §8, §9; ADR-0015, ADR-0030, ADR-0031, ADR-0043

## Context

Effect's documentation in this repository is TypeScript:

- `ai-docs/src`, the source of `LLMS.md`, has 40 examples and the section texts.
- The package guides are the READMEs, `SCHEMA.md`, `CONFIG.md`, `HTTPAPI.md` and others, and the
  migration guides.
- About 4,000 JSDoc examples sit in the package sources: 3,408 in `effect` alone.

EffectScript users need these examples in EffectScript. Agents learn the language best from a
large, faithful corpus, ideally paired with the TypeScript.

The reverse compiler (`toEffectScript`, ADR-0030) keeps a contract: its output compiles back to
the input. A spike converted all of it in about 5 s with no failures. 38 of the 40 `ai-docs`
examples and 1,532 of the 3,408 `effect` JSDoc examples changed; the rest have no Effect code to
re-sugar.

## Decision

- **Generated, not hand-written.** A private package, `packages/effectscript/docs`
  (`@effectscript/docs`), generates `content/` from the repository's sources, which it only
  reads:
  - `ai-docs/**`: every example as `.efx`, and `index.md` with EffectScript fences;
  - `LLMS.efx.md`: the `ai-docgen` layout (same sections and order as `LLMS.md`), with `efx`
    code and links;
  - `guides/<repo path>.md`: package READMEs, `packages/effect/*.md` (not the CHANGELOG), and
    `migration/*.md`;
  - `api/<package>/<module>.md`: each module's JSDoc examples, per documented symbol;
  - `corpus.jsonl`: one line per example `{ area, source, symbol, title, ts, efx, changed,
    parsed }`, a parallel corpus for training and evaluation;
  - `REPORT.md`: counts and token totals per area.
- **Fences:** TypeScript that parses is EffectScript (the superset), so it becomes an `efx` fence
  whether or not it changed. Code that doesn't parse stays `ts`. Everything outside the converted
  fences is kept byte for byte.
- **Prose isn't translated.** Each page opens with a note that the prose is Effect's and names the
  TypeScript forms, with the form-by-form mapping. Machine-rewriting prose would risk saying
  something Effect's authors didn't.
- **Fresh by construction:**
  - The generated files are committed. They are for reading on GitHub, the site and agents.
  - `pnpm codegen` regenerates them, and a test (`generate --check`) fails when they drift,
    including when a source file is deleted.
  - The release automation (ADR-0015) regenerates them on each upstream merge.
- **Scope:** this is Effect's own documentation. Project API docs from `.efx` sources are
  `efx docs` (ADR-0043), a separate tool.

## Consequences

- Every Effect example has an EffectScript twin that provably compiles back to it, a large and
  checked corpus.
- The corpus doubles as a reverse-compiler regression suite. A generator change that alters
  output shows up in the diff, and a crash fails codegen.
- The repository grows by about 8 MB of generated text, and upstream merges touch it. Like
  `LLMS.md`, it is generated and excluded from formatting.
- Prose and code use different vocabularies (`Effect.gen` in the text, `effect { }` in the code)
  until EffectScript-native guides are written. The opening note bridges the two.

## Alternatives considered

- **Translate only `LLMS.md`:** a small fraction of the examples, and no API-level coverage.
- **Translate on demand (site build, skill install):** nothing to review in pull requests, and no
  evidence trail for the numbers.
- **Rewrite the prose too (with a model):** unreviewable at this size, and it could misstate
  Effect's semantics.
