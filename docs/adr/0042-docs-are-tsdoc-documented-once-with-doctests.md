# ADR-0042: Docs are TSDoc comments, written once at the definition, with Elixir-style doctests

- **Status:** Accepted, amended by ADR-0044
- **Date:** 2026-10-03
- **Deciders:** the user, in conversation (design for living docs)
- **Related:** docs spec `docs/superpowers/specs/2026-10-03-effectscript-docs-design.md`, spec §4.2,
  §4.6, §4.14, ADR-0017, ADR-0043

## Context

When AI agents write most of the code, people read signatures and docs instead of bodies. Elixir is
often cited as the language models write best. The usual explanation is its docs: `@doc` is part of
the language, examples in docs run as tests (doctests), so they can't go stale, and every package's
docs look the same.

EffectScript signatures already say most of what docs usually repeat. `: A throws E needs R`
names the result, every typed error and every required service. Schemas name the constraints on
parameters (`schema Money = Int & Brand<"Money">`, `cents = Int.check(isGreaterThan(0))`). Restating that in `@param`, `@returns` and
`@throws` tags costs tokens for every reader, human or model, and the restated copy drifts.

The user wants no new doc syntax ("TSDoc, we don't need to invent anything"), output that machines
can parse, and Elixir's results.

## Decision

- **Syntax.** Doc comments are standard `/** */` comments with a CommonMark body. The first
  paragraph is the summary. A leading `/** … @module */` comment documents the module. The
  compiler already passes comments through unchanged, so TypeScript hover and `.d.ts` output
  keep working.
- **Document once, at the definition.**
  - A declaration's doc says what it does and why. It doesn't restate its signature.
  - Parameter meaning belongs on the parameter's schema. For example, `/** Amount in cents. */`
    goes on `schema Money`, not on every function that takes a `Money`.
  - The meaning of an error belongs on the `error` declaration. The same goes for services
    (`service` declarations).
  - The docs generator (ADR-0043) assembles these into each page.
- **Redundant tags are allowed but not needed.** `@param`, `@returns` and `@throws` still parse
  and render (they're valid TypeScript and appear in plain `.ts` files). `efx docs --check
  --strict` warns when a tag restates something the signature or a schema already says.
- **Examples are `efx` code fences in the doc body.** Elixir also puts examples inside the doc
  text. No `@example` tag is needed.
  - Only fences with the `efx` language tag are runnable examples. Fences in any other language
    are for display only.
  - The text just before a fence serves as its title.
- **Assertions are expressions:**
  - `expr // => expected` passes when `Equal.equals(expr, expected)` holds, or when the two values
    are deeply and strictly equal. This matches `@effect/doctest`.
  - `await e // => throws Name` passes when the effect `e` fails with an error whose `_tag` is
    `Name`.
  - `await e // => dies` passes when `e` dies with a defect. This keeps bugs separate from typed
    failures, the same distinction Effect makes.
  - ` ```efx ignore ` fences are highlighted but not run.
- **Doctests are opted in from a test file.** `doctest "./transfer.efx"` turns each example into
  one `it.effect` test. `doctest "./transfer.efx" with Ledger.layerTest` provides the
  dependencies. This mirrors Elixir's `doctest MyModule` inside an ExUnit case.
  - Example bodies are `effect` bodies, so `await` works in them.
  - The documented module's exports are in scope, so examples need no imports.
- **The compiler stays single-file.** `doctest` compiles to an import of the virtual module
  `"./transfer.efx?doctest"`. The Vite plugin builds that module by extracting and compiling the
  examples, with source maps that point back to the doc comment.

## Consequences

- Docs are shorter, and each fact lives in one place. Changing `Money`'s doc updates every page
  that takes a `Money`.
- This pushes people to model constraints as schemas, which Effect already encourages and which
  pays off at runtime too (decoding, `Arbitrary`).
- An example can't go stale once a `doctest` line covers it. An example that no `doctest` line
  covers is not checked. Reporting such examples needs a whole-program view, so it is out of scope
  for now.
- Doctests run under Vitest only, through the Vite plugin. That is where `test`/`describe` already
  run.
- `doctest` is a new contextual keyword. It must stay on one line with its string (§4.19), so
  existing TypeScript keeps parsing.
- There is no reverse rule. A `doctest` statement has no idiomatic TypeScript counterpart.

## Alternatives considered

- **`///` comments, as in Rust and C#:** they clash with TypeScript triple-slash directives
  (`/// <reference …>`).
- **An Elixir-style `@doc """…"""` attribute:** it isn't valid TypeScript, so it would break the
  superset guarantee and editor hover.
- **Effect's house style (`**Example** (Title)` headings, required `@category`/`@since`):** it's a
  convention of the Effect repo itself. External users and tools don't know it, and it adds tokens.
- **Required `@param`/`@returns`/`@throws`, as in TSDoc:** these repeat the signature, cost tokens
  and drift. Rejected by the user.
- **`@example` tags around each fence:** one more line per example, and nothing new for a machine
  to read, because the fence's language tag already marks it.
- **Elixir's `iex>` prompt with printed output:** it needs a stable printer for every value, and
  the expected output isn't type-checked. An expression after `// =>` is both.
- **Discovering doctests automatically from every module:** examples would have no place to
  declare layers or setup, and every test run would pay for parsing every doc comment.
