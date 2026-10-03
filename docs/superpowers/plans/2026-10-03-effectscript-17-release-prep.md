# EffectScript Plan 17: Monorepo registration and release prep (phase 11)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** everything short of publishing is ready.

- **Registration:** every surface in `.agents/skills/package-development/registration.md` is
  classified and correct, and the root checks pass with EffectScript in the tree.
- **Release tooling:** `packages/effectscript/scripts/release.ts` keeps EffectScript's versions
  in lockstep with Effect (ADR-0015) and builds the changelog from EffectScript's notes,
  independent of the fork's upstream changesets.
- **The packages:** the published packages (`effectscript`, `@effectscript/language`) build and
  pack with their own licence and README, and a packed install works.
- **The runbook:** `packages/effectscript/RELEASING.md` covers the user's publish steps, in order.

**Spec:** §10, §7.6.

**Decisions:** ADR-0055 (new), how EffectScript is versioned, noted and packed in a fork whose
changesets belong to upstream. Builds on ADR-0015, ADR-0036 and ADR-0038.

## Global Constraints

- **Nothing is published:** no npm, Marketplace, Open VSX, tag or deploy. The runbook says how.
- **Upstream release files stay as they are:** `.changeset/config.json` and upstream changesets.
  Shared root configs (`jsdocs.config.json`, `README.md`) gain only additive, separated
  EffectScript entries.
- **Licence:** EffectScript's packages are MIT with their own copyright line. The root
  `LICENSE` is Effectful's and stays theirs.

## Review Focus

1. **`release.ts version`:** it never produces a version whose major.minor differs from the
   installed `effect`'s. It is idempotent, and it refuses a dirty or partial state. *(Task 2)*
2. **`release.ts changelog`:** it consumes only `effectscript`/`@effectscript/*` notes and leaves
   upstream changesets alone. *(Task 2)*
3. **The packed tarballs:** they contain `dist`, the README, the LICENSE and the bins, with no
   tests, fixtures or `.tsbuildinfo`. A clean install of the packed tarballs runs `efx --version`
   and compiles a file. *(Task 3)*
4. **Root checks:** `pnpm jsdocs --check`, `pnpm check`, `pnpm lint` and `pnpm codegen` pass or
   are unaffected. *(Task 1)*

---

### Task 1: Registration surfaces

- **`jsdocs.config.json`:** exclude `packages/effectscript/**`, as spec §10 says.
- **`README.md`:** an EffectScript section in the catalog (separate from the Effect packages
  table).
- **Licences and READMEs:** a `LICENSE` in each published package, plus `vscode` (its `.vsix`
  uses it), and each package's README checked.
- **Classify each surface** in `registration.md`, recorded in the execution record:
  `vitest.docs.ts`, `tstyche.json`, `deno.json`, snapshot workflows and runtime CI.
- **Test:** `pnpm jsdocs --check` passes.

### Task 2: Release tooling (ADR-0055)

- **`release.ts version [--effect x.y] [--prerelease alpha|none]`:** it computes the next
  version (lockstep major.minor; a patch or prerelease number of EffectScript's own) and writes it
  to every EffectScript package, the private ones included.
- **`release.ts changelog`:** it moves `.changeset/effectscript-*.md` notes, and any note naming
  only EffectScript packages, into `packages/effectscript/CHANGELOG.md` under the new version.
- **Tests:**
  - the version rules (same minor bumps the prerelease or patch; a new effect minor resets;
    refuses a lower version);
  - `changelog` leaves upstream changesets in place.

### Task 3: Pack and install check

- **`release.ts pack [--out dir]`:** builds `core` and `language` (`tsc -b`) and runs
  `pnpm pack` for each.
- **Test:** the tarball file lists, and a clean temporary project that installs both tarballs
  (with workspace `effect` linked) runs `efx --version` and `efx print`.

### Task 4: Runbook and docs

- **`packages/effectscript/RELEASING.md`**, in this order:
  1. repository transfer;
  2. secrets (`NPM_TOKEN`, `HOMEBREW_TAP_TOKEN`, `VSCE_PAT`, `OVSX_PAT`, Cloudflare for
     Alchemy);
  3. version;
  4. changelog;
  5. pack check;
  6. npm publish;
  7. binary tag;
  8. tap;
  9. `.vsix`;
  10. site deploy.
- Spec §10 status, COMPATIBILITY, and this plan's execution record.

---

## Execution record

**Registration surfaces (Task 1):**

| Surface                  | State                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`    | covered by `packages/effectscript/*`; `allowBuilds` classified (Plan 11)    |
| `tsconfig.packages.json` | core, language, vscode, effect-docs and the site's check config             |
| `tsconfig.tests.json`    | covered by the globs, plus the two scripts that tests import                |
| `vitest.config.ts`       | six projects                                                                |
| `tstyche.json`           | n/a: EffectScript has no type tests                                         |
| `vitest.docs.ts`         | covered; EffectScript's JSDoc has no runnable fences                        |
| `jsdocs.config.json`     | `packages/effectscript/**` excluded (spec §10)                              |
| `deno.json`              | excluded since Plan 1                                                       |
| `.changeset`             | EffectScript's own notes, consumed by `release.ts changelog` (ADR-0055)     |
| `README.md`              | an EffectScript section before the packages table                           |
| snapshot workflow        | n/a: it publishes upstream paths only                                       |
| runtime CI               | n/a: `effectscript-release.yml` runs Bun and Node for the binaries          |

**Rulings:**

- **`release.ts` lives in `core/scripts`,** not `packages/effectscript/scripts`. Core's test, lint
  and type-check setup covers it, and it still works on the whole family.
- **No "dirty tree" refusal:** the version files are dirty right after `version`, which would break
  running it twice. Running it twice is safe because it computes from the changelog's released
  version, and packages that disagree are refused.
- **The Marketplace version mapping** (ADR-0055): `vsce publish` refuses semver prereleases, which
  the runbook's `.vsix` step would have hit.
- **The clean install takes `effect` from the registry,** not the workspace. A linked workspace
  `effect` resolves to `.ts` sources under `node_modules`, which Node refuses to strip. The check
  is opt-in (`EFX_PACK=1`) because it needs the network.
- **`effect` and `@effect/platform-node` became `~major.minor` peers,** and the EffectScript
  packages pin each other exactly (ADR-0055 amendment 1). Found while writing the runbook.

**Found for the polish plan:**

- `efx run` on Node 24 prints Node's `ExperimentalWarning` for `stripTypeScriptTypes`.
- `efx init` without a `tsconfig.json` says to create one, but still edits the rest of the project.

**Final review (fresh reviewer, no Critical, 6 Important), fixed in one pass with tests that failed
first:** formatting (and the commit gate that let it through); literal `~x.y.0` Effect peers that
`version` moves (`workspace:~` packs the exact Effect version); an explicit `git add` in the
runbook; "released" means tagged, so `version` after `changelog` is a no-op; alphas go to npm's
`latest` until the first stable; upstream notes `release.ts` can't read are skipped. Regraded to
Important and fixed: the runbook tags and builds the binaries before publishing to npm.

**Deferred minors:** `--effect` isn't checked against the workspace Effect; an empty summary or a
list summary renders oddly; install hints don't pin `@effectscript/language` to the CLI's version;
Yarn Berry or pnpm without `auto-install-peers` don't install the Effect peers; the runbook's `npx`
tools, `NPM_TOKEN` wording and PAT environment variables.
