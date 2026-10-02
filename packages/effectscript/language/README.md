# @effectscript/language

Language tooling for EffectScript (`.efx`), built on Volar (ADR-0019):

- `createLanguagePlugin(ts)`: the Volar language plugin. It compiles `.efx` with incomplete-code
  recovery (ADR-0020) and exposes the result as a TypeScript/TSX virtual file with exact mappings.
- The TypeScript server plugin that VS Code's built-in TS server loads for `.efx`.
- `efx-tsc`: real `tsc` (TypeScript 6) with diagnostics mapped back to `.efx` positions.
- `efx-language-server`: a standalone LSP server for editors other than VS Code (ADR-0040).
  `efx lsp` runs it: the project's copy with the npm CLI, or the copy built into the standalone
  binary, which brings its own TypeScript 6.

Both editor hosts show the `await` guardrails (ADR-0039):

- a hover that marks an effect `await` as an effect bind;
- a plain-English error for awaiting a Promise inside `effect`;
- in LSP editors, a `keyword` semantic token with the `effect` modifier on each bind.

## Editor setup

**Neovim 0.11+:**

```lua
vim.filetype.add({ extension = { efx = "effectscript" } })
vim.lsp.config("efx", {
  -- start in the project root, so `efx lsp` finds the project's @effectscript/language
  cmd = function(dispatchers, config)
    return vim.lsp.rpc.start({ "efx", "lsp" }, dispatchers, { cwd = config.root_dir })
  end,
  filetypes = { "effectscript" },
  root_markers = { "tsconfig.json", "package.json", ".git" },
})
vim.lsp.enable("efx")
-- optional: style effect binds
vim.api.nvim_set_hl(0, "@lsp.typemod.keyword.effect", { italic = true })
```

**Helix** (`~/.config/helix/languages.toml`):

```toml
[language-server.efx]
command = "efx"
args = ["lsp"]

[[language]]
name = "effectscript"
scope = "source.efx"
file-types = ["efx"]
roots = ["tsconfig.json", "package.json"]
language-servers = ["efx"]
grammar = "typescript"
```

Helix highlights the language with the TypeScript grammar. Give it TypeScript's queries with one
line, `; inherits: typescript`, in each of `highlights.scm`, `textobjects.scm`, `indents.scm`,
`locals.scm` and `injections.scm`, under `~/.config/helix/runtime/queries/effectscript/`.

**Zed:** registering a new language takes a Zed extension, which is planned. **Other LSP
clients** (Emacs, Sublime Text, JetBrains through LSP4IJ): run `efx lsp` over stdio for `*.efx`
files, started in the project root.

Requires `typescript@^6` (the JS compiler API). TypeScript 7 native has no plugin API yet. See
`../COMPATIBILITY.md` for what is tested on which host.
