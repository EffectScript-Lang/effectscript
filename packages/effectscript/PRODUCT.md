# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **TypeScript developers new to Effect (lead audience).** They want typed errors, services,
   retries and tracing, and bounced off `Effect.gen`, `yield*` and the class ceremony. Their job:
   get Effect's guarantees while writing the `async`/`await`/`throw`/`try` they already know.
2. **Effect users.** Already sold on Effect; they want code that is shorter to write, read and
   review, with no change in semantics.
3. **Agent-first builders.** Most of their code is written by coding agents. They often don't
   read it, but still need strong abstractions underneath, and clear code on the occasions they
   (or their agents) do read it.

## Product Purpose

EffectScript is TypeScript with Effect built into the language: Effect as the standard library
TypeScript never got, made native. It is a strict superset of TypeScript (`.efx`), compiled in
place to idiomatic Effect TypeScript and then to plain JavaScript. Success: people who would never
have adopted Effect write Effect code from day one, and Effect users write and read it with far
fewer tokens.

## Positioning

- **The pragmatic language.** Same philosophy as TypeScript: a superset, not a new language.
  Every `.ts` file is already valid `.efx`; compile to JS that runs in the browser, Node, Bun and
  Workers. No new runtime and no wasm blob.
- **An intent language.** More of the developer's (or agent's) intent, less ceremony: `effect`,
  `await`, `throw`, `throws`, `needs`, `schema`, `error`, `service`, `layer`, `match`, `|>`, and
  Effect's libraries as declarations (`test`, `api`, `command`, `config`, `rpc`, `tool`, ...).
- **No mental translation.** Newcomers write `await`; the compiler writes `yield*`.
- **Fewer tokens, same intent.** Measured with `o200k_base` on the site's samples at build time.
  The hypothesis that models write better Effect through `.efx` is not yet proven (the AI
  evaluation harness is roadmap); models have not seen `.efx` in training.
- **Built for agents.** Output is the idiomatic Effect v4 agents already know, one canonical
  desugaring per construct, no helper runtime, named spans, source maps, strict rules with fixes,
  a skill (`efx setup`) and `llms.txt`.
- **Two-way, no lock-in.** `efx convert` turns Effect TypeScript into EffectScript, and every
  `.efx` compiles back.
- **Built on Effect, versioned with it.** `effectscript@4.0.x` targets `effect@4.0.*`
  (ADR-0015); a file may start with `// @effect 4.0`. A moving target, shaped with its users.
- **Language extensions (roadmap).** Abstractions outside Effect, such as proofs through Bend2
  and infrastructure through Alchemy, arrive as opt-in extensions that never overlap, so turning
  any of them on or off always works (ADR-0083).

## Operating Context

Developers evaluate it in the browser (the two-way playground, the gallery), then in their own
editor (VS Code, Cursor, Zed, Neovim, Helix through `efx lsp`) and through their coding agents
(Claude Code, Codex, Cursor, Gemini CLI, opencode via `efx setup`). Install is
`curl -fsSL https://effectscript.dev/install | sh`, then `efx init` / `efx convert`.

## Capabilities and Constraints

- Shipped (alpha `4.0.0-alpha.N`): the compiler and reverse compiler, the CLI, runtime
  integrations, the language server and editor extensions, the agent skill, the site, the
  playground and the docs.
- Roadmap only, and labelled so wherever it appears: language extensions, proofs (`law`,
  `efx verify`), Alchemy infra, AoT-ready output, oxlint on `.efx`, the AI evaluation harness.
- effectscript.dev is a private preview (ADR-0073): the full site is behind an invite link; the
  public teaser links nowhere inside the site. Packages are not yet published.

## Brand Commitments

- The Effect-family monochrome identity in `packages/effectscript/brand/README.md`: zinc on ink,
  Inter Display and JetBrains Mono, the ƒx mark drawn only from the brand files, white on black.
- Name **EffectScript**; short name **efx**; ƒx is a symbol, never a name.
- Never the Effect logo. "Built on Effect", never "official" or endorsed.
- Voice: precise, plain, a little dry. Concrete claims and code before adjectives. No
  "revolutionary", "magical", "10x".
- Credit and call to action: made by @gunta85.

## Evidence on Hand

- The ten-scenario gallery (`site/src/samples`), with token counts computed at build time; the
  Effect TypeScript pane is compiled from the `.efx`, so it can't drift.
- Effect's own docs converted to EffectScript: `effect-docs/content/REPORT.md` (4,020 examples).
- The two-way playground, the skill, `llms.txt`, the strict rules (EFX codes with fixes).
- Absent, and never to be invented: users, testimonials, company logos, download counts,
  performance benchmarks, model-accuracy results.

## Product Principles

1. TypeScript's pragmatism: a superset you can adopt one line at a time and leave any time.
2. Intent over ceremony: if the compiler can write it, the developer shouldn't.
3. Every claim on the page is computed or tested, never asserted.
4. Effect-native: the output is what an Effect expert would write by hand.
