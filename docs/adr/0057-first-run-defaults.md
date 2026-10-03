# ADR-0057: The CLI's defaults for a first run

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 18 (phase 12)
- **Related:** spec §4.17, §7.1; ADR-0021, ADR-0026, ADR-0055

## Context

Installing the packed release in an empty folder (Plan 17) showed three rough edges in the first
minutes:

- **`efx run` opened with a Node warning:** "ExperimentalWarning: stripTypeScriptTypes is an
  experimental feature". `effectscript/register` calls that API on purpose (ADR-0026).
- **`efx init` in a new folder** said "No tsconfig.json here: create one, then run efx init again",
  and edited everything else anyway. Spec §4.17 says `efx init` writes the strictest `tsconfig`.
- **Install hints** said `npm i -D @effectscript/language`, which installs the newest version.
  EffectScript's packages pin each other exactly (ADR-0055), so a newer language package next to
  an older `efx` brings a second copy of the compiler. The hints also left out `effect`, which is a
  peer now.

## Decision

- **`effectscript/register` drops exactly one warning:** the `ExperimentalWarning` whose message
  starts with "stripTypeScriptTypes is an experimental feature". Every other warning, the
  program's own included, still prints.
- **`efx init` writes a `tsconfig.json` when there is none:** `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
  `verbatimModuleSyntax`, `NodeNext`, `types: ["node"]`, and the plugin. It has no
  `rewriteRelativeImportExtensions`: `efx build` rewrites `./x.efx` imports itself, and with the
  option TypeScript refuses them (TS2876). An existing `tsconfig.json` is only ever given the
  plugin. (The Plan 18 review found both; tests now check and build a two-file project.)
- **`efx init` without a `package.json` writes one,** `{ name, private, "type": "module" }`,
  because EffectScript compiles to ES modules. An existing `package.json` that isn't an ES module
  gets a note, not an edit.
- **Install hints name exact versions and the peers:** `npm i effect @effect/platform-node` for
  what is missing at runtime, and `npm i -D effectscript@<v> @effectscript/language@<v>
  typescript@6 @types/node`, where `<v>` is the running `efx`'s version. `efx lsp`, `efx check` and
  `efx doctor` share the language hint.

## Consequences

- A first `efx init`, `efx check` and `efx run` in an empty folder work without a hand-written
  config and print nothing unexpected.
- **Cost if wrong:** if Node changes the warning's text, it prints again (harmless). If a user's
  `efx` is older than they want, the pinned hint installs the older language package; `efx`'s own
  version is the right match either way.

## Alternatives considered

- **`--disable-warning=ExperimentalWarning` on the child process:** hides every experimental
  warning, including ones about the user's own code, and doesn't cover
  `node --import effectscript/register` run by hand.
- **Ask before writing `tsconfig.json`:** `efx init` is already the explicit request, and it never
  overwrites a file.
- **Unpinned hints:** simpler to read, but they produce the version mismatch above.
