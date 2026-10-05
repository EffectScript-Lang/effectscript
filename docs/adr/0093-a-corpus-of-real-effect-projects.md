# ADR-0093: Real Effect v4 projects as a corpus, converted and measured

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user (bring in the Effect 4 reference projects, at least as an experiment with
  submodules; convert them; compare tokens and how they read); agent rulings on layout, licensing,
  what is committed, and replacing the submodules once they broke the repository's lint
- **Related:** ADR-0050 (the docs corpus), ADR-0091 (the audit), ADR-0092 (token counts);
  `packages/effectscript/corpus`

## Context

The audit (ADR-0091) measures the language on the Effect docs corpus. Those examples are short and
written to teach one API, so most of what survives conversion is Effect's own vocabulary
(`runPromise`, `Stream.…`). They say little about how a whole application reads in EffectScript:
its services, layers, errors, HTTP APIs and tests, written by people shipping software.

The Effect 4 reference projects listed by rat-stack
(<https://ratstack.sh/resources/effect-4-reference-projects>) are exactly that: t3code, opencode,
lalph, ghui, alchemy, effect-machine, and ten more adopters. They are public, current and actively
developed, but their licenses differ:

- MIT or Apache-2.0: eleven of them;
- GPL-3.0: the-moby-effect;
- no standard license: maple and crosshatch;
- no license at all, so all rights reserved: receipts and clanka.

## Decision

- **A pinned manifest, cloned outside the repository:** `packages/effectscript/corpus/corpus.json`
  lists each project's URL, branch and commit. Each is cloned without history into
  `$EFFECTSCRIPT_CORPUS` (by default `~/.cache/effectscript/corpus`) and checked out at its pinned
  commit, the first time `pnpm corpus:convert` needs it. `pnpm corpus:update` moves every project
  to the tip of its branch and rewrites the pins, so the corpus follows the latest code, and every
  committed report is reproducible from the pins committed with it. The repository holds no code
  of theirs.
- **Converted, side by side, locally:** `pnpm corpus:convert` converts every tracked `.ts` and
  `.tsx` file with `toEffectScript` (the same reverse compiler as `efx convert`, ADR-0030) and
  writes `out/<repo>/<path>.ts` next to `out/<repo>/<path>.efx`. `out/` is gitignored: the code is
  theirs.
- **Committed: the numbers, never the code.** `corpus/REPORT.md` and `report.json` are committed:
  per project the files, how many convert, the tokens before and after in each vocabulary of the
  panel (ADR-0092), and the reasons conversions stop, counted. Reasons are the reverse compiler's
  notes with names elided, so no code is quoted.
- **Feeding the audit:** the blocker table is the audit's work list. A construct that keeps
  real code in TypeScript is a candidate for the reverse compiler, or for the language, under
  ADR-0091's rubric.
- **Showing it later:** publishing converted code (on the site, say) is limited to the MIT and
  Apache-2.0 projects, with their license and attribution, and is its own decision.
- **Kept out of the build:** the clones live outside the tree, and `out/` is excluded from lint,
  format, type-check and test runs. Their dependencies are never installed; conversion is
  syntactic and needs none.
- **Not submodules:** the corpus started as 16 shallow submodules. With them in the tree, `oxlint`
  first failed on the projects' own nested configs (their plugins aren't ours) and then ran out of
  memory at 4 GB before linting a single file, whatever `ignorePatterns`, `.gitignore`,
  `.oxlintignore` or a hidden folder said. Linting is the repository's gate, so the projects moved
  out of the tree. The manifest keeps what submodules gave: pinned commits and one command to
  update.

## Consequences

- The audit gets evidence from whole applications, with the same tokenizer panel as the docs.
- A fresh checkout doesn't fetch the projects. The first `pnpm corpus:convert` does, about 2 GB of
  history-free source in the cache.
- The numbers move when the projects move. The report records each project's commit, and the pins
  only change through `pnpm corpus:update`.
- Projects on older Effect betas (opencode) still convert syntactically. Where their APIs
  differ from Effect v4, the forward compiler's output may not type-check against the workspace
  `effect`; the report measures conversion, not type-checking.

## Alternatives considered

- **Vendor the source:** copies other people's code into this repository, including code we
  have no license to redistribute (receipts, clanka), and freezes it.
- **Submodules:** tried first, at the user's suggestion. They break the repository's lint (above),
  and `git submodule` adds a step to every clone of this repository for a corpus most clones don't
  need.
- **Commit the converted `.efx`:** the most direct showcase, but it's a derivative of each project.
  It waits for the publishing decision above, limited to permissive licenses.
- **Only the six primary projects:** the ten adopters are small and cheap, and they widen the
  styles the audit sees.
