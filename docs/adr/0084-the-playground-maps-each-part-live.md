# ADR-0084: The playground is a full-screen editor that links each EffectScript part to its TypeScript

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: make the playground full screen and more like a real
  editor, with a better, Effect-style highlighter and the brand font with ligatures; map each part
  of the `.efx` to its TypeScript in real time so people see exactly how it is translated; wrap the
  code; scroll with the code, favouring the EffectScript side; "very visual, nice". Agent rulings
  for the rest.
- **Related:** ADR-0054 (the playground), ADR-0078 (signal colours), ADR-0079 (Blume and the
  `effectscript-dark` theme), ADR-0080 (ligatures on), ADR-0081 (signature clause scopes), spec §9.2

## Context

The playground was two 28rem Monaco panes inside a page, with VS Code's Dark+ and no ligatures.
It showed the input and the output, but not which part became which, so a reader had to diff the
two panes in their head. The compiler already knows the answer: every `toTypeScript` result
carries Volar mappings (`CompileResult.mappings`) that pair source and generated ranges. Copied
text is a verbatim run, a rewrite is an edited chunk (`await` → `yield*`), and text the compiler
adds is a zero-length chunk (`= Effect.fn("greet")(function*`).

## Decision

- **Full screen.** `/playground` is the app: a static site bar (so the page's links exist before
  the editor loads), a toolbar with the examples, Share and the A/E/R legend, the two panes side by
  side, an optional problems drawer and a status bar. The panes stack on narrow screens.
- **The brand's code look.** Both panes use the `effectscript-dark` theme (monochrome, with the
  return type, `throws` and `needs` in their signal colours), JetBrains Mono with ligatures on, word
  wrap, and editor chrome on ink. On the TypeScript side, the arguments of `Effect.fn.Return<A, E,
  R>` and `Effect.Effect<A, E, R>` get the same three signals through decorations
  (`src/lib/signals.ts`), so a name has one colour on both sides.
- **Live mapping** (`src/playground/mapping.ts`). The worker turns the mappings into links: one
  source part and every generated range it produced. An inserted chunk joins the nearest rewritten
  part on its source line, the imports at the top are the prelude, and whitespace-only insertions
  are dropped. Rewritten source parts carry a dotted underline and generated text a faint tint at
  all times. The part under the pointer or the cursor lights up on both sides, joined by a wire
  between the panes, and the status bar reads `await → yield*` with a one-line explanation of the
  common constructs. Hovering the TypeScript finds its source the same way. In copied text the
  word under the pointer maps to its twin.
- **The EffectScript leads.** When it scrolls, the TypeScript scrolls so the output of the
  EffectScript's top line is at its top. When the focused part's output is off screen, the
  TypeScript reveals it. The mapping shows while the EffectScript is the source; when you edit the
  TypeScript, the reverse compiler has no mappings, and the status bar says so.

## Consequences

- People see each construct's translation without leaving the page, which is the playground's
  teaching job.
- The grouping of inserted chunks is a heuristic: a rare insertion may join a neighbouring part on
  the same line. Its tests pin the common constructs (`effect`, `await`, `|>`, the prelude).
- The playground depends on the compiler's mapping shape; a change to `toCodeMappings` must keep the
  playground's tests green.
- The site bar's links are slashless, like the rest of the Blume site.

## Alternatives considered

- **Keep the two embedded panes and add a diff view:** a diff shows what changed, not which part
  became which, and an `await` → `yield*` rewrite reads as noise in a diff.
- **Colour every link with its own hue:** shows all mappings at once, but turns the monochrome code
  into a rainbow and spends colour on decoration (ADR-0078). One lit pair at a time keeps colour for
  A, E and R.
- **Draw the wire from token to token straight across both panes:** tried first; it struck through
  the code between them. The wire now crosses only between the panes, with dotted guides under the
  lines.
