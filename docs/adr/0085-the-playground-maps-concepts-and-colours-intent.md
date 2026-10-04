# ADR-0085: The playground maps whole concepts, colours code by intent, and previews decided syntax

- **Status:** Accepted, partly superseded by ADR-0086 (the extension examples)
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation, three asks: "the mapping shall be more of a block … its
  like a concept to another concept. so we shall embed/highlight the whole phrase for each"; the
  playground's code colour is "too boring … color everything more so it has more meaning/intent
  … vercel vibes may be ok too as inspiration"; "add more updated samples to the playground:
  brand, observability, extensions: bend2 law, foldkit, alchemy v2". Agent rulings for the rest.
- **Related:** ADR-0084 (partly superseded: its token-level mapping, wire and monochrome code),
  ADR-0078 (signal colours; this is a playground exception to "colour only for state"),
  ADR-0075 (`law`), ADR-0077 (`brand`, `where`), ADR-0083 (extensions), spec §9.2

## Context

ADR-0084 linked each source part to what it produced, token by token: hovering `await` lit
`yield*`. That shows the rewrite but not the idea. A reader learns `await Users.find(id)` becomes
`yield* Users.find(id)`, and that a signature line becomes an `Effect.fn` header, a phrase at a
time. The code itself was monochrome, as the brand's code is everywhere else, with only Effect's
A, E and R in signal colours. The user found it hard to read meaning from.

The examples were the basics and the gallery. They didn't show observability, brands with checks
or the language extensions (ADR-0083), and two of the constructs the user asked for, `brand … where`
(ADR-0077) and `law` (ADR-0075), are decided but not built.

## Decision

### Concepts, not tokens

- **A concept** is a phrase in the EffectScript and every range of TypeScript it became, found from
  the syntax tree (`toConcepts` in `src/playground/mapping.ts`): an `await` or `await [...]`, a
  `throw`, an effect function's or `main`'s header, an `error`, `schema` or `service` declaration,
  a service method (its signature and its accessor), a field, a `|>` step, a `console` call, a
  `match` header and each of its arms, and any other statement. Its output is the union of the
  compiler's mappings inside it, with pieces that only whitespace separates merged into one range.
- **The innermost concept wins** under the pointer or cursor, on either side. It lights as a block
  on both sides, with a bar in the gutter, and the token under the pointer stands out inside it.
- **A band joins the two blocks** across a 44 px channel between the panes, so it never covers
  code or line numbers. The status bar reads the phrase, its output and a one-line note for each
  kind. Comments don't map. The token links stay underneath, for the underline on rewritten parts
  and for scrolling.

### Colour by intent

The playground's own palette (`src/playground/intent.ts`), one reading for both panes, so a thing
has the same colour as EffectScript and as Effect TypeScript:

| Intent                | Colour             | What                                                                 |
| --------------------- | ------------------ | -------------------------------------------------------------------- |
| Effect                | violet `#C084FC`   | `effect`, `await`, `main`, `\|>`, combinators, `Effect.*`, `yield*`  |
| Structure             | pink `#F472B6`     | declarations and JavaScript keywords                                 |
| A, success data       | Pass `#4ADE80` ✓   | declared schemas and brands, the return type                         |
| E, errors             | Fail `#F87171` !   | declared errors, `throws`                                            |
| R, services           | Need `#60A5FA` ◇   | declared services and configs, `needs`, `Context.*`                  |
| Types                 | cyan `#67E8F9`     | primitives, type names in type positions, `Schema.*`                 |
| Literals              | orange `#FDBA74`   | strings, numbers, `true`, `null`                                     |
| Calls, comments       | white, muted gray  | the rest stays near-white                                            |

- **Names are read from both texts** (`namesOf`): `error X` or a `Schema.TaggedError` class is E,
  `schema X`, `brand X`, an ADT variant or a `Schema.Class` is A, `service X`, `config X` or a
  `Context` class is R. A declared name keeps its channel's colour wherever it is used.
- **The A, E and R signals win** over everything else, and the toolbar's legend pairs each with its
  glyph (ADR-0078's rule that a signal never stands on colour alone).
- **Only the playground.** The landing page, the docs and the editor theme keep the brand's
  monochrome code with signals (ADR-0078, ADR-0079). Structure moved from `#FF6B9A` to Tailwind's
  pink-400 during review: the first pink sat about 20° from Fail red, and `error UserNotFound` read
  as one colour.

### Examples, including decided syntax

- **Grouped:** the language (with brands and checks, and observability through
  `// @efx observability otlp`), extensions (roadmap), and the gallery.
- **Extensions show what works today.** Foldkit's counter and an Alchemy v2 stack are written in
  today's EffectScript, against those libraries' real APIs. ADR-0083 leaves the syntax of `app` and
  `infra` open, so the playground doesn't invent it; their comments say an extension is on the
  roadmap.
- **A proposed example** shows syntax an ADR has decided but the compiler doesn't accept yet:
  `brand … where` (ADR-0077) and `law` (ADR-0075, for Bend2). The TypeScript pane shows the
  lowering that ADR specifies, labelled with the ADR and its status (▲, Warn: a preview marker),
  with no problems and no mapping. The first edit hands it back to the compiler, which reports the
  syntax it doesn't know.
- **Tests keep them honest:** every live example compiles without a problem; a proposed one must
  still fail to parse, so the test fails, and the example becomes live, when the syntax is built;
  the law's lowering begins with the compiler's own output for the rest of its file.

## Consequences

- A reader sees each construct's translation as a whole idea, and a match arm, a pipeline step or a
  service method maps to all of its output.
- The code is colourful, closer to Vercel's code style than to the brand's. The playground looks
  different from the docs' code on purpose: it is where people learn what each part means.
- The colours come from a lexer and the declared names, not from types: a local variable holding
  an error isn't red. A type-aware pass would need the checker in the worker.
- Building the Foldkit example found a compiler bug: a `match` arm whose result is an object
  literal lost its parentheses (`() => { model }` is a block). It's fixed, with a test, in this
  change.
- A proposed example's lowering is hand-written from its ADR, so it can drift from the eventual
  compiler. The parse test makes the switch visible.

## Alternatives considered

- **Keep token links and only widen the highlight:** a token can't say that a signature became a
  header; the tree knows where a phrase starts and ends.
- **Colour the concept blocks, one hue per kind:** makes every hover a rainbow and competes with
  the intent colours. Blocks stay white tints.
- **Colour by TextMate scopes (a richer Shiki theme):** the scopes say syntax (keyword, string,
  entity), not intent: `await` and `return` are both keywords, and an error class and a service are
  both entity names.
- **Draw the band over the TypeScript gutter (ADR-0084's position):** it covered the line numbers.
- **Invent `app` and `infra` syntax for the examples:** that decision belongs to a later ADR
  (ADR-0083); showing made-up syntax on the site would read as a commitment.
- **Hide decided-but-unbuilt syntax until it ships:** the user asked for it, and the lowering is
  already specified, so the preview is accurate as far as it goes.
