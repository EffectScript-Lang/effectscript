# ADR-0308: `|> catch Tag => value` recovers from a tagged failure in a pipeline

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** the user (asked to explore a pipe-level `catch`); agent ruling on the form, from the
  real-projects corpus (ADR-0302)
- **Related:** ADR-0010 (`try` / `catch`), ADR-0087 (`is`), ADR-0300 (rubric), ADR-0306

## Context

`try` / `catch (e: T)` covers recovery inside a block. In a pipeline, EffectScript still wrote
Effect's call: `|> catchTag("NotFound", () => succeed(null))`. The converted real-projects corpus
holds 9,087 such call sites. In 98% of them the handler ignores the error, and in 94% it only gives
a value back: `succeed(v)` 5,953 times, `Effect.void` 2,557 times. The intent is "if this fails with
`T`, use `v`", spelled with a tag string, an arrow and a constructor around the value.

Three spellings were measured on those call sites (o200k):

| form | example | saved at these sites | of all real code |
| ---- | ------- | -------------------: | ---------------: |
| the same handler | `catch (_: NotFound) => succeed([])` | 10% | 0.04% |
| a value | `catch (_: NotFound) => []` | 25% | 0.09% |
| a value, binding only when read | `catch NotFound => []` | 47% | 0.17% |

## Decision

- **Form:** a pipe step `catch Tags => value`, with `Tags` written as `is` writes them (`A or B`),
  or `catch (e: A | B) => value` when the value reads the error, as in a typed `catch` clause.
- **Meaning:** `Effect.catchTag(tag or [tags], (e) => …)` around the value. `=> undefined` is
  `Effect.void`, `=> throw e` is `Effect.fail(e)`, `=> await x` runs `x` instead, and any other
  value is `Effect.succeed(value)`. An effect anywhere else inside the value is **EFX5003**: that
  is what `try` is for.
- **Extent:** the value runs up to the next `|>`. An object literal is parenthesized, as after an
  arrow.
- **Where:** directly after `|>`, in an Effect pipeline. Elsewhere, or in a `Stream` or `Layer`
  pipeline, it is EFX5003. `catch` is a reserved word, so no TypeScript reads differently.
- **One form:** the reverse compiler writes every `Effect.catchTag` pipe step this way when its
  handler is an expression arrow giving `succeed(v)`, `Effect.void`, `fail(e)`, or (inside
  `effect` code, as the last step) another effect. A handler that declares a parameter keeps it
  (`catch (_: T)`), since dropping it would change the output.

## Consequences

- Real projects: the reverse compiler writes 5,746 `catch` steps; the saving moves from 3.3% to
  3.4% in every vocabulary of the panel (alchemy 3.4% → 3.6%), and no project converts fewer files.
- Docs corpus: the examples rarely recover by tag in a pipe; the few that do read
  `|> catch (e: NotFound) => \`missing: ${e.resource}\``.
- The site's gallery doesn't change: its scenario recovers with `try` / `catch`.
- Tree-sitter gains a `catch_step` node.

## Alternatives considered

- **Keep `catchTag("T", () => succeed(v))`:** Effect's own spelling, but its common case is all
  ceremony: the tag as a string, a handler that ignores its argument, and a constructor around a
  constant.
- **The same handler, respelled:** a tenth of the saving, and a second way to write the same call.
- **A bare `|> catch T` that ignores the failure:** shorter than `=> undefined`, but it hides that
  the success type gains `void`.
- **A catch-all step (`|> catch => value`):** recovering from every failure is a different intent
  from recovering by tag, and rarer; it can be decided on its own evidence. `Effect.catch` and an
  untyped `catch` clause inside `try` cover it today.
