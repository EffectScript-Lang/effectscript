# ADR-0091: The landing page is drawn by one line, with a headline and one sentence per room

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation. They asked for the page to feel "more like it was from
  awwwards, text easier to read. or less text, more original SVGs … some parts is pure text and
  boring … the whole site to feel all unexpected design so people say wow". From three proposed
  directions (one line end to end, diagrams as exhibits, type as image) they chose "One line, end
  to end". Agent rulings for the rest.
- **Related:** ADR-0082 (partly superseded: numbered placards, the text bentos, the library's three
  tile scenes), ADR-0078 (signals), ADR-0083 (extensions), spec §9.2

## Context

The exhibition (ADR-0082) gave each idea a room. By word count, most rooms closed in a grid of
same-size cards, each a heading, a paragraph and code:

- the standard library: 489 words;
- the gallery: 382;
- agents, output and strict: about 220 each;
- the page as a whole: four SVGs.

Every room opened with a "07 / AGENTS" placard. The brand's own motif, from the launch film and the
hero's shader, is one line given back: ceremony resolving into a single beam. The page used it
once, in the hero.

## Decision

- **One line runs the whole page.** It is a white stroke with a faint glow, drawn as the reader
  scrolls and kept level with a point 62% down the viewport. A glowing pen marks its tip.
- **Where it runs:** it leaves the hero's beam where the shader's beam leaves the screen, then runs
  down a spine in the left gutter.
- **What it draws in each room:** it swings out to become the room's diagram, then returns to the
  spine.
  - **Film:** it frames the film.
  - **Ceremony:** it tangles, with the ceremony's words, and loosens into a straight line labelled
    EffectScript.
  - **Translation:** it joins each async form to its EffectScript with a rung.
  - **Library:** it draws the error rail, three retries (two fail, the third passes), forking
    fibers and service layers.
  - **Gallery:** it puts stations over the scenario tabs and frames the open sample.
  - **Intent:** it rings each annotated token and leads to its note.
  - **Agents:** it draws Effect TypeScript's token tape and EffectScript's shorter one.
  - **Output:** it runs the pipeline from `.efx` to `.ts` to `.js`, with "no wasm" as a dead end.
  - **Strict:** it squiggles under each line the compiler flags.
  - **Extensions:** it circles a ring of arcs that light when an extension is switched on.
  - **Lockstep:** it belts the dial.
  - **The end:** it underlines "None of the ceremony." and ends there.
- **How it's built:** `src/scenes/line.ts` builds each room's part from the places its markup
  marks (stage rows, tabs, code lines), so the line follows the layout at every width. A room
  redraws when its size changes or its reveals land.
- **Copy:**
  - **Rooms:** each room is a headline and one sentence. The placards and the hero's eyebrow are
    gone; the chapter index shows names only.
  - **Library:** the tiles are code only, and Effect's other libraries are one-word chips linking to
    their reference pages.
  - **Agents:** the facts are four short lines instead of cards.
  - **Superset:** the facts sit on the dark side of the photograph, where they read.
  - **Claims:** every computed number and real diagnostic stays.
- **Readability:** ledes are larger and brighter (`#e4e4e7`, 34ch).
- **Scenes:** the line now draws the library's ideas, so its three small WebGPU tile scenes
  (errors, retry, fibers) and their shaders are removed. The hero, film, tokens, channels and
  lockstep scenes stay.
- **Fallbacks:**
  - **Phones:** the stage rows fold away and the line runs straight down the spine.
  - **Reduced motion:** it is drawn whole.
  - **Without script:** the page is complete without it.

## Consequences

- The page has one signature, the brand's own, carried end to end, and far less to read: the
  library room went from 489 words to 233, agents from 224 to about 100.
- **Ongoing cost:** each room's drawing is code. A layout change can move what the line draws
  around, so the room-by-room screenshots are part of reviewing a change to the page.
- **Performance:** the line costs one SVG per room and a scroll handler that updates only
  dash offsets and the pen. Path sampling runs when a room's layout changes, not on scroll.
- **Signals:** colour stays meaningful. The line is white, and its branches take a signal colour
  only when they mean state: a failure, a pass, a service layer, a warning.
- The DESIGN.md "Placard" component now describes the teaser only, and a "Line" component
  documents the motif.

## Alternatives considered

- **Diagrams as exhibits** (a technical drawing per room, without a connecting line): legible, but
  a collection of moments rather than one.
- **Type as image** (huge morphing type, horizontal pinned sections): striking, but it carries less
  information and leans on heavy motion.
- **Keep the placards and cards, with less copy:** still the template the user called boring.
- **A single SVG over the whole page:** one path is the purest form, but it means repainting a
  20,000px layer on every scroll, and one bad measurement breaks the whole line. One part per room
  keeps both local.
