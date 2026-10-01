# EffectScript for VS Code

Language support for EffectScript (`.efx`):

- A TextMate grammar: TSX plus an injection for EffectScript keywords, `throws`/`needs` and `|>`.
- IntelliSense through VS Code's built-in TypeScript server. The extension contributes the
  `@effectscript/language` TS server plugin for the `effectscript` language (ADR-0019).

Status: experimental. The manifest and grammar are tested in
`packages/effectscript/language/test/vscode.test.ts`, and the plugin is tested against a real
TypeScript 6 tsserver in `test/tsserver.test.ts`. Packaging (a bundled CommonJS plugin, `.vsix`)
and the "Show Compiled TypeScript" command come in a later plan. See `../COMPATIBILITY.md`.
