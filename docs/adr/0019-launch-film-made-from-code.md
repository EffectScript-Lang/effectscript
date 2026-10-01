# ADR-0019: The launch film is made from code, with generated photography as plates only

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** the user (brief: an "Introducing EffectScript" film of 2–3 minutes, made from code
  with Blender, shaders and GPT Image stills); agent rulings on the details below
- **Related:** `packages/effectscript/brand/README.md`, `packages/effectscript/brand/film/TREATMENT.md`

## Context

EffectScript needs a launch film. The current trend among developers is films produced
entirely by Claude Opus writing code: rendered frames, synthesised music and ffmpeg, with no
video-generation model. A film made the same way is also a demonstration of the project's
claim: you write intent, and code produces the result. The brand has strict rules: monochrome
only, the mark is exact geometry, never the Effect logo, and EffectScript is "built on Effect",
never an official Effect product.

## Decision

- Every frame comes from code we keep in the repository: Blender Python for the 3D shots
  (`film/blender`), a Skia/NumPy compositor for type, code morphs and SkSL shaders
  (`film/compose`), a NumPy score (`film/score`), and Foley synthesised from the picture's own
  event list (`film/compose/sfx.py`). ffmpeg assembles the result. No video-generation model is used.
- GPT Image 2.5 stills are allowed only as photographic plates (people, rooms, objects), converted
  to true grayscale. They never carry the logo in a place where its geometry matters. The single
  generated still that shows the mark (`monolith-plain`) is on screen for about two seconds as
  atmosphere; every reveal and lockup draws the mark from `scripts/mark.py`.
- Code on screen is valid EffectScript, and the "before" side of each morph is the compiler's real
  output for the same source, reformatted for line length.
- The copy says "built on Effect" and shows no Effect logo.

## Consequences

- The film can be re-cut, retimed or re-rendered at another size by editing code. A full picture
  render takes about 3 minutes on an M5 Pro, the Blender shots longer.
- Generated plates are not reproducible bit for bit. The selected masters are kept in
  `film/images/select`, and the prompts in `film/images/shots.json`.
- If the language changes (syntax or compiler output), the morph snippets in
  `film/compose/scenes.py` must be updated by hand, or the film will show code that no longer
  compiles.

## Alternatives considered

- **A video-generation model:** it cannot keep the mark's geometry or code text exact, and it would
  undercut the "made from code" story.
- **Hand animation in After Effects or Resolve:** not reproducible from the repository and not
  editable by agents.
- **Only abstract code-drawn visuals, no photography:** technically pure, but the emotional half
  of the story (the 3 AM page, the dawn) needs people and places.
