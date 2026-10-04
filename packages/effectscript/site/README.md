# effectscript.dev

The EffectScript site: the landing page, the two-way playground, and the docs at `/docs`. It is one
Blume project (ADR-0079) with the public EffectScript theme, `effectscript/blume`: signal colours
for state (ADR-0078) and code set with ligatures (ADR-0080). The build is static; `site-edge`
serves it (ADR-0073).

```bash
pnpm --filter @effectscript/site dev       # Blume's dev server
pnpm --filter @effectscript/site build     # dist/
pnpm --filter @effectscript/site preview
```

- `blume.config.ts`, `components.ts`, `theme.css`: the site's config and the theme, the same three
  files `efx init` writes for any project.
- `pages/`: the landing page (`/`), the playground (`/playground`) and the teaser (`/soon`), as
  Blume custom pages with their own layout (`src/layouts/Base.astro`).
- `content/`: the docs, mounted at `/docs`. Links in them are written with `/docs`, and links to
  the playground are absolute, because Blume puts `/docs` in front of every other root link.

## Where the content comes from

Nothing in the docs is copied by hand. `scripts/content.ts` runs before `dev` and `build` and
writes these gitignored inputs:

| Output                                      | Source                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| `public/` fonts, favicons, Open Graph image | `packages/effectscript/brand`                                |
| `content/reference/`                        | the skill's `references/syntax.md` (the compiler's fixtures) |
| `content/guides/`                           | the skill's `SKILL.md`, `patterns.md` and `pitfalls.md`      |
| `content/effect/`                           | `packages/effectscript/effect-docs/content` (ADR-0050)       |
| `content/**/meta.ts`                        | the sidebar's group titles and order                         |

Blume writes `llms.txt`, `llms-full.txt`, a Markdown copy of each page and a JSON API from the
pages. Hand-written pages are `content/index.mdx`, `content/start/install.md` and
`content/guides/migrating.md`.

## The landing page

- **The gallery:** `src/samples/<scenario>/{plain.ts,app.efx}`. The Effect TypeScript pane is
  compiled from `app.efx` at build time.
- **Token counts:** `o200k_base`, the GPT-4o tokenizer, on the exact code shown.
- **Tests:**
  - every `app.efx` compiles and type-checks against `effect`;
  - the counts on the page match the tokenizer.

## The playground

The playground (`src/playground/`) runs the real compiler in a Web Worker. Monaco highlights with
the same `source.efx` grammar and EffectScript theme as the docs, through Shiki, with ligatures on. Share links put the code in the URL
hash, which never reaches a server.
