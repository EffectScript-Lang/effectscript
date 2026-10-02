# ADR-0038: Install channels, release assets, and moving `setup`/`--ai`/`skill` to Plan 10b

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 10; the user asked for cross-platform checks on their
  machine (OrbStack, Parallels)
- **Related:** spec §7.5, §7.6, §13; ADR-0032, ADR-0036, ADR-0037

## Context

Spec §7.5 lists three channels (npm, Homebrew, an install script) and a binary for five targets.
ADR-0032 put the binary, the channels, `efx setup`, `efx convert --ai` and `efx skill` in Plan 10.

Those last three install or use outputs of later phases:

- `setup` installs the VS Code extension (`.vsix`, phase 8) and configures editors to use
  `efx lsp` (phase 8). It also installs the skill (phase 9).
- `convert --ai` hands agents the skill.
- `skill` installs it.

Smoke-testing the Linux builds in Docker showed that glibc binaries don't run on Alpine, a common
Docker base. Bun's musl builds run there once `libstdc++` and `libgcc` are installed.

## Decision

- **Release assets** on `EffectScript-Lang/effect-lang` releases, tagged
  `effectscript@<version>` (ADR-0036):
  - `efx-<target>.tar.gz`, holding `efx`;
  - `efx-windows-x64.zip`, holding `efx.exe`;
  - `SHASUMS256.txt` and `install.sh`.

  Asset names carry no version, so `releases/latest/download/<asset>` always works. GitHub's
  "latest" skips prereleases, so alpha releases are published as regular releases and marked
  latest. npm dist-tags, not GitHub, say what is prerelease.
- **Targets:** the five in spec §7.5, plus `linux-x64-musl` and `linux-arm64-musl`.
- **Install script** (`distribution/install.sh`, POSIX `sh`, served at
  effectscript.dev/install by the site):
  - **Detection:** OS, architecture, Rosetta (a translated shell gets the arm64 build) and musl.
    On musl without `libstdc++`, it stops and prints the `apk add` line.
  - **Download:** with curl or wget, verified against `SHASUMS256.txt`.
  - **Install:** runs the downloaded binary before installing it. It installs into
    `~/.effectscript/bin` with a copy and rename, and prints the PATH line instead of editing
    shell startup files.
  - **Settings:** `EFX_VERSION`, `EFX_INSTALL` and `EFX_DOWNLOAD_BASE`.
- **Homebrew:**
  - The `effectscript` formula lives in `EffectScript-Lang/homebrew-tap`. It is generated from
    the release checksums and pushed by the release workflow.
  - Its caveats point at `efx init` and `efx convert`; `efx setup` joins when it exists.
- **Windows:** download the zip, or use npm. A PowerShell installer, winget and scoop are later
  (spec §7.5).
- **Cross-platform checks:** `scripts/xplatform.sh` runs on a developer Mac:
  - every Linux build, plus `install.sh`, in Docker containers (OrbStack): Debian, Ubuntu and
    Alpine, on arm64 and amd64;
  - the generated formula with real Homebrew (`homebrew/brew`: `brew install` from a local tap,
    then `brew test`);
  - darwin-x64 under Rosetta;
  - windows-x64 in a Parallels VM with `--windows`.

  CI runs the native smoke test per runner.
- **Plan 10b, after phases 8 and 9:** `efx setup`, `efx convert --ai` and `efx skill`. ADR-0032's
  Plan 10 scope is narrowed accordingly.

## Consequences

- Users on Alpine get a working binary after one `apk add`. Two more assets per release.
- Nothing is published until the repository is in the organization and a tag is pushed. The
  release workflow needs a `HOMEBREW_TAP_TOKEN` secret with write access to the tap.
- `brew install effectscript` (without the tap prefix) needs homebrew-core, which requires a
  notable, stable project. It comes later.
- The install script's own tests run on any machine. The real-container checks need Docker,
  which developers run on demand.

## Alternatives considered

- **Edit `~/.zshrc`/`~/.bashrc` from the installer (as Bun's does):** convenient, but it silently
  changes files the user owns. Printing the exact line keeps the user in control.
- **Versioned asset names (`efx-4.0.0-darwin-arm64.tar.gz`):** `latest/download` URLs would then
  need an API call to find the name.
- **Glibc builds only:** Alpine users would get a binary that fails with relocation errors.
- **Keep `setup`, `--ai` and `skill` in Plan 10:** they would ship pointing at an extension, a
  language server and a skill that don't exist yet.
