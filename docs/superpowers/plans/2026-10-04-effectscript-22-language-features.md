# EffectScript Plan 22: Language features from the roadmap (phase 16)

> **For agentic workers:** execute task by task with TDD. Decisions are recorded in `docs/adr/`.
> Commit with explicit, gated paths (another session shares the branch).

**Goal:** five roadmap items (spec §14) become language features, each through the whole
toolchain: parser, compiler, reverse compiler, type check, tree-sitter grammar, generated
reference and skill.

**Architecture:** each feature is a fixture first (`core/test/fixtures/<construct>/*.efx` with its
`.ts` and `.reverse.efx`), which the golden, type-check and reverse-golden tests pick up. Then the
acorn plugin parses it, a transform in `core/src/compiler/transform` rewrites it with
`MagicString`, `core/src/compiler/reverse` recognizes the output, and `tree-sitter/grammar.js`
parses it for the editors.

**Tech stack:** acorn plugin, MagicString, TypeScript 6, tree-sitter CLI 0.27 (parser at ABI 14), Effect v4.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` §4.6–4.11, §14.

## Global Constraints

- Every `.efx` construct compiles to plain, idiomatic Effect TypeScript, with no runtime of
  EffectScript's own.
- Every `.ts` file stays valid `.efx`: new keywords are contextual.
- Generated code never introduces `any` (spec §14, AoT-ready output).
- Nothing is published. Brand files are never edited.

## Review Focus

1. **Exhaustiveness stays honest:** a guarded arm never counts as handling its case, so a
   `match` with only a guarded `Circle` arm and a `Square` arm is a type error. *(Task 1)*
2. **Valid TypeScript stays valid:** `status`, `if`, `default` and `yield` keep their TypeScript
   meanings outside the new positions (`const status = 404`, a class field named `status`).
   *(Tasks 1–5)*
3. **Effectful code inside the new forms:** `await` in a guard is refused (a guard is a
   predicate), `await` in a method body or a generator stream body works. *(Tasks 1, 3, 5)*
4. **Round trips:** the reverse compiler gives the `.efx` back from each new output shape, and
   leaves look-alikes it can't prove equal as TypeScript. *(Tasks 1–5)*
5. **Editors:** tree-sitter parses every new form without errors, and the old corpus still passes.
   *(Tasks 1–5)*

---

### Task 1: `match` guards and object patterns (ADR-0063)

**Syntax.**

- A guard follows a pattern: `when Circle(c) if c.radius > 10: …`. The guard is a binary-level
  expression (a conditional needs parentheses) and can't `await`.
- An object pattern matches fields: `when { status: 404 }: …`. Values are literals (string,
  number, boolean, `null`, `undefined`) or nested object patterns. A shorthand field binds it:
  `when { status: 404, body }: body`.

**Output.**

- An object pattern is Effect's own: `Match.when({ status: 404 }, ({ body }) => body)`.
- A guarded tag arm is a plain predicate, so the case stays unhandled, refined to the case
  intersected with a brand, so the handler is typed as the case:

  ```ts
  Match.when(
    (c): c is Extract<typeof c, { readonly _tag: "Circle" }> & { readonly "~effectscript/guard": true } =>
      c._tag === "Circle" && c.radius > 10,
    (c) => …
  )
  ```

  A destructured binding goes through an immediately invoked arrow in the guard. (The probe:
  a predicate typed by the case is refused by `when`'s constraint, and `whenAnd` types the
  handler `unknown`.)
- A guarded literal arm: `Match.when((v) => v === "active" && (guard), …)`. A guarded object
  arm: `Match.whenAnd({ … }, ({ body }) => guard, …)`.

**Tests:** fixtures `match/guards.efx` and `match/objects.efx`; a type test that a guarded arm
alone leaves the match non-exhaustive (`typecheck` reports the missing case); parser tests that
`await` in a guard and an identifier value in an object pattern are refused with a message;
reverse goldens; a tree-sitter corpus entry.

### Task 2: HTTP status on errors (ADR-0064)

**Syntax:** `error TodoNotFound status 404 { id: string }`. `status` is a keyword only between an
error's name and its `{`.

**Output:** `class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", { id:
Schema.String }, { httpApiStatus: 404 }) {}`.

**Then:** the site's `http` sample returns 404 like its plain version (deferred from Plan 21).

**Tests:** fixture `error/status.efx`; a runtime test that an `HttpApi` handler failing with the
error answers 404; `const status = 1` and a field named `status` still compile; reverse golden;
corpus entry.

### Task 3: `effect` methods (ADR-0065)

**Syntax:** an `effect` member in a `class` or a `schema` class body:
`schema User { name: string; effect greet(greeting: string): string { … } }`.

**Output:** a prototype method that returns `Effect.gen({ self: this }, function*() { … })`
piped through `Effect.withSpan("User.greet")`, with an `Effect.Effect<A, E, R>` return type when
the signature names one. A prototype method, not an `Effect.fn` field, so instances stay plain
data for `Equal` and encoding.

**Tests:** fixture `schema/methods.efx` and `effect/class-methods.efx`; a runtime test that
`this` is the instance and the span is named; reverse golden; corpus entry.

### Task 4: Services with defaults (ADR-0066)

**Syntax:** a `default` member in a `service`: `service Clock { effect now(): number; default =
{ now: effect () => Date.now() } }`. A service with a default needs no layer: code that uses it
without providing one gets the default.

**Output:** `Context.Reference` (spike first: the class form has no `defaultValue`, so the
output is a `const` reference with the service's accessors next to it, or a class whose key is a
reference; the spike picks the form that keeps `Clock.now()` and `Layer.succeed(Clock, …)`
working).

**Tests:** fixture `service/default.efx`; a runtime test that `Clock.now()` runs with nothing
provided, and a provided layer overrides it; `needs Clock` is not required; reverse golden;
corpus entry.

### Task 5: Generator streams (ADR-0067)

**Syntax:** `effect* ticks(): number throws E { yield 1; await sleep("1 second"); yield 2 }`,
also as `export effect*` and as an expression `effect* () { … }`. The return type is the element
type.

**Output:** `Stream.callback<A, E>((queue) => Effect.gen(function*() { … yield* Queue.offer(queue,
x) … yield* Queue.end(queue) }))`, inside a function that takes the parameters.

**Tests:** fixture `effect/streams.efx`; a runtime test that the elements arrive in order, a
thrown error fails the stream, and `for await` consumes it; `function*` and `yield` in plain
generators are unchanged; reverse golden; corpus entry.

### Task 6: Documentation

- The spec gets the five features in their sections and §14 drops them; each section cites its
  ADR.
- `SKILL.md` and `patterns.md` show a guard, an object pattern and a generator stream; the
  generated `syntax.md` and reference pages pick up the fixtures (`pnpm codegen`).
- The site's samples use the new forms where their plain versions do the same.
- **Tests:** the skill's type-checked examples, the site build, `efx docs` drift check.

---

## Execution record

**Rulings:**

- **Task 1:** guarded tag and object arms refine to the case intersected with a brand
  (`{ readonly "~effectscript/guard": true }`): probes showed a predicate typed by the case is
  refused by `when`, and `whenAnd` types the handler `unknown` (ADR-0063). A guarded object arm's
  guard gets the checked value cast to Match's type for the pattern. A multi-line match puts
  `Match.exhaustive` on its own line.
- **Task 2:** `error Name status 404 { … }`, a header clause (ADR-0064).
- **Task 3:** prototype methods returning `Effect.gen(…).pipe(Effect.withSpan(…))`, re-indented
  one step; the established schema-class layout keeps a blank line before `}) {`; the reverse
  tracks enclosing class names (ADR-0065). The EFX2002 pitfall left the skill.
- **Task 4 (spike):** `interface` + `Context.Reference` + `Object.assign` (ADR-0066); the default is
  walked with no namespace; the fixture is a `Greeter`, since `Date.now()` in effect code is
  captured as `Clock.currentTimeMillis`.
- **Task 5:** `Stream.callback(…, { bufferSize: 1 })` with `Queue.into(queue)`, because a failing
  producer otherwise hangs the stream; the element type is required (EFX2006); no `effect* () {}`
  expression form (ADR-0067).
- **Found and fixed:** a single-statement `for await` body compiled to invalid TypeScript.
- **TDD gaps:** the edge-case test files of Tasks 2–5 were written after their code; the
  fixtures and corpus entries failed first, except Task 4's fixture, which wasn't run red.

**Final review (fresh reviewer, 1 Critical, 5 Important), fixed in one pass with tests that failed
first (`core/test/plan22-review.test.ts`):** a default service's accessor overwrote the reference's
own `name`/`use`/`key`; `readonly default: string` crashed the compiler; a one-line method with
`defer` scoped the wrong expression; `super`/`arguments` in a method are now EFX2009; guarded arms
test `Predicate.isTagged`/`hasProperty` before reading fields; object-pattern bindings keep their
mapping. Regraded to Important and fixed: `effect * f(2)` with a block on the next line, and a
reserved word as a binding. ADRs 0063, 0065, 0066 and 0067 got amendments.

**Deferred minors:** comments on a default service's member lines; `Match.exhaustive`'s indent
inside a multi-line method; CRLF in effect methods; modifier errors for `effect` methods; a
type-parameter bound containing `=>` on `effect*`; `await` in a nested async function in a guard;
round-trip gaps for generic and default-exported streams.

