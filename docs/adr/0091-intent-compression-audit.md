# ADR-0091: Audit the whole language for ceremony, with one form per intent

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user (the audit, its goal and its limits); agent rulings on the findings
- **Related:** ADR-0002, ADR-0003, ADR-0005, ADR-0030, ADR-0077, ADR-0087, ADR-0089, ADR-0092;
  Plans 24–30; `effect-docs/content/REPORT.md`

## Context

EffectScript is an intent language: a reader, or an agent, should see what the code means to do,
not the machinery that does it. The constructs shipped so far (`effect`, `await`, `throw`,
`schema`, `service`, `|>`, `match`, the library declarations) each removed one kind of ceremony.
Nobody has yet looked at the language as a whole for what's left. In particular, nobody has
looked for places where Effect or EffectScript offers two spellings of one meaning. Two
spellings cost twice: a model has to learn both, and a reader has to check whether they differ.

The evidence, measured in `o200k` (ADR-0092) on the 1,715 re-sugared examples of the docs corpus:

- EffectScript saves **14.1%** of tokens on the corpus (13.9–14.2% across the panel), and far more
  on the site's samples, which use the declarations.
- What survives the reverse compiler:

  | residue                                                     | count | why it survives                                                                    |
  | ----------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------- |
  | `import … from "effect…"` in "unchanged" examples           | 2,229 | the prelude's import wouldn't recompile byte for byte (ADR-0089, in flight)        |
  | `.pipe(…)` beside 262 `\|>`                                 |   822 | the forward compiler only knows local `effect` calls are pipeable                  |
  | of which the head is an Effect module or a prelude builtin |   551 | `Stream.make(…).pipe(…)`, `Schema.String.pipe(…)`, `log(…).pipe(…)`                |
  | `=> succeed(…)`                                             |   202 | `effect () => x` compiles to a different (traced) function                         |

- In the site's samples:
  - the `layer test` implementations repeat the parameter types their service just declared:
    `query: effect (sql: string) => …`;
  - empty errors are written `error Forbidden {}`;
  - service members are written `readonly size: number`, although a service's shape is never
    written to;
  - a tag is named `Cause.TimeoutError` in a `catch`, where the tag is all that's used.
- The pending plans write `Effect.exit(…)` beside the bare `exit(…)`, `Exit.isFailure(exit)` beside
  `exit is Failure` (ADR-0087), `Option.isNone(o)` beside `o is None`, and `Int & Brand<"Money">`
  beside `brand Money = Int` (ADR-0077).

## Decision

### The rubric

Every construct, sample, doc, skill page and plan is held to these rules, in this order:

1. **TypeScript keeps its meaning.** Every valid TypeScript program means what it meant (ADR-0002).
   Compression happens only where TypeScript has no parse, or inside EffectScript's own
   declarations.
2. **The output stays idiomatic Effect** (ADR-0003). A compression never changes what runs to save
   a token in the source.
3. **One form per intent.** Where two spellings mean the same thing, EffectScript names one
   *canonical*. The reverse compiler, `efx fix`, the skill, the docs and the samples write only
   that one. The other stays accepted when it's valid TypeScript, but nothing generates it.
   Spellings that compile to different code (a traced `effect` method beside an untraced `effect`
   arrow, `await [a, b]` beside `all([a, b])`) are different intents, not duplicates.
4. **Say it once.** Nothing the same file already states is stated again: a parameter type its
   declaration gives, a tag its name gives, a modifier its construct implies.
5. **Effect's words, not new ones.** Keep Effect's and TypeScript's names (`retry`, `timeout`,
   `isGreaterThan`, `ReadonlyArray` in types). No abbreviations, no new operators beyond `|>`,
   no symbols where a word exists. Someone who knows Effect TypeScript reads EffectScript without a
   glossary.
6. **Beauty decides, tokens are evidence.** A change must read at least as clearly as what it
   replaces. Token counts justify it and must not get worse in any vocabulary of the panel
   (ADR-0092). A form that saves tokens but reads worse is rejected. So is tuning text to one
   tokenizer's merges.
7. **The round trip holds** (ADR-0030). A canonical form must be one the reverse compiler can
   produce, so existing Effect code converts to it.

### Findings and rulings

**Adopted now** (implemented with this ADR, each with fixtures, reverse rewrites, grammar and skill):

- **A1. One pipeline form.** A pipeline is written with `|>`. The forward compiler learns which of
  Effect's exports produce a `Pipeable`. That's a table generated from `effect`'s types: for a
  function, the argument counts whose signatures all return one; for a value, whether its type is
  one. It compiles `Stream.make(1) |> Stream.map(f)` to `.pipe(…)` exactly as it does for local
  `effect` calls. The reverse compiler then turns those `.pipe(…)` calls into `|>`. Heads Effect
  doesn't type as pipeable (`Data.struct(…)`, `Number.sum(…)`) keep compiling to `pipe(…)`.
