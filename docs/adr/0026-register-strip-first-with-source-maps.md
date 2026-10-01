# ADR-0026: `effectscript/register` strips first and maps stack traces to `.efx`

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling on Plan 3 final-review finding I6
- **Related:** amends ADR-0021 and ADR-0024

## Context

ADR-0021 ran every compiled `.efx` module through transform-mode type stripping. Transform mode
rewrites code, so positions shift. The compiler's `.efx` → TypeScript source map was also
discarded. Stack traces from `.efx` code named the `.efx` file but showed positions in the
compiled code (`three.efx:6:11` for a throw at `6:9`).

## Decision

- `effectscript/register` uses **strip mode first**. It replaces types with whitespace, so
  JavaScript positions equal TypeScript positions, and the compiler's source map is attached inline
  as is. Stack traces then point at `.efx` lines and columns.
- Transform mode is used only when strip mode rejects non-erasable syntax
  (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, for example enums), where the host still supports it.
  Positions in those modules are approximate.
- The register module enables source-map support for the process
  (`process.setSourceMapsEnabled(true)`). This only affects processes that opted into
  `effectscript/register`.

## Consequences

- Errors thrown from `.efx` show `.efx` positions on the qualified host (Node 24.21).
- Modules with non-erasable syntax keep approximate positions until source maps are composed.

## Alternatives considered

- **Compose the two source maps:** exact everywhere, but needs a remapping library at runtime.
- **Transform mode always (ADR-0021):** wrong positions in every stack trace.
