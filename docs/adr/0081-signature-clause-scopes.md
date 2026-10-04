# ADR-0081: The grammar scopes an effect's success, error and requirement types

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the assistant, executing Plan 28 under ADR-0078 and the Blume theme spec (§5.2)
- **Related:** ADR-0041 (the VS Code extension's grammar is the source), ADR-0078, ADR-0079

## Context

ADR-0078 colours Effect's three channels: success green, error red, requirements blue. In code
that means the return type of an `effect` signature, the types after `throws` and the services
after `needs`. The TextMate grammar only scoped the `throws`/`needs` keywords. TSX, which the efx
grammar embeds, tokenizes the rest of an `effect` signature as plain identifiers, so no theme could
tell those types apart.

## Decision

The injection grammar (`vscode/syntaxes/effectscript.injection.tmLanguage.json`, copied unchanged
to `core/grammars/`) gains three scopes:

- `meta.return-type.efx`: the type after `):` when `throws`, `needs`, `{` or the end of the line
  follows.
- `meta.throws-clause.efx`: the types after `throws`, each an `entity.name.type.efx`, with `|` as
  `keyword.operator.type.efx`.
- `meta.needs-clause.efx`: the names after `needs`, separated by `|`, `,` or `&`, scoped the same
  way.

The keywords keep `keyword.other.throws.efx`. Themes colour the clause scopes. The site's and
editor's own theme decisions are separate.

## Consequences

- The site's syntax themes, and any editor theme that opts in, can show A / E / R at a glance.
- The rules are regular expressions on one line. A signature split across lines, or a generic
  with braces or parentheses in its arguments, isn't scoped. It falls back to the old highlighting,
  never to wrong colours.
- A plain TypeScript function in an `.efx` file also gets `meta.return-type.efx` on its return
  type. That is the same meaning (its success type), so it's accepted.

## Alternatives considered

- **Semantic tokens from the language server:** exact, and multi-line, but they don't reach static
  highlighters (Shiki on the site, GitHub). They can come later and refine the editor.
- **Rewriting the efx grammar's signature rules as begin/end blocks:** it would cover multi-line
  signatures, but it would have to re-implement TSX's parameter and type grammar and could break
  ordinary TypeScript highlighting in `.efx` files.
