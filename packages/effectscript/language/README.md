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

**Font:** EffectScript's docs set code in JetBrains Mono with its ligatures on, so `|>` draws as
▷ (ADR-0080). In VS Code and its forks: `"editor.fontFamily": "JetBrains Mono"` and
`"editor.fontLigatures": true`. Ligatures only change how code looks, never what you type.

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

**Zed:** the EffectScript extension (`packages/effectscript/zed`) brings the grammar, the outline,
indentation and `efx lsp`. Until it is in Zed's extension registry, build a dev extension with
`node packages/effectscript/zed/scripts/dev.mjs --out <dir>`, then run "zed: install dev
extension" and pick `<dir>/extension`.

**Other LSP clients** (Emacs, Sublime Text, JetBrains through LSP4IJ): run `efx lsp` over stdio for
`*.efx` files, started in the project root.

### Tree-sitter

The `tree-sitter-effectscript` grammar (`packages/effectscript/tree-sitter`, ADR-0058) parses
every EffectScript construct, where TypeScript's grammar stops at the first `effect` or `|>`. Its
repository, `EffectScript-Lang/tree-sitter-effectscript`, holds the generated parser and the
queries (highlights, locals, injections, folds and indents). Until it is published, this writes the
same repository locally; use its path in place of the URL below:

```bash
node packages/effectscript/tree-sitter/scripts/export.mjs --out ~/src/tree-sitter-effectscript --git
```

- **Neovim, with nvim-treesitter (main branch):**

  ```lua
  vim.api.nvim_create_autocmd("User", {
    pattern = "TSUpdate",
    callback = function()
      require("nvim-treesitter.parsers").effectscript = {
        install_info = { url = "https://github.com/EffectScript-Lang/tree-sitter-effectscript", queries = "queries" },
      }
    end,
  })
  vim.treesitter.language.register("effectscript", "effectscript")
  ```

  Then `:TSInstall effectscript`.

- **Helix:** in `languages.toml`, point the language at the grammar, then run `hx --grammar fetch`
  and `hx --grammar build`. Copy the repository's `queries/helix/*.scm` to
  `~/.config/helix/runtime/queries/effectscript/`: they are self-contained, with the patterns in
  the order Helix reads them (the first match wins there).

  ```toml
  [[language]]
  name = "effectscript"
  grammar = "effectscript"

  [[grammar]]
  name = "effectscript"
  source = { git = "https://github.com/EffectScript-Lang/tree-sitter-effectscript", rev = "main" }
  ```

Requires `typescript@^6` (the JS compiler API). TypeScript 7 native has no plugin API yet. See
`../COMPATIBILITY.md` for what is tested on which host.
