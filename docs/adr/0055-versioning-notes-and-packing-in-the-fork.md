# ADR-0055: How EffectScript is versioned, noted and packed in a fork whose changesets are upstream's

- **Status:** Accepted, amended below (dependency ranges)
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 17 (phase 11), within ADR-0015
- **Related:** ADR-0008, ADR-0015, ADR-0036, ADR-0038, ADR-0041; spec §7.6, §10

## Context

EffectScript lives in a fork of the Effect monorepo (ADR-0008) and versions in lockstep with
Effect (ADR-0015): the major.minor is Effect's, and the patch and `alpha.N` number are
EffectScript's own.

- **Changesets belong to upstream.** `.changeset/config.json` links the Effect packages in one
  `fixed` group, and `changeset version` would bump EffectScript by the changesets' semver rules,
  which know nothing about lockstep. Upstream's notes arrive with every merge from `main`.
- **Spec §10** asks for a changeset for `effectscript` and `@effectscript/language`, and one
  (`effectscript-living-docs.md`) already exists.
- **The VS Code Marketplace refuses semver prereleases.** `vsce publish` fails on `4.0.0-alpha.0`.

## Decision

- **`changeset version` is never run for EffectScript.** Notes are still written as changesets
  (`.changeset/effectscript-*.md`, naming only EffectScript packages), because that is the
  format contributors know, but `core/scripts/release.ts` consumes them.
- **`release.ts version [--effect x.y] [--prerelease alpha|none]`** writes one version to every
  package in `packages/effectscript`, private ones included:
  - it is computed from the *released* version, the newest `## ` heading in
    `packages/effectscript/CHANGELOG.md`, so running it twice gives the same result;
  - the same Effect minor bumps `alpha.N` or the patch; a new Effect minor starts at `x.y.0`; an
    Effect older than the released version is refused;
  - by default it stays on the last release's channel (alpha or stable);
  - packages that disagree are refused, each named.
- **`release.ts changelog`** moves the notes that name only EffectScript packages into
  `packages/effectscript/CHANGELOG.md` under the packages' version, grouped by their bump. It
  refuses a note naming both EffectScript and upstream packages, and a version that is already in
  the changelog. Upstream notes are never touched.
- **The extension's Marketplace version is mapped:** `x.y.z-alpha.N` becomes `x.y.(z·1000+N)`,
  packaged with `--pre-release`, and `x.y.z` becomes `x.y.(z·1000+999)`. The order of npm versions
  is kept. The `.vsix` file name and its bundled plugin pack keep the npm version.
- **The packages are MIT,** with the copyright line "Gunther Brunner and the EffectScript
  contributors" in each published package and the extension. The root `LICENSE` stays Effectful's.

## Consequences

- One command per step, each safe to re-run, and the runbook (`packages/effectscript/RELEASING.md`)
  orders them.
- Merging upstream never changes EffectScript's version or changelog.
- A note that names both families stops the release until it is split, which is the point.
- **Cost if wrong:** stable Marketplace versions look odd (`4.0.999`). The npm version is the one
  users see everywhere else. If Microsoft adds prerelease support, a new ADR can drop the mapping;
  the numbers stay monotonic either way.

## Alternatives considered

- **Run `changeset version` with EffectScript in its own `fixed` group:** changesets would still
  pick the version by semver bump types, not by Effect's minor, and would need edits to upstream's
  config on every merge.
- **Add EffectScript to the changesets `ignore` list:** changesets refuses notes that name ignored
  packages alongside others, and the fork's config would drift from upstream's.
- **A separate `CHANGES` format:** loses the tooling contributors already know.
- **Marketplace version `x.y.N` for `alpha.N`:** collides with the stable `x.y.0`.
- **Date-based Marketplace versions:** monotonic, but they no longer tell you which npm release a
  `.vsix` is.

## Amendment 1: dependency ranges (Plan 17 Task 4)

Writing the runbook showed that `effectscript` shipped `effect` and `@effect/platform-node` as
`^4.0.0` dependencies. Spec §7.6 makes `effect` a peer on the same minor, and a `^` dependency lets
npm install a second, newer `effect` beside the project's, which splits Effect's services in two.

- **Effect packages are peers on the same minor** (`workspace:~`, packed as `~4.0.0`), and dev
  dependencies in the workspace.
- **The EffectScript packages pin each other's exact version** (`workspace:*`): the language
  server and the compiler share internal APIs that may change in any alpha.
- `release.ts pack` refuses a tarball whose manifest breaks either rule (`manifestProblems`).

**Rejected:** upstream's convention, a `workspace:^` peer. It accepts the next Effect minor,
which lockstep says EffectScript doesn't support until it releases for it.
