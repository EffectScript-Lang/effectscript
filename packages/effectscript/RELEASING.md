# Releasing EffectScript

These are the steps for publishing EffectScript, in order. Steps 3 to 5 are local and can be re-run
safely: a changelog section counts as released only once its `effectscript@<version>` tag exists.
From step 6 on, most steps publish something that can't be undone. The
decisions behind the steps are in ADR-0015 (lockstep versions), ADR-0036 (GitHub coordinates),
ADR-0038 (install channels), ADR-0041 (the `.vsix`) and ADR-0055 (versions, notes and packing in
this fork).

Run every command from the repository root, on the `effectscript` branch.

## 1. Move the repository (once)

The release workflow, the install script, the Homebrew formula and every package's `repository`
field point at `EffectScript-Lang/effectscript` (ADR-0036, ADR-0060).

1. Transfer the fork to the organization, renamed `effectscript` (ADR-0060):

   ```bash
   gh api repos/gunta/effect-lang/transfer -f new_owner=EffectScript-Lang -f new_name=effectscript
   ```

2. Create the empty tap repository, `EffectScript-Lang/homebrew-tap`, with a `Formula/` folder.
3. Check that `git remote -v` follows the move (GitHub redirects the old URL), and update it with
   `git remote set-url origin git@github.com:EffectScript-Lang/effectscript.git`.

## 2. Secrets and accounts (once)

