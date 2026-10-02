# @effectscript/docs: the Effect docs, in EffectScript

Every Effect doc and example in this repository, converted to EffectScript by the reverse
compiler (ADR-0050). Each example compiles back to the original TypeScript (ADR-0030).

| Path                                     | What                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| [`content/LLMS.efx.md`](content/LLMS.efx.md) | `LLMS.md`, the guide for agents, with EffectScript code            |
| [`content/ai-docs/`](content/ai-docs)   | Every `ai-docs` example as `.efx`, and the section texts             |
| [`content/guides/`](content/guides)     | Package READMEs, `SCHEMA.md`, `CONFIG.md`, …, and the migration guides |
| [`content/api/`](content/api)           | Each module's JSDoc examples, per symbol                              |
| [`content/corpus.jsonl`](content/corpus.jsonl) | One line per example: `{ area, source, symbol, title, ts, efx, changed, parsed }` |
| [`content/REPORT.md`](content/REPORT.md) | What was converted, and the token savings                             |

The prose is Effect's own, so it names the TypeScript forms. Each page opens with the mapping
(`Effect.gen` → `effect { }`, `yield*` → `await`, `.pipe` → `|>`, …).

## Regenerating

```bash
pnpm --filter @effectscript/docs codegen          # writes content/
node packages/effectscript/docs/scripts/generate.ts --check   # fails on drift
```

`content/` is generated; never edit it by hand. The test suite checks that it is up to date. The
release automation regenerates it on every upstream merge (ADR-0015).

## For AI training and evaluation

`corpus.jsonl` is a parallel TypeScript ↔ EffectScript corpus of about 4,000 examples, with
their source paths and symbols. Each pair is exact: `toTypeScript(efx)` gives the same tokens as
`ts`. Use `changed: true` for the examples where EffectScript differs.
