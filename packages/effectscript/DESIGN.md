---
name: EffectScript
description: The landing page's exhibition system; dark rooms on Effect's zinc and ink, where light is the only colour.
colors:
  ink: "#09090b"
  well: "#0c0c0e"
  vitrine: "#0f0f11"
  tile: "#18181a"
  line: "#27272a"
  line-strong: "#3f3f46"
  muted: "#8e8e96"
  dim: "#9d9da5"
  subtle: "#a1a1aa"
  placard-gray: "#b4b4bb"
  lede-gray: "#c9cacf"
  mist: "#e4e4e7"
  white: "#ffffff"
  signal-pass: "#4ade80"
  signal-fail: "#f87171"
  signal-warn: "#facc15"
  signal-need: "#60a5fa"
typography:
  display:
    fontFamily: "Inter Display, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 4.75vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter Display, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.1rem, 4vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter Display, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.012em"
  lede:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 1.25vw, 1.65rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(13px, 0.92vw, 18px)"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.08em"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
    fontFeature: "\"calt\" 1, \"liga\" 1"
rounded:
  xs: "4px"
  sm: "7px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  frame: "18px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4.4vw, 90px)"
  wrap: "2240px"
  room-block: "clamp(88px, 10vw, 168px)"
  artifact-gap: "56px"
  grid-gap: "16px"
  card-pad: "26px"
components:
  button-solid:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "clamp(48px, 2.8vw, 58px)"
    padding: "0 clamp(24px, 1.4vw, 30px)"
  button-solid-hover:
    backgroundColor: "{colors.mist}"
  button-ghost:
    backgroundColor: "rgb(9 9 11 / 0.72)"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    height: "clamp(48px, 2.8vw, 58px)"
    padding: "0 clamp(24px, 1.4vw, 30px)"
  button-ghost-hover:
    backgroundColor: "rgb(24 24 26 / 0.8)"
  button-link:
    textColor: "{colors.subtle}"
    height: "48px"
    padding: "0 4px"
  button-link-hover:
    textColor: "{colors.white}"
  placard:
    backgroundColor: "rgb(9 9 11 / 0.6)"
    textColor: "{colors.placard-gray}"
    typography: "{typography.label}"
    padding: "clamp(14px, 1vw, 20px) clamp(16px, 1.4vw, 26px)"
  tile:
    backgroundColor: "{colors.vitrine}"
    rounded: "{rounded.frame}"
    padding: "24px"
  code-well:
    backgroundColor: "{colors.well}"
    textColor: "#d4d4d8"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "18px 20px"
  chip:
    textColor: "{colors.mist}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  nav-link:
    textColor: "{colors.placard-gray}"
  nav-link-hover:
    textColor: "{colors.white}"
---

# Design System: EffectScript

## Overview

**Creative North Star: "The Exhibition in a Dark Room"**

The landing page (`site/src/pages/index.astro`) and the public teaser (`soon.astro`) share one system. Each idea gets its own full-width room on ink. A room holds one source of light: a live WebGPU scene drawn over its poster, or one of the brand's monochrome monolith photographs under a gradient scrim. It also holds one artifact (a table, a ledger, code, a diagnostic). One white line runs the whole landing page, drawing itself as the reader scrolls, and becomes each room's diagram (ADR-0091). Light is the only colour. White does the emphasis, the zinc grays set the hierarchy, and hue appears only as a signal for state.

The system inherits the binding brand (`brand/README.md`): Effect's zinc on near-black, Inter Display Bold headlines, Inter body, JetBrains Mono for code and labels, and the ƒx lockup drawn only from the brand files, white on black. The page is dense with real numbers and real code, and every count is computed at build time. Rooms are separated by hairlines, not cards or colour bands. The page is long and paced like a film. Three rooms open as pinned chapter scenes, and bento grids act as intermissions between them.

When the site moves to Blume (ADR-0079), the Blume theme's `effectscript-dark` code theme replaces this page's monochrome Shiki theme (`site/src/lib/highlight.ts`), and the theme's header replaces the page's own nav. This document records the system as built. It does not describe Blume.

**Key Characteristics:**

- Ink rooms divided by 1px hairlines, each lit by one live scene or one monochrome photograph.
- A monochrome palette: white for emphasis, zinc grays for hierarchy, four signal colours used for state only.
- Inter Display Bold headlines in tight tracking, with the effect.website white-to-gray fade.
- JetBrains Mono for code (ligatures on), placards, nav, buttons and numbers' captions.
- Glass only where text sits over light: the sticky nav, the hero's placard, cards inside photographed rooms.
- Motion is an entrance, never a requirement: content is visible by default, and reduced motion draws one still frame.

