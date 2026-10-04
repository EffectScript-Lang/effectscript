# ADR-0079: effectscript.dev moves to Blume, with a public EffectScript theme

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: they found the Starlight docs "so ugly", asked for "full
  Blume" with a new theme in the EffectScript brand, chose to ship the theme to `efx init` projects
  too, and left the visual direction to the assistant ("Signature")
- **Related:** spec `docs/superpowers/specs/2026-10-05-effectscript-blume-theme-design.md`;
  ADR-0043 (partly superseded), ADR-0044, ADR-0054, ADR-0073, ADR-0078

## Context

ADR-0043 made Blume the docs site for projects built with `efx`, but kept effectscript.dev on
Starlight. The site's docs looked generic, and the user disliked them. Blume 2.1.1 can host custom
Astro pages (our landing page, the playground and the teaser), mount the docs under `/docs`, build
statically, and generate the agent outputs (`llms.txt`, Markdown copies, a JSON API). Its theming is
config tokens, `theme.css` and replaceable layout components. There are no theme packages.

## Decision

- **The whole site is one Blume project** in `packages/effectscript/site`. Docs live at `/docs`
  (`basePath`), and the landing page, the playground and `/soon` are Blume custom pages. Starlight and
  `astro.config.ts` are removed. Blume builds into `site/dist`, where site-edge already reads.
- **The theme is public**, in `effectscript/blume`: the `theme` config, the `effectscript()`
  integration (grammars, syntax themes, the facts rehype plugin), the `components` module and
  `theme.css`. `efx init` wires all three, so EffectScript libraries get the same docs as the
  language.
- **Direction: Signature.** The page system is built on Effect's `A / E / R` shape. Facts tables from
  `efx docs` render as signal-coded Success / Error / Needs tiles (ADR-0078), and the syntax theme is
  monochrome except for return types, `throws` and `needs` clauses.
- **The `efx docs` Markdown doesn't change.** The tiles come from a rehype plugin, so the Markdown
  copies and `llms.txt` that agents read stay plain.
- **Blume is pinned to exactly 2.1.1**, in the site and the `efx init` scaffold.

## Consequences

- One toolchain for the site, and our own site is the reference user of the theme we ship.
- Blume generates `llms.txt`, the Markdown copies and the JSON API, so the site's hand-made llms
  files go away.
- We now depend on Blume internals (layout slot props) for six components. Blume is three months old
  with one maintainer, so upgrades need the build test and a visual check. If Blume stalls, the
  content is still plain Markdown, and `blume eject` turns the site into a plain Astro app we own.
- Hosted features (MCP, server search) need a server build. They wait until the site is public.
- If Blume can't compile components from an npm package, `efx init` copies them into the project
  instead, which costs a sync check.

## Alternatives considered

- **Keep Starlight and restyle it:** the user rejected Starlight's look. Its component overrides
  are as much work as Blume's, without the agent outputs.
- **Blume for `/docs` only, with the landing page and playground on plain Astro:** two builds and two
  sets of chrome to keep identical, which is not what the user asked for.
- **Eject Blume into a plain Astro app now:** total control, but we lose Blume upgrades and its agent
  outputs, the reasons for choosing it in ADR-0043.
- **A site-only theme:** less to keep stable, but EffectScript libraries would look generic next to
  the language docs. The user chose the public theme.
- **Signature tiles from new frontmatter in `efx docs` output:** more structure, but it changes what
  agents read, and module pages hold many declarations, so a per-page signature doesn't fit.
