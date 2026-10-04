# ADR-0083: Abstractions outside Effect come as language extensions that never overlap

- **Status:** Accepted (the concept and its two rules); the mechanism is open
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation while briefing the landing page: "we present it as
  language extensions cause they are for some parts like bend, alchemy etc. anything that is not
  in effect, but its enough to be better include on the lang, as an abstraction. they cannot
  overlap etc. so enabling disabling extensions shall always work well."
- **Related:** ADR-0002 (the superset), ADR-0074–0076 (proofs through Bend2, `law`), spec §14
  (roadmap: Alchemy infra, a Foldkit-style `app`), ADR-0082 (the landing page shows them)

## Context

Everything the language adds today is Effect, as syntax: `effect`, `error`, `service`, `layer`,
`schema`, and Effect's own libraries as declarations (`test`, `api`, `command`, `rpc`, `tool`,
`entity`, `workflow`). The roadmap has constructs that build on something other than Effect:
proofs checked by Bend2, infrastructure on Alchemy, and Foldkit-style apps. Putting them in the core
would make every project carry keywords for tools it doesn't use, tie the language's releases to
theirs, and blur what "EffectScript is Effect as syntax" means.

## Decision

- **An extension** is a set of constructs for an abstraction that isn't Effect's but is worth being
  language. It is switched on per project. The first candidates are `proofs` (on Bend2: `law`,
  `requires`), `infra` (on Alchemy: `infra`, `resource`) and `app` (on Foldkit's model: `app`).
- **Extensions never overlap.** No two extensions, and no extension and the core, claim the same
  keyword or syntax position. A new extension that needs a taken word picks another. Reusing a core
  contextual word with the core's own meaning (a law's `with` clause means what `describe … with`
  means) is not a claim.
- **Switching an extension on or off is always safe.** With an extension off, its constructs are
  not EffectScript (the compiler should say which extension they need); nothing else in the file
  changes meaning. With it on, code that doesn't use it compiles exactly as before. That is the
  superset guarantee (ADR-0002), applied per extension.
- **Open:** where a project switches extensions on (`tsconfig` plugin options, `package.json`, or
  a file header next to `// @effect 4.0`), how an extension ships (in `effectscript` or as its own
  package), and how the editor and the skill learn which are on. A later ADR decides these, before
  the first extension is built.
- The landing page presents extensions as roadmap only, labelled "not shipped, syntax may change"
  (ADR-0082).

## Consequences

- The core stays "Effect, as syntax". Projects only see keywords for the tools they use.
- Each extension can follow its own tool's release cycle without breaking the lockstep with Effect
  (ADR-0015).
- The non-overlap rule constrains naming across all extensions, so it needs a registry (a table
  in the spec) and a test that the keyword sets are disjoint. The landing page's data already
  checks this for the three candidates.
- The prelude, the reverse compiler and the skill all have to become extension-aware.

## Alternatives considered

- **Everything in the core:** one language to learn, but every project carries Bend, Alchemy and
  UI keywords, and the core's releases wait on three more tools.
- **Separate dialects (`.efx-infra` files, or a fork per tool):** no keyword clashes, but files
  stop mixing, and leaving a dialect means a rewrite: the opposite of the superset.
- **Plain libraries, no syntax:** works today and stays available, but loses what the language
  gives the core constructs: declarations that say intent, checked by the compiler.
- **Extensions allowed to overlap, resolved by order:** flexible, but switching one off could
  change what another means, which the user ruled out.
