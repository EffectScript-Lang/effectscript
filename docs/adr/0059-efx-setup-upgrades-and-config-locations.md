# ADR-0059: `efx setup` upgrades what it installed, and follows the tools' config variables

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 20, after its final review
- **Related:** ADR-0052 (amended by this), ADR-0055 (the Marketplace version mapping)

## Context

ADR-0052 made `efx setup` skip a VS Code-family editor whenever `--list-extensions` showed the
EffectScript extension, and it looked for agents and Neovim only in their default directories.

- After updating `efx`, the editor kept the old extension: setup said "already installed".
- An older skill's files that a newer version dropped stayed behind, and a changed skill was
  replaced without saying so.
- People who set `CLAUDE_CONFIG_DIR`, `CODEX_HOME` or `NVIM_APPNAME` got the skill and the Neovim
  plugin in directories their tools never read.

## Decision

- **The extension is upgraded** when the installed version (`--list-extensions
  --show-versions`) is older than the Marketplace version of the `.vsix` this `efx` carries
  (ADR-0055's mapping, which core keeps a copy of; a test keeps it equal to the packaging
  script's). The upgrade passes `--force` and reports `upgraded X → Y`. An equal or newer
  extension is skipped.
- **The skill counts as current** only when every file matches and its manifest lists no file
  this version dropped. Replacing an older one reports `updated …`.
- **`CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `NVIM_APPNAME` move the targets,** as they do for the
  tools themselves. An empty value is ignored, and so is a relative directory variable (it would
  depend on where efx runs); `XDG_CONFIG_HOME`, `APPDATA` and `LOCALAPPDATA` follow the same rule.

## Consequences

- Updating `efx` and running `efx setup` brings editors and agents up to date.
- **Cost if wrong:** a user who pinned an older extension on purpose gets it replaced by
  `efx setup`; `--only` excludes the editor.

## Alternatives considered

- **Always reinstall the extension:** slow, and it reports a change every run.
- **Read the version from the `.vsix` itself:** needs unzipping on every run; the version follows
  from `efx`'s own.
- **Honour relative directory variables against the current directory:** writes depend on where
  the command runs, which is how the reviewer's `./skills/effectscript` appeared.