- **A2. Implementations take their parameter types from their declaration.** In a service's
  `layer`, `layer <name>` and `default`, an `effect` member whose parameters have no types gets
  them from the service's own signature for that member, by position (with `?` and rest). So
  `layer test = { find: effect (id) => … }` compiles exactly as `effect (id: string) => …` did.
  The reverse compiler drops annotations that match the signature.
- **A3. `T[]` is the canonical array type in schema positions.** `T[]`, `Array<T>`,
  `ReadonlyArray<T>` and `readonly T[]` all compile to `Schema.Array(T)` in schema, error and
  signature-line fields. The reverse compiler, which wrote `Array<T>`, now writes `T[]` when `T`
  needs no parentheses and `Array<T>` when it would (`Array<"a" | "b">`, not `("a" | "b")[]`),
  typescript-eslint's `array-simple` convention. Types written in TypeScript positions keep their
  meaning and their spelling.
- **A4. An empty error needs no body.** `error Forbidden` and `error Unauthorized status 401` are
  complete declarations. The reverse compiler writes them without `{}`.
- **A5. A service's members are read-only.** A member of a `service` body compiles to `readonly`
  whether or not it says so. The reverse compiler drops the modifier. *Withdrawn by Amendment 1.*
- **A6. Short tag names in `catch` and `is`.** The samples, docs and skill name a tag by its tag
  (`catch (e: TimeoutError)`), as ADR-0010 and ADR-0087 already allow.

**Already decided, confirmed by the audit as the next largest wins:** `brand` and `where` (ADR-0077,
Plan 30), `is` (ADR-0087, Plan 29), and prelude imports that recompile (ADR-0089, which unlocks
the 2,229 "unchanged" corpus examples).

**Amendments to pending plans** (their examples and tasks follow the rubric before they ship):

- **Plans 24 and 27 (laws, service models):**
  - `await exit(e)`, not `await Effect.exit(e)`;
  - `exit is Failure`, not `Exit.isFailure(exit)`;
  - `found is None`, not `Option.isNone(found)`;
  - `brand Money = Int`, not `schema Money = Int & Brand<"Money">`. This amends ADR-0077's
    consequence that these plans keep the long form. That consequence had two reasons, and both
    still hold: `brand Money = Int` has no check, so `Money` still admits negative values, and a
    plan that runs before Plan 30 keeps the long form.
- **Plan 30 (`where`):** a check with no arguments may drop its `()`: `where isTrimmed,
  isNonEmpty`. It compiles to the call, and the reverse compiler writes the short form. A check
  that needs arguments is still a call, and calling it without them is TypeScript's error.
  - A check whose name is also a JavaScript global (today only `isFinite`, from the generated
    `schemaGlobalChecks`) is Schema's check when it is a whole `where` entry, `where isFinite`, or
    the callee of one. A `where` list is EffectScript's own syntax, so no TypeScript meaning is lost.
    Inside a check's own expression, the name keeps JavaScript's meaning.

**Rejected:**

- **Dropping `new` from `throw new E(…)`:** it's TypeScript's meaning of constructing a class, and
  `throw E(…)` would read as a function call to every TypeScript reader (rule 5).
- **Inferring `effect` from an `await` inside a plain function:** `effect` is the boundary a reader
  looks for (ADR-0005). Its absence is intent too.
- **`effect () => x` for every `() => succeed(x)`:** they compile to different functions (rule 3).
  Both stay. The skill teaches `succeed` for a constant and `effect` for a body.
- **Reversing `Data.TaggedError` classes to `error`:** `error` compiles to `Schema.TaggedError`, so
  the output would change (rule 7). It needs a migration tier that is allowed to change output. A
  later ADR can add one.
- **Making every module's functions bare:** `map`, `filter` and `get` exist in a dozen modules. The
  prelude stays limited to the modules whose names don't clash (ADR-0007).
- **Pipeline steps that take the head's module** (`Stream.make(1) |> map(f)` meaning `Stream.map`,
  as a method resolves on its receiver): the compiler is syntactic (ADR-0017), so it knows the
  module only when the head is a visible Effect constructor. For a parameter or any other head,
  `xs |> map(f)` would fall back to `Effect.map`, and one spelling would have two meanings
  depending on where its input came from. That is the duplication this audit removes, turned
  inside out (rule 3). The reverse compiler couldn't keep the round trip either, since moving a
  head into a variable would change what its steps mean. Revisit only if the compiler gains types.

### The audit continues

- `effect-docs/content/REPORT.md` is the audit's ledger. Every change to the language regenerates
  it, and its panel table shows the saving in each vocabulary.
- A new construct's ADR states the ceremony it removes and its canonical form.
- A plan whose examples break the rubric is amended before it's executed.

## Consequences

Measured when A1–A6 landed, on the whole docs corpus (unchanged examples count as their
TypeScript):

