# EffectScript for VS Code

Language support for EffectScript (`.efx`), TypeScript with Effect as native syntax:

- **IntelliSense** through VS Code's built-in TypeScript server, with the `@effectscript/language`
  plugin bundled in (ADR-0019). `.ts` files can import `.efx` modules.
- **The `await` guardrails** (ADR-0039):
  - an `await` inside `effect` code is an effect bind; it is shown in its own color and explained
    on hover;
  - awaiting a Promise there reads "Cannot `await` a Promise inside `effect`".

  The color is the theme color `effectscript.effectAwait`. Set
  `"workbench.colorCustomizations": { "effectscript.effectAwait": "#…" }` to change it.
- **Commands:**
  - **EffectScript: Show Compiled TypeScript** opens the compiled TypeScript beside the source and
    follows your edits. It is also on the editor title bar.
  - **EffectScript: Convert File to EffectScript** turns a `.ts` file into `.efx`.
  - **EffectScript: Convert File to TypeScript** does the reverse.

  The conversions also rewrite the files that import the converted one, as one undoable edit.
- A TextMate grammar (TSX plus EffectScript keywords, `throws`/`needs` and `|>`) and `.efx` file
  icons.

Packaging: `pnpm --filter effectscript-vscode package` writes `effectscript-<version>.vsix`
(ADR-0041). Tests: `test/package.test.ts`. An end-to-end run in a throwaway VS Code profile is
`EFX_VSCODE_E2E=1 pnpm vitest run --project @effectscript/vscode test/e2e.test.ts`. See
`../COMPATIBILITY.md`.
