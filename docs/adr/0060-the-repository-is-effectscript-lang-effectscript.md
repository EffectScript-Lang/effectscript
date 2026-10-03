# ADR-0060: The repository is `EffectScript-Lang/effectscript`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user, at the transfer
- **Related:** supersedes ADR-0036's repository name; ADR-0008 (the fork), ADR-0038 (install
  channels)

## Context

ADR-0036 put every GitHub coordinate under the `EffectScript-Lang` organization and kept the
fork's name: `EffectScript-Lang/effect-lang`. At the transfer, the user chose the language's
name for the repository instead.

## Decision

- The fork moves from `gunta/effect-lang` to **`EffectScript-Lang/effectscript`**, renamed in the
  same transfer (`gh api … transfer -f new_owner=EffectScript-Lang -f new_name=effectscript`).
- Every current coordinate uses it: the packages' `repository` fields, `install.sh`, the Homebrew
  formula generator, the release workflow's downloads, the site, the skill's links, the grammar
  export and the Zed extension. The tap stays `EffectScript-Lang/homebrew-tap`, and the grammar
  repository `EffectScript-Lang/tree-sitter-effectscript`.
- Records of earlier work (ADR-0036, ADR-0038, the plans) keep the name they were written with.

## Consequences

- The repository name matches the language, the npm package and the site.
- GitHub redirects `gunta/effect-lang` and `EffectScript-Lang/effect-lang` URLs to the new name, so
  links in older records keep working.
- **Cost if wrong:** another rename, with the same redirects.

## Alternatives considered

- **Keep `effect-lang` (ADR-0036):** names the fork's origin rather than the language, and every
  user-facing URL would carry it.
