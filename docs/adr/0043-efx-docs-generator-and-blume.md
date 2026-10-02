# ADR-0043: `efx docs` is our own syntactic generator that writes Markdown for Blume

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** the user, in conversation (design for living docs)
- **Related:** docs spec `docs/superpowers/specs/2026-10-03-effectscript-docs-design.md`, spec §5,
  §7.1, §9.3, ADR-0017, ADR-0042

## Context

Projects built with the `efx` CLI need API docs that are generated from source and readable by
both people and agents. Two pieces are needed: an **extractor** that turns source into pages, and
a **site** that serves those pages.

- **Extractor.** Tools like ts-docs-gen and TypeDoc read a TypeScript program through the compiler
  API. Run on `.efx`, they would only see the compiled TypeScript. There, `throws`/`needs` has
  become `Effect.fn.Return<A, E, R>` (or disappeared into inference), and `schema`/`error`/`service`
  have become class ceremony.
- **Site.** Blume (useblume.dev, built on Astro) turns a `docs/` folder of Markdown/MDX into a site.
  It also produces `llms.txt`/`llms-full.txt`, a Markdown copy of every page, a JSON API and an MCP
  server. Those are the agent-facing outputs the docs exist for.

## Decision

- **We write the extractor ourselves, on the EffectScript parser.** `efx docs` parses `.efx` and
  `.ts` sources and builds an in-memory doc model of each module's exported declarations. The model
  holds:
  - the kind, name and source location;
  - the signature exactly as written, split into A / E / R from the `throws`/`needs` clauses;
  - parameters, linked to their schemas;
  - the summary, the body and the examples.

  It is **syntactic** (ADR-0017): no type checker, and nothing inferred. A part of a signature that
  isn't written down is shown as not stated.
- **Its output is plain Markdown with Blume frontmatter.** It writes one page per module under
  `docs/api/`, plus an index.
  - Pages put the signature first: summary, signature, then a table of parameters, result, errors
    and requirements, built from each linked definition's own summary (ADR-0042). The body and
    examples come after.
  - `efx docs` owns `docs/api/` and regenerates it completely.
- **Blume is the default site for CLI projects, in `docs/`.** `efx init` writes
  `docs/blume.config.ts` (content root `.`) and the `docs`/`docs:dev`/`docs:build` scripts, which run
  `efx docs` first.
  - Blume always builds into `dist/` next to its config. At the package root, that would overwrite
    a library's own `dist/`.
  - The `effectscript/blume` integration registers the EffectScript grammars, so `efx` code blocks
    are highlighted.
  - The only coupling is files: frontmatter plus Markdown.
  - Our own site, effectscript.dev, stays on Starlight (§9.3).
- **`efx docs --check` runs only the doc diagnostics**, without writing anything, for CI.
- **One doc-comment parser.** The `command` transform's regex-based JSDoc reading moves to this
  shared parser, so CLI help and API pages read comments the same way.

## Consequences

- Pages show EffectScript signatures (`throws`/`needs`) instead of compiled TypeScript, and they're
  compact.
- `.ts` modules get pages from the same pipeline, but only with the types they write out
  explicitly.
- Blume is young, so its config and frontmatter may change. Our output is generic Markdown, so
  moving to another Markdown-based site costs only the frontmatter mapping and the `efx init`
  scaffold.
- We don't emit our own `llms.txt` or JSON. Blume provides both from the pages.

## Alternatives considered

- **ts-docs-gen, TypeDoc or API Extractor on the compiled TypeScript:** they lose `throws`/`needs`
  and the `schema`/`error`/`service` forms, and they need a full TypeScript program for every run.
- **The type checker, to infer A/E/R that aren't written:** a heavier and slower dependency. The
  compiler is syntactic by design (ADR-0017). Inference can come later through the language
  service.
- **A Blume custom content source instead of files:** its interface is barely documented, it ties
  us to Blume internals, and generated files can be inspected and diffed.
- **Blume at the package root:** simpler paths, but `blume build` would overwrite the package's
  `dist/` (verified with Blume 2.1.0, which has no output-directory option).
- **Starlight for user projects:** that's what our own site uses, but the user chose Blume for its
  agent outputs (llms.txt, Markdown copies, MCP, evals).
- **Emitting a versioned JSON doc model, like Elixir's EEP 48:** Blume already serves the pages as
  JSON and Markdown. A public model is a contract we don't need yet.
