# ADR-0097: `// @efx spans Prefix` names a file's spans after its module

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** agent ruling, from the real-projects corpus (ADR-0094)
- **Related:** ADR-0017 (directives), ADR-0029, ADR-0030, ADR-0092, ADR-0095

## Context

An `effect` declaration is traced under its own name: `effect poll()` is
`Effect.fn("poll")(…)`. Inside a service or a `layer … for`, it is `Service.poll`.

Real code names spans after the module much more often than after the bare function. In the 16
real projects:

- 2,420 `const name = Effect.fn("Prefix.name")(…)` bindings, against 428 named after the binding
  alone;
- 609 of the 631 files that use the `Prefix.name` form use one prefix throughout;
- the prefix is the file's name in under half of them, so it can't be inferred.

After `layer … for`, "its span name differs from the binding" was the corpus's most common reason
a function stayed TypeScript (736 files).

## Decision

- **Form:** `// @efx spans Prefix` in a file's leading comments, like the other directives.
  `Prefix` is a name or a dotted name.
- **Meaning:** every span the file names after a binding is `Prefix.name`: `effect` declarations,
  including nested ones, and `effect` methods of plain objects. Spans that a `service`, a
  `layer … for` or a class already name after their owner keep that name.
- **The directive is spent:** the compiler removes its line from the output, because its whole
  effect is in the span names. That is what lets the reverse compiler introduce it (ADR-0030: a
  new comment in the output would break the round trip).
- **Reverse:** when every `Effect.fn("…")` on a binding in the file is named `Prefix.binding` with
  a single prefix, the reverse compiler converts those functions and writes the directive, but
  only if some conversion needed it. A file that mixes plain and prefixed names, or two prefixes,
  gets no directive, and its prefixed functions stay TypeScript.

## Consequences

- A file's trace naming is stated once, at the top, instead of in every `Effect.fn("…")`.
- One more directive to know. Its effect is local and visible: `efx print` shows the span names.
- A function with a span name that is neither `name` nor `Prefix.name` still stays TypeScript.

## Alternatives considered

- **Infer the prefix from the file name:** right for fewer than half the real files, and it would
  change every existing program's span names.
- **A span name per function** (`effect "CodexAuth.poll" poll()`): repeats what the directive says
  once, and adds a string between `effect` and the name.
- **Keep the directive in the output:** the reverse compiler could then never add it, and none of
  these 736 files would convert.
