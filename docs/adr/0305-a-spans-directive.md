# ADR-0305: `// @efx spans Prefix` names a file's spans after its module

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** agent ruling, from the real-projects corpus (ADR-0302)
- **Related:** ADR-0017 (directives), ADR-0029, ADR-0030, ADR-0300, ADR-0303

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

## Amendment 1: `// @efx no-ambient` is spent too, and the reverse compiler writes it

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** agent ruling, from the real-projects corpus

Real code calls `console.log`, `Date.now()` and `Math.random()` inside generators as plain
JavaScript. In `effect` code EffectScript captures them as Effect services (spec §4.15), so the
reverse compiler left those generators as TypeScript: 358 files in the corpus.

- `// @efx no-ambient` leaves no comment in the output either. A directive the reverse compiler may
  introduce has to be spent, for the reason given above.
- When capture is what keeps code TypeScript, the reverse compiler converts the file again with
  capture off, and keeps that version, with `// @efx no-ambient` at the top, if it converts more.
- A file that already says `no-ambient` compiles as before, minus the comment line.

## Amendment 2: the reverse compiler writes the prefix most spans share

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** agent ruling, from the real-projects corpus

The rule above wrote no directive for a file that mixes prefixes or plain names. In the corpus that
kept whole files TypeScript over one or two odd names: opencode's `acp/service.ts` names 17
functions `ACP.name` and 2 `ACP.promptUsage.name`, so none of the 19 converted.

- The reverse compiler counts the spans named `Prefix.binding` per prefix, and the spans named
  after the binding. It writes the directive for the most common prefix when that prefix names more
  functions than any other prefix and more than the plain names.
- The functions it doesn't cover stay TypeScript, as they did before. A tie writes no directive.
- The forward meaning is unchanged.

**Alternatives considered:**

- **Keep one prefix or none:** simple, but a single nested name blocks a whole file.
- **A directive per prefix, or per function:** a second way to name a span, against "one form per
  intent" (ADR-0300). The odd functions read fine as TypeScript.
