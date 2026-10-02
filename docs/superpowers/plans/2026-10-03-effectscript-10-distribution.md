# EffectScript Plan 10: Distribution

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Gate every commit: `pnpm check && pnpm lint && git commit …`.

**Goal:** `efx` installs without Node or npm. There is a standalone `bun build --compile` binary, an
install script, a Homebrew formula in the `EffectScript-Lang/homebrew-tap` tap, and a release
workflow that builds and publishes them. All GitHub coordinates move to the `EffectScript-Lang`
organization.

**Architecture:**

- `src/cli/host.ts` tells the CLI whether it runs as the standalone binary, through a global that
  the binary's generated entry sets before it imports the CLI.
  - In the binary, `efx run` runs the entry on the binary's own embedded Bun: it re-runs itself
    with `BUN_BE_BUN=1` and a preload unpacked into the user cache directory.
  - `efx check` runs the language checker the same way.
  - `version` comes from the entry instead of `package.json`.
- `scripts/standalone.ts build|package` compiles the binaries and packages them, with
  `SHASUMS256.txt`.
- `distribution/install.sh` installs a release. `scripts/homebrew.ts` writes the formula from a
  version and its checksums.
- `.github/workflows/effectscript-release.yml` runs both on an `effectscript@*` tag.

**Spec:** §7.5, §7.6 (release automation, step 3), §13 phase 7c.

**Decisions:**

- **New in this plan:**
  - ADR-0036: GitHub coordinates;
  - ADR-0037: standalone binary;
  - ADR-0038: install channels and the Plan 10 split.
- **Builds on:** ADR-0032 (phase 7 plans), ADR-0034 (`efx run` runtime), ADR-0008 (public org).

## Global Constraints

- No `gunta/` coordinates in shipped files. The repository is `EffectScript-Lang/effect-lang`
  and the tap is `EffectScript-Lang/homebrew-tap` (ADR-0036).
- Nothing is pushed, tagged, released or published by this plan. The workflow only runs once the
  repository is in the org and a tag is pushed (the user's call).
- The npm `efx` keeps its behaviour. Every standalone branch is behind `standalone()`.
- **Targets:** darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64 (spec §7.5).
- The install script is POSIX `sh` and never edits shell startup files.
- `efx setup`, `efx convert --ai` and `efx skill` move to Plan 10b, after phases 8 and 9
  (ADR-0038).

## Review Focus

1. A project whose packages export `.ts` sources (workspaces) runs under the binary's `efx run`.
   *(Task 3, e2e on `examples`)*
2. A checksum mismatch, an unsupported OS or architecture, or a failed download leaves nothing
   installed and exits non-zero with a clear message. *(Task 4)*
3. The unpacked preload is rewritten when its content differs, for example after an upgrade or a
   corrupt file, and never trusted by name alone. *(Task 2)*
4. `efx run --runtime node` from the binary works when the project has `effectscript` installed,
   and otherwise says what to install. *(Task 2)*
5. Exit codes and signals pass through the re-run process as they do in the npm CLI. *(Task 3)*

---

### Task 1: GitHub coordinates (ADR-0036)

- ADR-0036 records:
  - the repository `https://github.com/EffectScript-Lang/effect-lang` (it keeps its name on
    transfer);
  - the tap `EffectScript-Lang/homebrew-tap`, installed with
    `brew install effectscript-lang/tap/effectscript`;
  - release assets on that repository.
- **Changes:**
  - `homepage` and `repository.url` in the `effectscript`, `@effectscript/language` and VS Code
    extension package.json files;
  - spec §7.5 (the tap) and the spec's location line.
- **Test:** `test/distribution.test.ts` checks that every `packages/effectscript/*/package.json`
  with a `repository` points at `EffectScript-Lang/effect-lang`.

### Task 2: Host and standalone `run` (ADR-0037)

- **`src/cli/host.ts`:**
  - `standalone(): StandaloneHost | undefined`, which reads
    `globalThis.__effectscriptStandalone`, a `{ version, preload }` object;
  - `cacheDir(env, platform, home)`:
    - `$XDG_CACHE_HOME/effectscript`, else `~/.cache/effectscript`;
    - `%LOCALAPPDATA%\effectscript` on Windows;
    - `~/Library/Caches/effectscript` on macOS.
  - `unpack(dir, name, content)`: writes `<name>-<sha256 prefix>.js` atomically (a temp file,
    then rename) unless a file with exactly that content exists. It returns the path.
- **`run.ts`, when standalone:**
  - **Default:** the embedded Bun. It spawns `process.execPath` with `BUN_BE_BUN=1`,
    `--preload <unpacked>` and the entry.
    - `EFFECTSCRIPT_MAIN_RUNTIME` is `bun` when `@effect/platform-bun` is installed in the
      project, otherwise `node`.
    - The generated preload passes it to `efx({ runtime })`.
  - **`--runtime bun`:** the same.
  - **`--runtime node`:** `node --import <project's effectscript/register>` when the project has
    `effectscript`. Otherwise, exit 1 with "install effectscript in the project (npm i -D
    effectscript) or use the default runtime".