| Secret or account            | Where                                   | Used by                                    |
| ---------------------------- | --------------------------------------- | ------------------------------------------ |
| npm org `effectscript`       | npmjs.com (it exists; you're its owner) | `@effectscript/language`                   |
| npm login                    | your machine: `npm login`               | step 10                                    |
| `HOMEBREW_TAP_TOKEN`         | repository secret                       | the release workflow's tap job (step 9)    |
| `VSCE_PAT`                   | exported in your shell                  | step 11, publisher `effectscript`          |
| `OVSX_PAT`                   | exported in your shell                  | step 11, Open VSX namespace `effectscript` |
| Cloudflare account and token | your machine                            | step 13                                    |

`HOMEBREW_TAP_TOKEN` is a fine-grained token with "Contents: read and write" on
`EffectScript-Lang/homebrew-tap` only.

## 3. Version

```bash
node packages/effectscript/core/scripts/release.ts version
```

This writes the next version to every package in `packages/effectscript`. The major.minor is the
workspace `effect`'s, and the patch or `alpha.N` is computed from the last release in
`packages/effectscript/CHANGELOG.md`. Running it twice gives the same result.

- `--prerelease none` leaves alpha (`4.0.0-alpha.7` → `4.0.0`), and `--prerelease alpha` enters
  it.
- `--effect 4.1` targets an Effect minor before the workspace has it.

When the Effect minor changes, also run `pnpm codegen` (the prelude tables), and review the diff of
newly exposed names before going on (ADR-0015).

## 4. Changelog

```bash
node packages/effectscript/core/scripts/release.ts changelog
```

This moves the `.changeset` notes that name only EffectScript packages into
`packages/effectscript/CHANGELOG.md`, under the new version. Upstream notes stay where they are.
A note that names both families stops the step, so split it first.

Commit the version and the changelog together, and nothing else (another change in the tree stays
out of the release commit). Step 3 also wrote the Zed extension's and the grammar's version files:

```bash
git add packages/effectscript/*/package.json packages/effectscript/zed/extension.toml packages/effectscript/zed/Cargo.toml packages/effectscript/zed/Cargo.lock packages/effectscript/tree-sitter/tree-sitter.json packages/effectscript/CHANGELOG.md .changeset
```

```bash
git commit -m "chore(effectscript): release <version>"
```

## 5. Check the packages

```bash
EFX_PACK=1 pnpm vitest --run packages/effectscript/core/test/release.test.ts
```

```bash
node packages/effectscript/core/scripts/release.ts pack --out packages/effectscript/dist-pack
```

The first command builds both packages from clean, packs them, installs the tarballs in an empty
project (with `effect` from the registry, as users get it), and runs `efx --version` and
`efx print`. It needs the network. The second leaves the two tarballs in `dist-pack/`. Each one is
refused when its `dist`, README, LICENSE or bins are missing, when tests or build files leaked
in, or when its dependencies break lockstep.

Also run the gates that CI runs:

```bash
pnpm check
```

```bash
pnpm vitest --run --project effectscript --project @effectscript/language --project @effectscript/vscode --project @effectscript/effect-docs --project @effectscript/site --project @effectscript/examples
```

## 6. The tree-sitter grammar

Neovim, Helix and Zed compile the grammar from a git repository that holds the generated parser
(ADR-0058). Create `EffectScript-Lang/tree-sitter-effectscript` once and clone it next to this
repository, then for each release:

```bash
node packages/effectscript/tree-sitter/scripts/export.mjs --out ../tree-sitter-effectscript --git
```

Push that commit, and tag it `v<version>`:

```bash
git -C ../tree-sitter-effectscript push origin HEAD
```

```bash
git -C ../tree-sitter-effectscript tag v<version> && git -C ../tree-sitter-effectscript push origin v<version>
```

The export prints the commit's SHA, for step 7. When the grammar didn't change, it prints the
existing commit, and the tag goes on that.

## 7. Pin the grammar in the Zed extension

Zed fetches the grammar at the commit named in `packages/effectscript/zed/extension.toml`, and the
Zed extension is published from this repository's tagged commit (step 12). So the pin goes in
before the tag:

```bash
node packages/effectscript/core/scripts/release.ts zed --rev <sha>
```

It takes only a full 40-character SHA: a branch or tag name could move after the release. Commit
the pin on its own:

```bash
git commit -m "chore(effectscript): pin the grammar for <version>" packages/effectscript/zed/extension.toml
```

## 8. Tag the binaries

First check that every release change is committed (the brand folder is another workflow's): this
prints nothing and exits 0 when the tree is ready.

```bash
git diff --quiet HEAD -- packages/effectscript ':!packages/effectscript/brand' && git status --short -- packages/effectscript ':!packages/effectscript/brand'
```

The tag goes first: if a binary fails to build, nothing is on npm yet, and the version can still
be fixed and re-tagged. npm never lets a version be published twice.

```bash
git tag effectscript@<version>
```

```bash
git push origin effectscript effectscript@<version>
```

The tag starts `.github/workflows/effectscript-release.yml`, which:

- checks that the tag matches `packages/effectscript/core/package.json`;
- builds the seven standalone binaries and smoke-tests the native ones;
- creates the GitHub release with the archives, `SHASUMS256.txt` and `install.sh`.

Wait for the workflow to pass before step 10.

## 9. The Homebrew tap

For the newest release, the same workflow's last job writes `Formula/effectscript.rb` to `EffectScript-Lang/homebrew-tap`
with the new checksums; a run for an older tag leaves the formula, and the "latest" release, alone.
A re-run replaces the release's assets, and commits nothing when the formula is unchanged. Check it
afterwards:

```bash
brew install EffectScript-Lang/tap/effectscript && efx --version
```

## 10. Publish to npm

`effectscript` goes first, because `@effectscript/language` depends on its exact version.

npm needs a tag for a prerelease, and points `latest` at a new package's first version whatever
the tag. Until the first stable release, every alpha goes to `latest`, so the documented
`npm i -D effectscript` installs the newest alpha:

```bash
npm publish packages/effectscript/dist-pack/effectscript-<version>.tgz --tag latest
```

```bash
npm publish packages/effectscript/dist-pack/effectscript-language-<version>.tgz --tag latest --access public
```

After the first stable release, a stable version goes to `latest` and an alpha to `--tag alpha`,
so `latest` stays stable.

## 11. The VS Code extension

```bash
node packages/effectscript/vscode/scripts/package.ts --out packages/effectscript/dist-pack/effectscript-<version>.vsix
```

The `.vsix` carries the Marketplace's form of the version: `x.y.z-alpha.N` becomes
`x.y.(z·1000+N)`, marked as a pre-release, and `x.y.z` becomes `x.y.(z·1000+999)` (ADR-0055).

`vsce` comes from the workspace, so it is the version the `.vsix` was packaged with. Both tools
read their token from the environment (`VSCE_PAT`, `OVSX_PAT`).

```bash
pnpm --filter effectscript-vscode exec vsce publish --packagePath "$PWD/packages/effectscript/dist-pack/effectscript-<version>.vsix" --pre-release
```

```bash
pnpm dlx ovsx@0 publish packages/effectscript/dist-pack/effectscript-<version>.vsix --pre-release
```

For a stable version, drop `--pre-release` from both.

## 12. The Zed extension

Zed's extensions are published from `zed-industries/extensions`, which holds each extension as a
git submodule. In a fork of that repository:

```bash
git submodule add https://github.com/EffectScript-Lang/effectscript.git extensions/effectscript
```

```bash
git -C extensions/effectscript checkout effectscript@<version>
```

Then add the entry to `extensions.toml`, with `path` because the extension is a subfolder of this
repository, and `version` equal to the one in `extension.toml`:

```toml
[effectscript]
submodule = "extensions/effectscript"
path = "packages/effectscript/zed"
version = "<version>"
```

Run `pnpm sort-extensions`, then stage the submodule at the tag (a plain commit would keep the
commit `git submodule add` checked out) and the entry together:

```bash
git add extensions/effectscript extensions.toml
```

Commit, and open the pull request. Later releases check out the new tag in the submodule, change
`version`, and stage both the same way.

Before that, `node packages/effectscript/zed/scripts/dev.mjs --out <dir>` builds a dev extension
with the grammar from a local repository, to try in Zed with "zed: install dev extension".

## 13. The site

```bash
pnpm --filter @effectscript/site build
```

The output in `packages/effectscript/site/dist` is static. Deploy it to Cloudflare as
`effectscript.dev`:

```bash
npx wrangler pages deploy packages/effectscript/site/dist --project-name effectscript
```

(Spec §9.4 names Alchemy for this. Either way, the deploy is only that folder.)

Then check that `https://effectscript.dev/install` serves the same bytes as
`packages/effectscript/core/distribution/install.sh`, because the install command on the site
uses it.
