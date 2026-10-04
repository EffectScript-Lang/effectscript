# ADR-0080: Code is set with JetBrains Mono's ligatures on

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation during the Blume theme design: "I love the ligatures that
  make |> look like a play sign … `===` `!=` etc. too", to be used everywhere possible
- **Related:** `packages/effectscript/brand/README.md` (Typography), the brand book, spec
  `docs/superpowers/specs/2026-10-05-effectscript-blume-theme-design.md` §5.3, ADR-0078, ADR-0079

## Context

The brand guide said "ligatures off for code". Plan 21 applied that to the site
(`font-variant-ligatures: none` on `code`, `pre` and `kbd`, `fontLigatures: false` in the
playground's Monaco), and the brand scripts shaped JetBrains Mono without `liga`/`calt`. The reason
was that `|>` and `=>` should read as typed.

JetBrains Mono draws its programming ligatures through its `calt` feature, and the shipped
`brand/fonts/JetBrainsMono-*.ttf` contain them: `|>` as a ▷ play triangle, `===`, `!==`, `!=`, `=>`,
`->`, `>=`, `<=` and others. EffectScript code leans on `|>` more than most languages, and the user
finds the ligated form beautiful.

## Decision

- **Code is set in JetBrains Mono with its contextual ligatures on** (`calt`, plus `liga`):
  `font-variant-ligatures: contextual common-ligatures` (or `font-feature-settings: "calt", "liga"`)
  wherever code appears.
- That covers the Blume theme, the landing page, the playground's Monaco (`fontLigatures: true`),
  the brand book and the generated brand assets (the `text.py` shaper turns `calt` on for JetBrains
  Mono), and the editor-setup guide, which recommends `editor.fontLigatures` with JetBrains Mono.
- `// LABELS` are unchanged. Their +6% tracking already keeps the browser from forming ligatures.
- **Copying always gives the typed characters.** Ligatures are only drawn, so copy buttons and
  selection copy `|>`, not ▷. The pipe reference page says once that ▷ is typed `|>`.
- Font subsetting keeps the layout features (`calt`) and the ligature glyphs. The site build test
  checks that a subset font still forms the `|>` ligature.

## Consequences

- Pipelines read as a flow of ▷ steps, and equality and arrows read as single symbols.
- A newcomer may not know that ▷ is typed `|>`. The pipe reference page, the playground (where
  typing `|>` shows the ligature immediately) and copy-as-typed cover that.
- Code images and social cards must be rebuilt with the brand scripts so they match the site.
- If a future font replaces JetBrains Mono, it must offer the same ligatures or this decision is
  revisited.

## Alternatives considered

- **Keep ligatures off (Plan 21):** code reads exactly as typed, but the user finds it plain, and
  `|>`-heavy code is harder to scan.
- **Ligatures for `|>` only:** inconsistent. `===` and `=>` next to a ligated ▷ would look
  unfinished. JetBrains Mono's set is designed as a whole.
- **A different coding font (Fira Code, Monaspace):** JetBrains Mono is already the brand's mono, is
  used by Effect, and has these ligatures.
- **A toggle for readers:** more UI for a rare need. Copying gives the typed text anyway.
