# ADR-0036: GitHub coordinates live under the EffectScript-Lang organization

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** the user ("no gunta/ stuff"); agent ruling on the names
- **Related:** spec §7.5; ADR-0008, ADR-0038

## Context

ADR-0008 moves the public fork from `gunta/effect-lang` to the `EffectScript-Lang` organization
when the work is complete. The organization exists and has no repositories yet.

Package metadata still pointed at `gunta/effect-lang`, and the spec named a `gunta/tap` Homebrew
tap. Plan 10 adds more coordinates: release URLs in the install script and the formula, and the
tap the release workflow pushes to. The user asked that nothing name `gunta/`.

## Decision

- **Repository:** `https://github.com/EffectScript-Lang/effect-lang`. It keeps its name on
  transfer, so the history, issues and stars move with it and GitHub redirects the old URL.
  package.json `repository` and `homepage` fields use it now.
- **Releases:** binaries, `SHASUMS256.txt` and `install.sh` are attached to releases of that
  repository, tagged `effectscript@<version>` (the monorepo's changesets tag form).
- **Homebrew tap:** `EffectScript-Lang/homebrew-tap`, installed with
  `brew install effectscript-lang/tap/effectscript`. homebrew-core comes later (spec §7.5).
- **Personal credit:** the site's "made by @gunta85" credit (spec §9.1) is unaffected: it is
  attribution, not a coordinate.

## Consequences

- Links in package metadata 404 until the transfer, and nothing is published before then.
- A test checks that every `packages/effectscript/*` package with a `repository` points at the
  organization.
- Renaming the repository at transfer (for example to `effectscript`) would mean changing these
  coordinates in one more change. GitHub redirects old URLs, but the install script and formula
  should still be updated.

## Alternatives considered

- **Keep `gunta/` until the transfer:** every published or generated artifact would carry a
  coordinate that is known to be temporary. The user rejected it.
- **Rename the repository to `effectscript` on transfer:** a nicer name, but the repository is a
  fork of the Effect monorepo, and the name `effect-lang` says so. The user can still rename it
  at transfer time.
- **A `homebrew-effectscript` tap:** `brew install effectscript-lang/effectscript/effectscript`
  repeats the name. `homebrew-tap` is the common convention and leaves room for more formulae.
