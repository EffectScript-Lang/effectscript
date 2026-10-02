# Plan 12 (living docs): final review

- **Date:** 2026-10-03
- **Reviewer:** a fresh-context review agent
- **Range:** `dd9caeee8..3c4e1e016`, limited to the Plan 12 paths
- **Decisions changed:** ADR-0044

Every finding below is listed with what happened to it.

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| C1 | Critical | `efx docs --out <dir>` deleted whatever directory it was given: `docs` (hand-written pages), `src`, `.` | Fixed. `efx docs` only replaces the files listed in its manifest, `<out>/.efx-docs.json`. It refuses the project itself, a directory that contains an input, and a non-empty directory it didn't write (ADR-0044) |
| C2 (was Minor 7) | Critical (regraded) | An input outside the project wrote its page outside the output directory, and `src/users.efx` and `src/users/index.efx` overwrote each other silently | Fixed. Outside files are named from their input root. A page collision is an error (ADR-0044) |
| I2 | Important | A name that is both a value and a type (`export const Money` plus `export type Money`) was imported twice into the `?doctest` module | Fixed. The value import brings both |
| I3 | Important | `.ts` overloads gave one declaration per signature, so the import was duplicated and anchors repeated | Fixed. Overloads and their implementation are one declaration, whose signature lists the overloads |
| I4 | Important | `export { a as b }` was documented and imported as `a` | Fixed. It is documented and imported under its public name |
| I5 | Important | Examples couldn't use anything the module only imports (the bank fixture's `AccountId`) | Fixed. The target's own imports are in scope of its examples (ADR-0044, amending ADR-0042) |
| I6 | Important | Fences under a TSDoc `@example` tag were never run | Fixed. `@example <title>` with a fence is a titled example, and pages show it as one (ADR-0044) |
| I7 (was Minor 9) | Important (regraded) | Prose such as `@effect/vitest` started a tag, cutting the summary | Fixed. A tag name must end at whitespace or the end of the line |
| M8 | Minor | A symlink loop under `src` crashes with ELOOP | Deferred |
| M10 | Minor | Template-literal types lose their backticks in table cells | Deferred |
| M11 | Minor | `export const a = 1, b = 2`, `export enum` and destructured exports are missing; `export declare const` is imported | Deferred |
| M12 | Minor | In comments without `*` prefixes, example code loses its indentation on the page (doctest columns are kept) | Deferred |
| M13 | Minor | `splitUnion` counts the `>` of `=>` | Deferred |
| M14 | Minor | `lineStart` in `doctest.ts` is quadratic | Deferred |

Regression tests are in `packages/effectscript/core/test/plan12-review.test.ts`.
