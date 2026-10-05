# ADR-0089: Prelude imports name the module's own file, not the package index

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user, in conversation: "we make the compiler import just some parts, functions,
  so we get even better tree shaking", then, after the measurement below, "do that … i like that
  esbuild is smaller. no per func import then."
- **Related:** ADR-0007 (prelude, amended), ADR-0009 (hygienic generated references), ADR-0022
  (build emit), ADR-0030 (reverse rewrites recompile identically, amended), ADR-0050 (docs
  translation), ADR-0056 (`efx fix`); spec §4.13, §6.4

## Context

ADR-0007 imports prelude names and compiler-owned references from the package index:
`import { Effect, Schema } from "effect"`, then `Schema.Struct(…)`. The index re-exports every
module (`export * as Schema from "./Schema.ts"`), so whatever the program uses, a consumer loads,
or asks its bundler to prove away, all of them.

The user proposed importing single functions (`import { Struct } from "effect/Schema"`) for the
most tree-shaking. We bundled one program, a two-field `Schema.Struct` decoded once, in three
shapes, minified:

| Import shape                                         | esbuild               | rolldown |
| ---------------------------------------------------- | --------------------- | -------- |
| `import { Schema } from "effect"`                    | 326 KB, 217 modules   | 210 KB   |
| `import * as Schema from "effect/Schema"`            | 216 KB, 114 modules   | 210 KB   |
| `import { Struct, String as Str, … } from "effect/Schema"` | 216 KB, 114 modules | 210 KB   |

Rolldown removes unused code in every shape. esbuild cannot see through the index and keeps a
third more code. Per-function imports add nothing over a namespace import of the module's file:
bundlers already drop members that are only read as `Schema.X`. Unbundled code (Node CLIs, tests,
dev servers) never tree-shakes, and there the module file halves the modules loaded at startup.

## Decision

Imports the compiler adds (prelude names and its own references) name the module's own file:

- A namespace module is imported as a namespace from its file: `import * as Schema from
  "effect/Schema"`, `import * as Command from "effect/cli/Command"`. Code keeps `Schema.Struct(…)`.
- `pipe`, `flow` and `identity` come from `"effect/Function"`.
- The prelude generator records each module's file specifier next to its index specifier
  (`preludeModuleFiles`), from the same files it already reads.
- When the file already has a value import of the index (`import { Runtime } from "effect"`), the
  compiler still adds names to it, as before: the index is loaded anyway, and one import reads
  better than two.
- When the file already imports from `effect/…`, new module-file imports are slotted in among
  those imports in path order instead of at the top of the file. This is the module-file
  counterpart of adding names to an existing index import, and it keeps the reverse direction exact
  (below).
- Existing imports are reused in either shape. `import * as Schema from "effect/Schema"` written by
  hand counts as an import of `Schema` for generated references (ADR-0009) and for the reverse
  converter, which removes it as a prelude import (spec §4.13).

### The reverse direction: a third canonicalization (amends ADR-0030)

Hand-written Effect code imports from the index: `import { Effect, Schema } from "effect"`. With the
decision above, removing that import no longer recompiles to the same bytes. ADR-0030 would keep the
import line in every converted file, and `efx convert` and `efx fix` would stop producing bare files.

So ADR-0030 gets a third listed canonicalization. The reverse converter may remove prelude imports
when the file recompiles to the same code once its `effect` imports are compared as *bindings*
rather than text. An index import of a prelude name and a namespace import of the module's file
are the same binding. Two guards keep this safe:

- **Bindings must match exactly:** the same local names, the same modules, and the same type-only
  flags. Effect's modules have no side effects at import (its `sideEffects` list names none of
  them), so the import's shape and order among other `effect` imports don't change the program.
- **Each run of `effect` imports stays in place:** it is compared as a marker at its position, so
  an import never moves across other code, such as a side-effectful `import "./polyfill"`. This is
  the hazard ADR-0030 named.

Such a conversion carries a `canonicalized:` note, like the other two. The checks that consumed
ADR-0030's exact round trip accept it on that note: the conversion guard, `efx fix`
(ADR-0056), and the docs translation (ADR-0050). Exact matches are tried first, so compiler output
still round-trips byte for byte unless its source wrote an index import itself.

## Consequences

- Smaller bundles with esbuild and fewer modules loaded without a bundler; no change with
  rolldown or Rollup.
- Emitted code stays idiomatic and readable: the namespace names are unchanged, only the import
  lines differ. Every snapshot of compiled output changes once.
- We depend on the `"./*"` entry of `effect`'s export map (`effect/Schema`, `effect/cli/Command`).
  If upstream drops it, the generator fails, and we revert to the index.
- A file that mixes a hand-written index import with compiler-added names still loads the index.
  That is the user's import, and the forward compiler does not rewrite it.
- Converting hand-written Effect code (`efx convert`, `efx fix`, the docs) rewrites its index
  imports to module files, with a note. The converted Effect docs drop more import lines than
  before: the share of tokens saved rose from 20.4% to 21.3% over 4,020 examples.
- Tests that need a byte-exact round trip feed the compiler's shape (`import * as Effect from
  "effect/Effect"`). Golden fixtures whose sources import from the index are checked with the
  canonicalization instead.
- Test harnesses that map `effect/*` to source paths need exact entries for `effect/Schema` and
  `effect/schema`: `Schema.ts` and the `schema/` folder collide on case-insensitive disks.

## Alternatives considered

- **Per-function imports** (`import { Struct } from "effect/Schema"`): no measured gain over the
  module file. Names collide across modules (`map`, `make`, `String`, `Struct`), so output fills
  with aliases. Type positions (`Schema.Schema.Type<…>`) still need the namespace, and the reverse
  converter would have to undo the rewrite.
- **Rewriting user-written index imports too:** a namespace used as a value (`const S = Schema`)
  would change meaning, which breaks the superset promise of ADR-0002.
- **An opt-in option:** the output is the same code with a cheaper import, so there is nothing to
  opt out of.
- **Keeping the index:** fine for rolldown, a third more code for esbuild users.
- **Leaving ADR-0030 as it was:** safe, but every converted file would keep its `import { … } from
  "effect"` line, undoing ADR-0007's "most files need no imports" for converted code.
- **Comparing imports as unordered bindings across the whole file:** simpler, but it would let an
  import move above a polyfill, the exact hazard ADR-0030 guards against.
