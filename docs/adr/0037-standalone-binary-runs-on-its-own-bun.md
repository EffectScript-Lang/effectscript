# ADR-0037: The standalone binary runs programs on its own Bun

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 10, from a spike
- **Related:** spec §7.5; ADR-0021, ADR-0032, ADR-0034, ADR-0035

## Context

Spec §7.5 ships `efx` as a `bun build --compile` binary, so users need no Node, Bun or npm. It
says `efx run` "runs in-process", registering the Bun plugin and then importing the entry.

A spike on Bun 1.4.2 showed:

- **In-process:** `Bun.plugin(efx())` followed by `import(entry)` inside a compiled binary loads
  `.efx` files and plain `.js` packages. It can't resolve a package whose `exports` point at
  `.ts` sources ("Cannot find package"). Workspace packages are commonly written that way,
  including every package in this monorepo.
- **Re-run as Bun:** the same binary started with `BUN_BE_BUN=1` behaves as the `bun` CLI. With
  `--preload <file>` holding the EffectScript plugin, it runs the examples package (workspace
  `.ts` exports), a lone `.efx` file, and a lone file that imports `effect` (through Bun's
  auto-install).
- **bunfig.toml:** a compiled binary loads it from the working directory by default. A project's
  `preload = ["effectscript/bun-preload"]` then fails when the project has no `effectscript`
  installed.

## Decision

- **Build:** `bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv`, for
  darwin-arm64, darwin-x64, linux-x64, linux-arm64 and windows-x64. The generated entry sets
  `globalThis.__effectscriptStandalone = { version, preload }` and then imports the CLI.
  `src/cli/host.ts` reads it. The npm CLI never sets it, so it keeps its behaviour.
- **`efx run` in the binary:**
  - **Default:** re-run the binary itself with `BUN_BE_BUN=1 --preload <preload> <entry> args…`.
    The preload is unpacked into the user cache directory:
    - `$XDG_CACHE_HOME/effectscript`;
    - else `~/Library/Caches/effectscript` on macOS, `~/.cache/effectscript` on Linux, and
      `%LOCALAPPDATA%\effectscript` on Windows.

    The file is named by a hash of its content. It is written atomically and rewritten whenever
    its content differs.
  - **Runtime for `main`:** Bun when the project has `@effect/platform-bun`, otherwise Node's
    platform, which runs on Bun. ADR-0034 applies, without its "is Bun installed" condition.
  - **`--runtime node`:** needs Node on PATH and `effectscript` installed in the project, for
    `effectscript/register`. Otherwise it says what to install.
- **Other commands in the binary:**
  - `efx check` runs `@effectscript/language`'s checker from the project on the binary's Bun.
  - `efx build` loads the project's TypeScript as before.
  - `efx doctor` reports the binary instead of a Node requirement.
- **Exit codes and signals** of the re-run process pass through as in the npm CLI.

## Consequences

- Each `efx run` starts one extra process, which costs tens of milliseconds, in exchange for
  correct resolution everywhere.
- The binary depends on `BUN_BE_BUN`, a documented Bun feature. If it disappeared, the standalone
  `run` tests would fail on the next Bun upgrade.
- If Bun fixes resolution of `.ts` package exports inside compiled binaries, an in-process `run`
  becomes possible. The behaviour would be the same, with one process fewer.
- `efx check` under Bun runs the TypeScript checker on Bun rather than Node.
- macOS binaries are ad-hoc signed by Bun, not notarized. Installs through curl and Homebrew
  don't quarantine them; notarization is release-prep work (phase 11).

## Alternatives considered

- **In-process `run` (the spec's wording):** it fails on workspace packages with `.ts` exports,
  which are common in exactly the monorepos EffectScript targets.
- **Require a separately installed Bun or Node for `run`:** defeats the point of a standalone
  binary.
- **A temp-dir preload:** `/tmp` is shared on Linux, so another user could plant the file. The
  user cache directory with a content check avoids that.
- **Embed the preload path through `$bunfs`:** an embedded file can't be passed to `--preload` of
  the re-run process, which reads from disk.
