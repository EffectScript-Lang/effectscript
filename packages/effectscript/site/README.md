# effectscript.dev

The EffectScript site: the landing page, the two-way playground, and the docs (Starlight at
`/docs`). Static Astro output; nothing is deployed from here (ADR-0054).

```bash
pnpm --filter @effectscript/site dev       # http://localhost:4321
pnpm --filter @effectscript/site build     # dist/
pnpm --filter @effectscript/site preview
```

## Where the content comes from

Nothing in the docs is copied by hand. `scripts/content.ts` runs before `dev` and `build` and
writes these gitignored inputs:

| Output                                      | Source                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| `public/` fonts, favicons, Open Graph image | `packages/effectscript/brand`                                |
| `src/content/docs/docs/reference/`          | the skill's `references/syntax.md` (the compiler's fixtures) |
| `src/content/docs/docs/guides/`             | the skill's `SKILL.md`, `patterns.md` and `pitfalls.md`      |
| `src/content/docs/docs/effect/`             | `packages/effectscript/effect-docs/content` (ADR-0050)       |
| `public/llms.txt`, `public/llms-full.txt`   | the above                                                    |

Hand-written pages live in `src/content/docs/docs/{index.mdx,start/}`.

## The landing page

- **The gallery:** `src/samples/<scenario>/{plain.ts,app.efx}`. The Effect TypeScript pane is
  compiled from `app.efx` at build time.
- **Token counts:** `o200k_base`, the GPT-4o tokenizer, on the exact code shown.
- **Tests:**
  - every `app.efx` compiles and type-checks against `effect`;
  - the counts on the page match the tokenizer.

## The playground

The playground (`src/playground/`) runs the real compiler in a Web Worker. Monaco highlights with
the same `source.efx` grammar as the docs, through Shiki. Share links put the code in the URL
hash, which never reaches a server.
