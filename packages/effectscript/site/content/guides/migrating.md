---
title: Migrating with efx convert
description: Convert an Effect TypeScript project to EffectScript, verified, on its own branch.
sidebar:
  order: 1
---

Every `.ts` file is already valid EffectScript, so there is nothing you have to migrate. `efx convert`
is for when you want the shorter syntax in code that exists: it rewrites Effect TypeScript into
EffectScript, and only where the result compiles back to the same TypeScript.

## 1. See what would change

```bash
efx convert             # the whole project
efx convert src/users   # or some files and directories
```

Without `--write`, nothing is written. It reports, per file, what would become EffectScript and
what stays TypeScript. Add `--explain` for the reason behind each part that stays.

## 2. Convert, on a branch

```bash
efx convert --write
```

`--write` needs a clean git tree (or `--force`). It then:

1. creates the branch `effectscript/convert`;
2. renames each converted `.ts` file to `.efx` and rewrites the imports that point at it;
3. runs `efx check` and your tests (`npm test`, or `--test "<command>"`), and reverts any file
   whose conversion breaks them (`--no-verify` skips this).

You review the branch like any other change, and merge it or delete it.

## 3. Hand the rest to your coding agent (optional)

```bash
efx convert --write --ai
```

After the mechanical pass, `--ai` gives each file that still has TypeScript left to your own
coding agent (Claude Code, Codex, Gemini CLI or opencode; pick one with `--agent`), along with the
EffectScript skill. An edit is kept only if the file compiles and the project still verifies.
Edits to other files are undone, and nothing that existed before is ever deleted. Nothing leaves
your machine except through the agent you already run.

## What stays TypeScript

The converter is conservative: a rewrite applies only where the forward compiler reproduces the
original exactly. Typical leftovers are `Effect.fn` with span options, hand-written `pipe` chains
the syntax has no form for, and code that mixes Promises into effects. They are still valid
EffectScript, and you can convert them by hand whenever you touch them.

## Going back

Every `.efx` file compiles to plain, idiomatic Effect TypeScript, and `efx print` shows it:

```bash
efx print src/users.efx > src/users.ts
```
