# ADR-0082: The landing page is an exhibition: computed rooms, vgpu WebGPU scenes and generated photography

- **Status:** Accepted, partly superseded by ADR-0091 (placards, text bentos, the library's tile scenes)
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation (the old page was "meh and boring"; make it as strong as
  the brand book, very long, with bentos, big background images and WebGPU shaders from
  vgpu.sh that "make sense"; many images from GPT Image at max quality; reserve a place near the top
  for the launch film; lead with TypeScript developers new to Effect; hint at, but don't state, the
  hope that Effect adopts EffectScript; a comp-first build). The user chose the "Exhibition"
  structure fused with the "Film" one from three generated mockups. Agent rulings for the rest.
- **Related:** ADR-0054 (the site's stack), ADR-0073 (private preview and teaser), ADR-0078
  (signal colours), ADR-0079 (the site moves to Blume), ADR-0080 (ligatures on), ADR-0083
  (language extensions), ADR-0025 (generated photos as plates), spec §9

## Context

The landing page was a hero, a stats row, the ten-scenario gallery and four card sections. It was
accurate but read like documentation, and it didn't carry the positioning the user wants: Effect
is the standard library TypeScript never got, and EffectScript makes it native; a pragmatic
superset in TypeScript's own tradition that compiles to JavaScript, not a wasm blob; an intent
language with fewer tokens; built for people and their agents; extensible; versioned with Effect.

## Decision

- **Structure: an exhibition in a dark room.** Thirteen numbered rooms, each with one live scene or
  monochrome photograph, one artifact and a placard: the film, ceremony, translation (`async` ↔
  `effect`), the standard library (a bento), the gallery, intent, agents, output, strict, extensions,
  superset, lockstep, start. Three rooms open as pinned chapter scenes, like the film's titles, and
  a chapter index runs down the right edge on wide screens.
- **Every claim is computed when the site builds** (`src/data/lp.ts`): token totals and savings
  (o200k_base), the ceremony the compiler writes (counts of `yield*`, `function*`, `Effect.fn`,
  `Effect.gen`, `pipe` and imports in the samples' compiled output), the strict rules' diagnostics
  (the compiler's own messages on four mistakes) and the compiled output example. Bento snippets are
  compiled in a test. Model-quality claims stay out: the page says models haven't seen `.efx` in
  training and that it's being measured.
- **WebGPU scenes with vgpu** (`vgpu` 0.5, Vercel Labs): eight fragment shaders in `src/shaders`,
  imported as `.wgsl` modules through `@vgpu/wgsl`'s Vite plugin, each drawing what its room says:
  the hero's strands made of the samples' real compiled Effect TypeScript resolving into one beam
  (the brand's "ceremony" key visual, live, stirred by the pointer), the film room's light, the token
  count as cells, typed errors leaving on their own rail, a retry schedule, fibers forking and
  joining, Effect's A, E and R as three signal rails merging into one type, and two dials turning
  in lockstep. One device and one frame loop serve every canvas;
  only scenes near the viewport draw; reduced motion draws one still frame.
- **Progressive enhancement:** each canvas sits over a poster image and fades in after its first
  frame. Without WebGPU the posters and the page are complete.
- **Photography:** eleven 4K key visuals generated with GPT Image 2.5 (Sunburst, max quality) in
  the brand's monochrome, physical image world. They have no text and no people, and never redraw
  the mark. Masters live in `brand/key-visuals/site/`, and `brand/scripts/site.py` makes the WebP
  derivatives in `brand/web/lp/`, which the content script copies into `public/img/lp/`. The film
  room uses the film's own stills.
- **The film's room** sits right after the hero, with a "Watch the film" action in the hero. Until
  the film is rendered and hosted, it shows the poster and stills and says it premieres at launch.
  `src/data/film.ts` takes the video URL. Workers static assets cap a file at 25 MiB, so the video is
  hosted elsewhere (R2 or Stream).
- **Signals and ligatures follow ADR-0078 and ADR-0080:** red for errors and failed retries, green
  for success, blue for `needs`, amber for roadmap and alpha markers, always with a glyph or label;
  code ligatures on. The room code uses a monochrome Shiki theme (`highlight.ts`) with the Blume
  theme's signal rule for signatures (spec 2026-10-05 §5.2): the return type Pass, `throws` types
  Fail, `needs` services Need. The grammar has no scopes for these clauses yet, so a token pass
  over each signature line applies them; the Blume theme's `effectscript-dark` replaces both when
  the site moves (ADR-0079). The gallery's editor windows keep Dark+.
- **Copy:** lead with TypeScript developers new to Effect ("The standard library TypeScript never
  got. Now native."). Adoption by Effect is not mentioned. The lockstep room says "built on Effect,
  not an official Effect project" and invites feedback ("a moving target, on purpose"). Language
  extensions appear as roadmap (ADR-0083).
- **The teaser** reuses the hero, the film room and the ceremony ledger, and still links nowhere
  inside the site. The preview gate serves `/img/lp/*.webp` to everyone, because the teaser shows
  them.

## Consequences

- The page is long (about 21,000 px on a desktop) and heavier: one WebP per image at 1280 or
  2560 px, lazy-loaded below the fold, and a scenes script of about 54 KB gzipped (vgpu and the
  eight shaders) that loads after the page.
- WebGPU covers current Chrome, Edge and Safari, and Firefox on most desktops; elsewhere the posters
  show. Shader cost is bounded by the visibility check and a device-pixel-ratio cap per scene.
- `vgpu` is pre-1.0 and three months old. The scenes use a small part of it (`init`, `surface`,
  `effect`, `texture`, `sampler`, `frameLoop`), so replacing it with raw WebGPU would be a contained
  change.
- When the site moves to Blume (ADR-0079), the WGSL plugin moves from `astro.config.ts` into the
  Blume integration's Vite config, and the page's own nav gives way to the theme's header.
- Images can't drift from claims, because no claim is in an image; numbers can't drift, because
  they are computed.

## Alternatives considered

- **Polish the old page:** the user called it boring; it had no room for the film, extensions or
  the agent story.
- **"The Compile" (a pinned editor that rewrites itself as you scroll) or "The Film" alone:** the
  other two mockups. The user preferred the exhibition and asked for the film's chapters in it.
- **three.js or raw WebGPU for the scenes:** three.js is far heavier for fullscreen fragment work;
  raw WebGPU means writing the device, surface and binding code vgpu already provides. The user
  asked for vgpu.
- **Video loops instead of shaders:** heavier to download, not interactive, and not real-time.
- **Stock or AI photos with people, or images of the mark:** against the brand's image world (no
  people, the mark only from brand files). The one exception is the film's own stills in its room.