- **Other commands, when standalone:**
  - `check.ts` runs the language bin with `process.execPath` and `BUN_BE_BUN=1`.
  - `version` comes from the host.
  - `doctor` reports "efx binary (Bun X)" and drops the Node requirement.
- **Tests** (`test/standalone-host.test.ts`, under Node with the global set):
  - the `cacheDir` cases;
  - `unpack` is idempotent, rewrites changed or corrupt content, and leaves no temp files;
  - `run` with `--runtime node` reports the missing `effectscript`;
  - `doctor` in standalone mode.

### Task 3: The binary (`scripts/standalone.ts`)

- **`build [--target t…] [--outdir dir]`:**
  - bundles the preload (`src/bun.ts` plus the runtime env read) to text;
  - generates an entry that sets the host global and imports `src/cli/main.ts`;
  - runs `bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv
    --target bun-<t>` into `dist-bin/efx-<t>[.exe]`.

  The default target is the host's.
- **`package [--outdir dir]`:** writes `efx-<t>.tar.gz` (`.zip` for Windows), each containing `efx`
  or `efx.exe`, plus `SHASUMS256.txt`.
- **`.gitignore`:** `dist-bin/`.
- **Test** (`test/standalone.test.ts`, skipped when `bun` is missing): build the host target once,
  then check:
  - `--version`;
  - `print` of a `.efx` file;
  - `run` of `examples/src/main.efx` (workspace `.ts` exports), which prints the greetings;
  - `run` of a lone `.efx` file;
  - a failing program exits 1;
  - `run --runtime node` in a project without `effectscript` exits 1 with the message;
  - `package` writes the archive and a checksum that matches it.

### Task 4: Install script (ADR-0038)

- **`packages/effectscript/core/distribution/install.sh`:**
  - **Detects the platform:** `uname -s`/`-m` gives darwin or linux and x64 or arm64, and
    Rosetta is detected through `sysctl.proc_translated`.
  - **Settings:**
    - `EFX_VERSION` (default latest);
    - `EFX_INSTALL` (default `$HOME/.effectscript`);
    - `EFX_DOWNLOAD_BASE` (default `https://github.com/EffectScript-Lang/effect-lang/releases`).
  - **Download:** with curl or wget, and the archive must match `SHASUMS256.txt`
    (`shasum -a 256` or `sha256sum`).
  - **Install:** extracts into a temp dir, then moves the binary to `$EFX_INSTALL/bin/efx` and
    runs `efx --version`.
  - **PATH:** prints the line to add to PATH when it's needed.
- **Tests** (`test/install-script.test.ts`): a fake release under a `file://` base, and fake
  `uname` and `sysctl` on PATH. They cover:
  - a successful install;
  - a pinned version;
  - a checksum mismatch, which installs nothing;
  - an unsupported OS;
  - an unsupported architecture;
  - a missing asset;
  - a PATH hint printed only when it's needed.

### Task 5: Homebrew formula and release workflow (ADR-0038)

- **`scripts/homebrew.ts`:** `formula({ version, shasums })` returns `Formula/effectscript.rb`:
  - `on_macos`/`on_linux` × `on_arm`/`on_intel` URLs on the release tag
    `effectscript@<version>`;
  - `bin.install "efx"`;
  - caveats with `efx init` and `efx convert`;
  - a `test do` block that runs `efx --version`.

  The CLI writes the formula to stdout.
- **`.github/workflows/effectscript-release.yml`**, on an `effectscript@*` tag or a dispatch:
  - builds darwin on `macos-latest` and the others on `ubuntu-latest`;
  - smoke-tests the native binaries;
  - packages them;
  - creates the GitHub release with the archives, `SHASUMS256.txt` and `install.sh`;
  - pushes the formula to `EffectScript-Lang/homebrew-tap` with the `HOMEBREW_TAP_TOKEN` secret.
- **Tests:**
  - the formula for a fixture version and checksums (snapshot), and every platform URL;
  - `ruby -c` when Ruby is present;
  - the workflow YAML parses and references `scripts/standalone.ts` and `scripts/homebrew.ts`.

### Task 6: Docs

- Spec §7.5:
  - the binary's `run` semantics;
  - the tap name;
  - the Plan 10b split.
- COMPATIBILITY rows.
- The core README install section.
- This plan's execution record.