## Colors

The palette is zinc on near-black. White carries the brand, and nothing on the page uses an accent hue.

### Primary

- **Exhibition White** (white): headlines, keywords in code, the solid button, focus rings, selection, lit token cells, toggled-on states. White is the page's only accent.

### Neutral

- **Ink** (ink): the ground of every room, the scrims over photographs, and the halo behind hero copy.
- **Well** (well): the background of code blocks; one step above ink so code reads as recessed.
- **Vitrine** (vitrine): bento tiles and the cells legend. Translucent versions of it (0.85 to 0.92 alpha) back the cards placed over photographs.
- **Tile** (tile): the stage behind a tile's scene; the brand's tile and card colour.
- **Hairline** (line): room dividers, card borders, table rules, the chapter-index track.
- **Strong Hairline** (line-strong): placard frames, ghost-button borders, chips, table heads, hover borders.
- **Muted Label Gray** (muted): labels, captions, comments in code, and the far end of the effect.website fade. The brand README lists Muted as `#71717A`. The build lifts it to this value so that 11 to 13px mono captions stay legible on ink, and the build value is the one that applies.
- **Dim Gray** (dim): the gray third line of a display headline ("Now native.").
- **Subtle Gray** (subtle): body copy, secondary text, strings in code, the text-link button.
- **Placard Gray** (placard-gray): placard and nav text.
- **Lede Gray** (lede-gray): the lede paragraph under each room's headline.
- **Mist** (mist): solid-button hover, chip text, numerics and type names in code.

### Signal (state only, ADR-0078)

- **Pass** (signal-pass) with ✓: success values and passing attempts.
- **Fail** (signal-fail) with !: error types, failed attempts, error diagnostics.
- **Warn** (signal-warn) with ▲: roadmap and alpha markers, warning diagnostics.
- **Need** (signal-need) with ◇: services and `needs`.

In code, a signature carries the same three: the return type in Pass, the types after `throws` in Fail and the services after `needs` in Need; everything else stays in the monochrome code theme.

### Named Rules

**The Light Is the Only Colour Rule.** Grounds, headlines, buttons, the mark and the photographs stay monochrome, and the shaders draw white light on ink. A scene uses a signal only where it shows state: the typed-error rails, the retry attempts and the A/E/R channels, as thin rails and points of light, each with a glyph-and-label key beside it. Merged channels turn white, never a blend of two signals.

**The Signal Needs a Name Rule.** A signal colour always comes with its glyph or a label. It appears as text, a 1px `currentColor` border, a 2px inset rule, or a 8 to 10% tint, and never as a fill, a gradient or decoration.

## Typography

**Display Font:** Inter Display (with Inter, system sans)
**Body Font:** Inter (with system sans)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Menlo)

