# ADR-0054: The site's stack deviations and where its content comes from

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 16 (phase 10)
- **Related:** spec §9; ADR-0036, ADR-0041, ADR-0050, ADR-0051

## Context

Spec §9.4 mirrors the Effect website's stack: Astro 7, Starlight, Expressive Code + Shiki 4,
Tailwind 4, React 19, `@effect/monaco-editor`, `motion` and `astro-seo`.

- **Monaco:** on npm, `@effect/monaco-editor` is a 0.0.x "custom fork of Monaco Editor maintained
  for the Effect Playground", with no documentation of what differs. The official
  `monaco-editor` 0.57 has the same API.
- **Content:** the site's docs need a language reference, guides and the Effect docs. Each
  already has a source of truth: the compiler's fixtures, the agent skill (ADR-0051) and the
  EffectScript edition of the Effect docs (ADR-0050).

## Decision

- **The stack** follows spec §9.4, with these differences:
  - **Monaco:** the official `monaco-editor`, loaded only on `/playground`. Switching to
    `@effect/monaco-editor` later is a dependency swap.
  - **Animation and SEO:** `motion` and `astro-seo` are left out until a section needs them.
    Starlight and a small layout set the SEO and Open Graph tags (the brand's `og-image.jpg`).
  - **Themes:** code uses Shiki's `dark-plus`/`light-plus` (VS Code's Dark+/Light+). VS Code's
    "Dark Modern" isn't bundled with Shiki.
- **Generated, never copied by hand:** `scripts/content.ts` runs before `dev` and `build` and
  writes:
  - the brand assets (fonts, favicons, marks, the Open Graph image), from `brand/`;
  - the language reference pages, from `core/test/fixtures`;
  - the guides that come from the skill's `patterns.md`/`pitfalls.md`;
  - the "Effect, in EffectScript" section, from `effect-docs/content`;
  - `llms.txt`.

  These outputs are gitignored. Hand-written pages (home, install, editor setup) live in
  `src/content/docs`.
- **`efx` highlighting** uses the VS Code extension's `source.efx` grammar (ADR-0041), loaded with
  Shiki's TSX grammar, which it embeds.
- **The landing page's numbers are computed at build time** from the shown code, using
  `gpt-tokenizer` (`o200k_base`), and the page names the tokenizer.
- **`astro build --force`:** Astro's content cache can keep a failed render (an empty page), so
  builds always run with `--force`.

## Consequences

- The docs can't drift from the compiler, the skill or the corpus. Changing any of them changes
  the site on the next build.
- The site needs the workspace (it reads sibling packages), as the Effect website reads Effect's
  sources.
- Deployment (Alchemy to Cloudflare, spec §9.4) is a publish step and is left to the user.

## Alternatives considered

- **`@effect/monaco-editor` now:** an undocumented 0.0.x fork is a risk without a known benefit.
- **Committed copies of the generated pages:** duplicates of several sources, needing their own
  drift checks.
- **Counting tokens in the browser only:** numbers on the page would depend on a worker loading.
  Build-time counts are exact and testable. A browser toggle can still show token boundaries.
