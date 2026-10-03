# ADR-0062: The grammar is pinned before the tag, and only the newest release is latest

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** agent ruling for Plan 21 (deferred minors from the Plan 10 and Plan 19 reviews)
- **Related:** amends the runbook order of ADR-0055; ADR-0058 (tree-sitter and Zed); ADR-0038
  (install channels)

## Context

Zed publishes an extension from a commit of its own repository, here the tagged commit of
`EffectScript-Lang/effectscript`, and fetches the grammar at the `rev` that commit's
`extension.toml` names. The runbook pinned the grammar after the tag, so the tagged commit still
said `rev = "main"`: the published extension would build whatever the grammar's branch held that
day.

The release workflow also ran `gh release create --latest` and updated the Homebrew formula for
every tag. Re-running it failed (the release existed, or the formula commit was empty), and a manual
run for an older tag would have made that tag "latest" and moved the tap back to it.

## Decision

- **The grammar comes before the tag.** The runbook exports and pushes the grammar repository
  (step 6), then `release.ts zed --rev <sha>` writes its commit into `extension.toml` (step 7),
  and only then is `effectscript@<version>` tagged (step 8). `--rev` takes a full 40-character
  SHA and nothing else, because a branch or tag can move.
- **`release.ts version` moves every file that carries the version:** each package's
  `package.json`, and where they exist `extension.toml`, the crate's own `[package]` in
  `Cargo.toml` and its entry in `Cargo.lock`, and `tree-sitter.json`'s `metadata.version`. Each
  pattern matches only that field.
- **Only the newest tag is latest.** The workflow compares the tag with the newest
  `effectscript@*` tag (prereleases sort before their release) and passes `--latest=true|false`;
  the Homebrew job runs only for the newest. A re-run uploads to the existing release with
  `--clobber` and commits nothing when the formula is unchanged.

## Consequences

- The Zed extension at any tag builds the grammar it was tested with.
- A release can be re-run after a flaky job, and an old version can be rebuilt by hand without
  disturbing `install.sh`'s `latest/download` or the tap.
- **Cost if wrong:** if Zed began reading the grammar from somewhere else, step 7 would be wasted
  but harmless. If the tag ordering misjudged a version, the workflow would mark the wrong release
  latest; `gh release edit --latest` fixes it by hand.

## Alternatives considered

- **Pin the grammar after the tag, in a follow-up commit, and point Zed's submodule there:** the
  submodule would then sit on an untagged commit, and the extension's version and the CLI's would
  no longer share one commit.
- **Accept a tag or branch name for `rev`:** shorter to type, but the extension's build would
  change whenever that name moved.
- **Never mark releases latest, and let `install.sh` pick the newest itself:** `install.sh` relies
  on GitHub's `latest/download` URL (ADR-0038); computing the newest there needs the API, with its
  rate limit, on every install.