**Character:** A heavy, tightly tracked display face over quiet Inter body, framed by monospaced labels that read like comments in a source file. The mono face is used for everything functional (buttons, nav, placards, captions, numbers' units). The sans faces are used for argument.

### Hierarchy

- **Display** (700, `clamp(2.6rem, 4.75vw, 6rem)`, 0.98): the hero headline. Pinned chapter titles use the same style at up to `clamp(2.5rem, 6.4vw, 6rem)`, and the closing headline at up to `clamp(2.8rem, 7vw, 6rem)`. Balanced wrapping.
- **Headline** (700, `clamp(2.1rem, 4vw, 4.25rem)`, 1.02): each room's h2, in a head up to 46rem wide.
- **Title** (Inter Display 600, 1.25rem, 1.25): bento-tile and card heads.
- **Big Number** (Inter Display 700, 2 to 4.8rem, tabular figures, -0.03 to -0.04em): computed counts in the ledger, legend, facts and dial.
- **Lede** (400, `clamp(1.05rem, 1.25vw, 1.65rem)`, 1.55, max 62ch): the paragraph under a room headline.
- **Body** (400, 1rem, 1.65, max 66ch, pretty wrapping): secondary prose in subtle gray.
- **Label** (JetBrains Mono 500, `clamp(13px, 0.92vw, 18px)`, 0.08em, uppercase): placards. Nav, table heads, captions and legend keys use the same voice at 11.5 to 15px with 0.04 to 0.12em tracking.
- **Code** (JetBrains Mono 400, 13px, 1.7; 13 to 15.5px in large wells): inline `code` is set at 0.9em in white.

### Named Rules

**The Fade Ends on the Last Word Rule.** A display headline's white lines may carry the effect.website fade: solid white to 70%, then fading to a light gray (`#96969c`) on the final word. A dimmed closing line follows in Dim Gray. The fade is used only on display headlines.

**The Ligatures for Code Rule.** Code is set with JetBrains Mono's contextual and common ligatures on (ADR-0080), so `|>` draws as a play triangle. Any rule that sets code with the `font` shorthand turns ligatures back on. Tracked uppercase labels keep their letter-spacing, which stops ligatures from forming.

## Layout

The page is a single column of full-bleed rooms. Content sits in a wrap up to 2240px wide with a fluid gutter (`clamp(16px, 4.4vw, 90px)`). Each room has generous vertical padding (`clamp(88px, 10vw, 168px)`) and ends at a 1px hairline. Room heads are about 46rem wide and align left by default. In a photographed room whose light falls on the left, the head aligns right, opposite the light. The artifact sits 48 to 64px below the head.

- **Hero:** at least `max(720px, 100svh - nav)`. The live scene fills the hero, with a radial ink scrim behind the copy. The line leaves the hero's beam and sweeps down to its spine.
- **Chapters:** above 900px, a chapter is 175vh tall and holds a sticky 100svh stage. The chapter's own scroll drives a push-in on its photograph and a rise-and-unblur on its title. A vertical chapter index (mono, rotated, with a 1px progress track) shows on the right edge from 1280px.
- **Grids:** a 12-column bento with a 16px gap (tiles span 3 to 7 columns at 1100px or wider, and 6 at 760px or wider). Ruled shelves of 2 to 4 columns divided by hairlines rather than gaps, and 2 to 3 column card grids with a 16px gap.
- **Breakpoints:** 600, 760, 900, 1000, 1100 and 1280px. At 760px and below, nav links hide, the hero scene drops into a 42svh band below the copy, and photographed rooms get a heavier even scrim (0.8 to 0.94 alpha) so text keeps its contrast.

## Elevation & Depth

Depth comes from light and scrims rather than lifted surfaces. Rooms are flat ink. Photographs and scenes sit behind gradient scrims of ink that keep the light where there is no text. Cards placed over light use translucent vitrine and a backdrop blur. Real drop shadows appear only on the objects that hold the film and the terminal: deep, soft and black, as if lit from above in a dark room.

### Shadow Vocabulary

- **Screen** (`box-shadow: 0 40px 120px -30px rgb(0 0 0 / 0.9), 0 0 0 1px rgb(255 255 255 / 0.03)`): the film's screen.
- **Terminal** (`box-shadow: 0 30px 90px -30px rgb(0 0 0 / 0.9)`): the closing install terminal.
- **Play Disc** (`box-shadow: 0 18px 50px -10px rgb(0 0 0 / 0.8)`): the white play disc.
- **Ink Halo** (`text-shadow: 0 0 3px #09090b, 0 0 10px #09090b, 0 0 22px #09090b`): hero copy that crosses the live strands.
- **Signal Rule** (`box-shadow: inset 2px 0 0 <signal>`): the left edge of an error or warning diagnostic.

### Named Rules

**The Scrim, Not the Box Rule.** When text sits over a photograph or a scene, darken the light with an ink gradient (or a halo on the hero) instead of placing the text in a solid box.

## Shapes

Rooms, placards, tables and shelves are square-cornered and ruled by hairlines. Corners round only on objects that can be held: 7px buttons, 10px code wells, 14px screens, stages and terminals, 16px panels, 18px tiles and cards, and full pills for chips and switches. The play disc and the lockstep dial are circles. Dashed borders mean "not yet": unlit language-extension keywords, the off state of extension cards, and the divider between stacked diagnostics.

## Components

### Buttons

Mono, quiet and exact.

- **Shape:** gently rounded (7px), 48 to 58px tall, JetBrains Mono 500.
- **Solid:** white with ink text, turning Mist on hover. Use one per group, for the main action.
- **Ghost:** translucent ink with a Strong Hairline border, turning to a zinc-400 border and a tile tint on hover.
- **Text link:** Subtle Gray text with an inline SVG icon, turning white on hover.
- **Small:** 38 to 48px, used in the nav.
- **Press / Focus:** press nudges the button 1px down. Focus shows a 2px white outline at a 3px offset with a 6px radius, site-wide.

### The line

The landing page's signature (ADR-0091): one white 1.6px stroke with a faint 9px glow, drawn as the reader scrolls, with a glowing pen at its tip. It runs down a spine in the left gutter and, in each room, swings out into that room's diagram before it returns: a frame around the film, a tangle that loosens into a straight line, rungs between translations, an error rail with retries, fibers and layers, stations over the gallery's tabs, rings and leaders on annotated code, token tapes, the compile pipeline, squiggles under diagnostics, a ring of extension arcs, a belt around the lockstep dial, and an underline under the last words, where it ends. Branches take a signal colour only when they mean state (an error rail, a service layer), always with a glyph or label. Its diagrams sit in stage rows, so it never crosses copy; on a phone it runs straight down the spine. With reduced motion it is drawn whole.

### Placard

The teaser's threshold band: a full-width frame with a Strong Hairline border and translucent ink background, holding a label and an optional note. The landing page no longer numbers its rooms (ADR-0091); the chapter index at the right edge shows the room's name only.

### Chips

- **Style:** a 1px border in Strong Hairline or `currentColor`, mono 11.5 to 13px, pill radius (6px for keyword chips).
- **State:** language-extension keywords are dashed and dim when unlit, and solid white with ink text when lit. A Warn pill gets an 8% tint.

### Cards / Containers

- **Corner Style:** 14 to 18px (see Shapes).
- **Background:** Vitrine, or translucent vitrine with a 10px blur over photographs.
- **Shadow Strategy:** none, except the screen and terminal (see Elevation & Depth).
- **Border:** a 1px hairline, turning Strong Hairline on hover for tiles.
- **Internal Padding:** 24 to 26px.

### Navigation

A sticky bar of 72% ink with a 14px blur and saturation, ruled by a hairline. It holds the white lockup at 30 to 46px tall, uppercase mono links in Placard Gray that turn white on hover, and a small solid button. Links hide at 760px and below. The teaser keeps only the lockup and one solid button.

### Code Well

Code on Well with a hairline border and 10px radius, set in the monochrome Shiki theme: keywords white, names near-white, strings and punctuation in zinc grays, comments muted italic. Inside tiles, diagnostics and the terminal, the well loses its box and keeps only a top rule. The gallery's editor windows keep VS Code Dark+. Blume's `effectscript-dark` replaces both themes after the move (ADR-0079).

### Scene

A WebGPU canvas over its poster image. The canvas fades in over 1.4s after its first frame. Without WebGPU, the poster is the complete page. The pointer stirs the hero tangle. Only scenes near the viewport draw, and each has its own device-pixel-ratio cap.

### Diagnostic

The compiler's real message on a mistake. A ruled block in mono, with a severity tag (an uppercase 11px label in a 4px-radius border, tinted with its signal), a bold rule code, a muted hint, and a 2px inset signal rule on the left.

## Do's and Don'ts

### Do:

- **Do** give each room one source of light (a live scene or a monochrome photograph), one artifact and a numbered placard, and close it with a 1px Hairline.
- **Do** keep every number and diagnostic computed at build time, and set big numbers in Inter Display 700 with tabular figures.
- **Do** pair every signal colour with its glyph (✓ ! ▲ ◇) or a label, as text, a border, a 2px rule or a tint of 10% or less.
- **Do** darken photographs with ink gradient scrims, heavier on phones, so text over them keeps AA contrast.
- **Do** keep content visible without JavaScript or motion. Reveals add an entrance (`cubic-bezier(0.16, 1, 0.3, 1)`, about 1.1s), and reduced motion draws one still frame.
- **Do** draw icons as inline SVG in `currentColor`.

### Don't:

- **Don't** introduce an accent hue, a coloured ground, or a coloured gradient. Light is the only colour.
- **Don't** use a signal colour on the mark, headlines, buttons or page grounds, or without its glyph or label.
- **Don't** redraw, recolour or tint the ƒx mark. Use the lockup from the brand files, white on black.
- **Don't** put photographs with people, the mark, or text into a room's image.
- **Don't** use drop shadows on ordinary cards. Shadows are reserved for the screen, the terminal and the play disc.
- **Don't** turn code ligatures off on this page.
