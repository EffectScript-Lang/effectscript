---
title: Install
description: Install the efx CLI, set up your editors and agents, and start a project.
---

```bash
curl -fsSL https://effectscript.dev/install | sh     # the standalone efx, no Node needed
brew install effectscript-lang/tap/effectscript      # the same, with Homebrew
npm i -D effectscript @effectscript/language typescript@6   # in a project, next to effect
```

In a project, `effect` and `@effect/platform-node` are yours: EffectScript uses the ones you
install (`npm i effect @effect/platform-node`), on the same minor version. `efx init` says what is
missing.

Then, once per machine and once per project:

```bash
efx setup     # editors (VS Code, Cursor, Neovim, Helix, …) and coding agents (the EffectScript skill)
efx init      # this project: the TypeScript plugin and scripts
efx doctor    # what is installed and configured, and what is missing
```