| vocabulary  | EffectScript saving before | after |
| ----------- | -------------------------: | ----: |
| o200k       |                      8.17% | 8.73% |
| qwen3       |                      8.08% | 8.64% |
| deepseek-v3 |                      8.23% | 8.84% |
| glm-4.6     |                      8.19% | 8.76% |

- A1 alone lets 226 more examples convert (1,715 → 1,941 re-sugared). `.pipe(` in the EffectScript
  corpus fell from 739 to 255, and `|>` rose from 262 to 1,437.
- Every forward fixture compiles to the same bytes as before. Where output changed, it moved
  towards hand-written Effect: the CLI's own `pipe(Command.make(…), Command.withDescription(…))`
  became `Command.make(…).pipe(Command.withDescription(…))`.
- In every fixture the audit changed, the changed construct is written as the reverse compiler
  writes it. Where a fixture still differs from its reverse golden, the difference is a
  normalization the spec lists (§6.4), kept on purpose so the forward compiler stays tested on it.

- The reverse compiler becomes the place the canonical forms live. `efx convert`, `efx fix` and the
  docs corpus all converge on them, and an agent trained on the corpus sees one spelling per
  intent.
- A1 adds a generated table of Effect's pipeable exports (`pnpm codegen`). It must be regenerated
  when Effect's API changes, like the rest of the prelude tables.
- A2 means an implementation's parameter types are read from another line of the same
  declaration. Hovers in the editor still show the full type, because TypeScript sees the
  compiled annotation.
- Each rejected idea is recorded here, so it isn't proposed again without new evidence.

## Alternatives considered

- **Compress for tokens alone (a minifier's view):** shorter names and symbols save more tokens,
  but they lose the reader. The user's goal is intent you can read, not the smallest file.
- **Rewrite Effect's API names in EffectScript:** it would cut a few tokens, and it would break the
  promise that an Effect developer already knows the vocabulary.
- **Keep both forms and let style tools choose:** two forms in the corpus is what the audit exists
  to end. Accepting both as input is fine; generating both isn't.
- **One-off fixes without an ADR:** the rubric is a standing rule for every future construct, so
  it's a decision, not a cleanup.

## Amendment 1: A5 withdrawn

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** agent ruling, on the audit's own evidence (rule 6)

Measured after A1–A6, Plan 29 and Plan 30 landed, A5 failed the rubric:

- Effect's docs write service shapes both ways: 73 services in the corpus mark every field
  `readonly`, and 11 have a mutable one (`{ defaultValue: Effect.Effect<number> }`). Under A5 those
  11 can't convert, because `size: number` would compile to `readonly size: number`. A service left
  as a `Context.Service` class is a second way to write a service, which is worse than a modifier.
- Without A5, the whole corpus is 9–10 tokens *smaller* in every vocabulary of the panel, and one
  more example converts (1,951 → 1,952). The `readonly` tokens A5 saved are outweighed by what it
  blocked.
- A TypeScript reader reads `size: number` as mutable (rule 1). In a `service` body it now means
  that again.

So a service field means what TypeScript says: `readonly size: number` and `size: number` are two
intents, not two spellings of one, and both convert both ways.

## Amendment 2: A7, a first step that only takes a `Pipeable`

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** agent ruling, on the real-projects corpus (ADR-0093)

Converting 16 real Effect v4 projects (20,926 files) showed what the docs corpus couldn't: after
A1, 32,473 `.pipe(…)` calls were still TypeScript, and about 95% of them start with an Effect
combinator (`Effect.*`, `Stream.*`, `Layer.*`, or a builtin such as `mapError`, `orDie`,
`provide`). Their heads are the projects' own services (`LLM.generate(…)`), which A1's table can't
know.

- **A7:** when a pipeline's first step is an Effect export that only takes a `Pipeable`, the head
  is one, whatever it is, so `x |> step |> …` compiles to `x.pipe(step, …)`. "Only takes a
  `Pipeable`" is read from `effect`'s types at codegen (`pipeableSteps`): a call whose every
  signature for that many arguments returns a function whose first parameter is a `Pipeable`
  (`Effect.map(f)`, `provide(layer)`, `Effect.catchTag(tag, f)`), or a value that is such a
  function (`Effect.orDie`, `Effect.asVoid`). A head that needs it is parenthesized. Node's
  `readable.pipe(dest)` isn't touched: its argument isn't an Effect step.
- The reverse compiler mirrors it, so those `.pipe(…)` calls come back as `|>`, and a
  `pipe(x, Effect.orDie)` call stays TypeScript, since `|>` would now compile to `.pipe`.
- Measured: 2,361 more real-project files convert (8,072 → 10,433), `.pipe(` left in them falls
  by 79% overall, and the docs corpus is about 190 tokens smaller in every vocabulary. The compiled
  output reads as hand-written Effect: `fetchUser(id).pipe(Effect.retry(…))`, not
  `pipe(fetchUser(id), Effect.retry(…))`.

