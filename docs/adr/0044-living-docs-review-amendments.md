# ADR-0044: Living-docs amendments from the Plan 12 review

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling on the Plan 12 final review
- **Related:** `docs/reviews/2026-10-03-plan-12-final-review.md` (C1, C2, I5, I6, I7), ADR-0042,
  ADR-0043, docs spec §2 and §3

## Context

The Plan 12 final review found five problems in the living-docs design itself:

- **C1.** `efx docs` deleted its output directory before regenerating it, whatever that directory
  was. With `--out docs`, an easy mistake because `efx init` puts the Blume site in `docs/`, it
  deleted hand-written pages.
- **C2.** An input outside the project could write a page outside the output directory, and two
  modules could map to the same page.
- **I5.** Only the module's exports were in scope of its examples, so an example couldn't use a
  type the module imports, such as `AccountId` in the bank fixture.
- **I6.** Fences under a TSDoc `@example` tag, the standard TSDoc form that Effect's own docs use,
  were never run.
- **I7.** A scoped package name in prose, such as `@effect/vitest`, was read as a tag.

## Decision

- **A manifest of owned files.** `efx docs` writes the manifest `<out>/.efx-docs.json`, and on the
  next run it replaces only the files listed there. It refuses to write to:
  - the project itself or a parent of it;
  - a directory that contains an input;
  - a non-empty directory that has no manifest.

  This amends ADR-0043's "owns `docs/api/` and regenerates it completely". Blume ignores dot-files,
  so the manifest doesn't become a page.
- **Pages stay inside the output directory.** A file outside the project gets its module path from
  its input root. Two modules that map to the same page are an error.
- **Examples see the module's imports.** Every import statement of the documented module, plus its
  exports, is in scope of its examples. The `?doctest` module lives in the same directory, so the
  specifiers resolve unchanged. This amends ADR-0042.
- **`@example` is accepted.** `@example <title>` followed by a fence is a titled example. It runs
  like a fence in the body, and pages show it as `**title**` plus the fence. Bare fences in the body
  stay the idiomatic form (ADR-0042). `@example` is accepted because TSDoc users write it.
- **Tag names.** A tag starts with `@` after whitespace or at the start of a line, and its name ends
  at whitespace or the end of the line.

## Consequences

- `efx docs` can't destroy files it didn't create. The cost is a dot-file in the output directory,
  and a one-time refusal for a non-empty directory that was hand-made.
- Examples are as short as the module code they document: no import lines, and no restating of the
  module's own imports.
- Nothing in TSDoc-style docs is silently skipped.

## Alternatives considered

- **Delete only `*.md` in the output directory:** that still deletes hand-written Markdown pages.
- **A fixed, non-configurable output directory:** projects with existing docs layouts need `--out`.
- **Imports inside examples:** an example is an `effect` body, so allowing statement-level imports
  in it would need hoisting. Taking the module's imports is shorter, and it matches Elixir, where a
  doctest sees the module's aliases.
- **Rejecting `@example` with a diagnostic:** it would push TSDoc users to rewrite valid docs. Accepting
  it costs one rendering rule.
