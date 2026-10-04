# ADR-0078: Signal colours for state in a monochrome brand

- **Status:** Accepted, amended by ADR-0085 (the playground colours code by intent)
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: they found the all-monochrome docs "boring and hard to
  process" and asked for red, green and yellow for states like failed; they approved the palette
  shown in the theme brainstorm
- **Related:** `packages/effectscript/brand/README.md` (Colour), the brand book, the Blume theme
  (`docs/superpowers/specs/2026-10-05-effectscript-blume-theme-design.md`), ADR-0043

## Context

The brand accepted on 2026-10-02 is strictly zinc on black, matching effect.website. The user had
rejected an ultramarine brand colour in favour of that. In docs, playground output and test
results, though, everything looks the same: a success type, an error type, a failed test and a
pitfall are all gray or white. The reader has to parse every label to find out what can fail.

Effect's central type already has a three-part shape, `Effect<A, E, R>`: what it succeeds with,
how it can fail, and what it needs. A colour per part makes the shape visible.

## Decision

The identity stays monochrome. Four **signal colours** are added. They mean state, and only state:

| Signal | Dark      | Light     | Glyph | Means                                                       |
| ------ | --------- | --------- | ----- | ----------------------------------------------------------- |
| Pass   | `#4ADE80` | `#15803D` | ✓     | A, success types, passing tests, additions, tips            |
| Fail   | `#F87171` | `#B91C1C` | !     | E, error types and `throws`, failed tests, diagnostics      |
| Warn   | `#FACC15` | `#854D0E` | ▲     | Pitfalls, deprecations, defects, timeouts, preview badges   |
| Need   | `#60A5FA` | `#1D4ED8` | ◇     | R, services, layers and `needs`, notes                      |

The rules:

- A signal is always paired with a label or its glyph, never colour alone.
- Use a signal as text, a 2 px rule, or a 6–12% tint. No full-bleed fills, no gradients, no
  blends of two signals.
- The mark, wordmark, headlines, buttons and page grounds stay monochrome.
- Dark values sit on Ink and Tile, light values on white and zinc-100. Each pair passes WCAG AA as
  text (the lowest is Pass light on zinc-100, about 4.6:1).

## Consequences

- Docs, the playground, CLI output and the editor can show A/E/R and pass/fail at a glance.
- The brand still reads as Effect-family: colour appears only where something is being reported.
- Every signal has a glyph, so colour-blind readers and monochrome contexts (print, terminals
  without colour) lose nothing.
- The values are Tailwind's green, red, yellow and blue: 400 for dark, 700 for light (800 for
  yellow, whose 700 falls just under AA on zinc-100). That keeps them close to the colours
  terminals and editors already use for the same states.
- If signals spread into decoration, the identity drifts towards a generic colourful dev tool.
  Reviews of brand surfaces check the rules above.

## Alternatives considered

- **Stay strictly monochrome:** the user found it hard to process, and states were
  indistinguishable without reading labels.
- **A brand accent colour (e.g. the earlier ultramarine):** rejected before. It would colour the
  identity rather than the meaning, and it doesn't help tell success from failure.
- **Signals for pass and fail only:** Effect's requirements channel is the part users find hardest,
  and it deserves its own colour. Warnings (pitfalls, deprecations) are common in the docs.
- **Custom hues instead of Tailwind's:** no gain in meaning, and they would clash with terminal and
  editor conventions for the same states.
