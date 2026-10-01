# @effectscript/language

Language tooling for EffectScript (`.efx`), built on Volar (ADR-0019):

- `createLanguagePlugin(ts)`: the Volar language plugin. It compiles `.efx` with incomplete-code
  recovery (ADR-0020) and exposes the result as a TypeScript/TSX virtual file with exact mappings.
- The TypeScript server plugin that VS Code's built-in TS server loads for `.efx`.
- `efx-tsc`: real `tsc` (TypeScript 6) with diagnostics mapped back to `.efx` positions.

Requires `typescript@^6` (the JS compiler API). TypeScript 7 native has no plugin API yet. See
`../COMPATIBILITY.md` for what is tested on which host.
