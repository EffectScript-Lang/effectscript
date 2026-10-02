# ADR-0033: CLI argument passthrough and `efx convert` verification

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent rulings for Plan 8, revised after its final review
- **Related:** spec §7.1, §7.5; ADR-0030, ADR-0032

## Context

Plan 8 rebuilt `efx` on `effect/cli`, which parses every flag it sees. The final review found
that this broke the old passthrough: `efx run app.ts --port 3000` and `efx check --watch` were
rejected. It also found that the first `convert` verification loop reverted innocent files and
left users stranded on a red project.

## Decision

- **Passthrough:**
  - `efx run <file> …` passes everything after the file to the program.
  - `efx check …` passes everything to `efx-tsc`.
  - `main` adds the `--` before the parser sees the arguments. `efx check --help` and a bare
    `efx run` still reach `efx`'s help.
- **What `convert` renames:** only the files whose conversion changes something. Unchanged
  TypeScript is already valid EffectScript, and renaming it only adds churn. Skipped and never
  renamed:
  - `.d.ts` and `*.config.*` files, and anything under `node_modules`;
  - a target that already exists;
  - two sources that would share one target.
- **Verification:**
  - **Steps:** `efx check` when a tsconfig.json exists and `@effectscript/language` resolves,
    plus the test command. Each step runs quietly, and output is shown only when it fails.
  - **Before converting:** the project must verify (a baseline). A red project is refused before
    any branch or file changes, with the failing step's output, because nothing could tell which
    conversion broke it.
  - **After converting:** when the whole conversion fails, it bisects the converted files. Groups
    that verify are kept, and files that fail alone are reverted.
  - **When nothing converts:** `convert` switches back to the original branch and deletes the
    new one.
- **Dirty-tree check:** `git status --porcelain --untracked-files=all`, so user git settings
  can't hide untracked files that `convert` would replace.

## Consequences

- Scripts and tools that relied on the old passthrough keep working. An `efx` flag after the file
  (`efx run app.ts --help`) goes to the program, not to `efx`.
- A conversion costs O(k log n) verifications for k bad files instead of up to n, and never
  reverts a file that verifies.

## Alternatives considered

- **Require `--` for passthrough:** this breaks existing usage, and users would hit the error
  first.
- **Revert newest first until green:** reviewed and rejected. It reverts innocent files.
- **Skip the baseline:** a red project would end with everything reverted and a stranded branch.
