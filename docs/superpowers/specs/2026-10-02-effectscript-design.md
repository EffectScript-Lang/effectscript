# EffectScript: Design Spec

- **Status:** Draft for review
- **Date:** 2026-10-02
- **Location:** `packages/effectscript/*` in the `EffectScript-Lang/effect-lang` fork of the Effect monorepo (ADR-0036)
- **Decisions:** the reasons behind this design are recorded as ADRs in `docs/adr/`. When this
  spec and an accepted ADR disagree, the ADR wins and this spec is fixed.

EffectScript is TypeScript with Effect built into the language. Source files use the `.efx`
extension, and every valid `.ts` or `.tsx` file is also a valid `.efx` file. The compiler turns
`.efx` into the idiomatic Effect v4 TypeScript an expert would write by hand. The reverse compiler
turns idiomatic Effect TypeScript back into EffectScript, so adopting it never locks a codebase in.

---

## 0. Story (the why behind every decision)

- **The value of Effect is settled.** Engineers who have used Effect don't go back to plain
  TypeScript. Many effectify everything they touch.
- **The remaining complaint is verbosity.** `Effect.gen(function*() {`, `yield*` on every line,
  `Effect.fn("x")(function*`, and the service, error and schema ceremony.
- **"AI writes the code, so nobody reads it" is only half true.** When you do read it, during a
  review, while debugging, or while learning, the ceremony costs attention, and every token of it
  costs context and money.
- **EffectScript removes the ceremony, not the semantics.** Effect becomes the language's own
  syntax. You still get the same idiomatic Effect code, written with less noise.
- **"It looks like another language."** It is one, but it is a 100% superset of TypeScript and
  compiles to TS instantly. That makes adoption low-risk:
  - **No full buy-in.** Any TS is valid EffectScript, so you can mix both inside one file.
  - **Mix files freely.** `.ts` imports `.efx` and `.efx` imports `.ts`.
  - **Go back and forth.** The two-way compiler converts TS+Effect → `.efx` and back, so there is
    no lock-in.
  - **Your tools keep working.** tsc, Bun, Vite, Vitest, Astro, VS Code, and the AI skill all
    handle `.efx`.
- **Hypothesis (to be proven, roadmap §14):** models get better at Effect when they write `.efx`.
  In EffectScript the Effect way is the only syntax there is, so nobody has to remind the model to
  "do it the Effect way", and the code it reads and writes is denser and has less ceremony.
- **Status:** an experiment, but a working one. Each interop claim names the test or fixture
  that proves it, and its state: planned, implemented, locally tested, host-qualified, or released
  (review R15).

---

## 1. Intent

### What the user asked for

- A language that is a superset of TypeScript, enabled by a separate file extension, where Effect
  feels native and removes the most common complaint about Effect: verbosity (`Effect.gen`,
  `yield*`, `Effect.fn`, service, error and schema boilerplate, `pipe`).
- The language compiles to TypeScript so existing workflows and tools keep working: Bun, Vite,
  Vite+, tsc, editors.
- Lots of contextual keywords and an automatic prelude, so most files need no imports.
- TC39 proposals that fit, such as the pipeline operator. The language should feel like "the latest
  ECMAScript/TS".
- An Astro landing page with three-way before/after comparisons (plain TS, Effect TS, EffectScript).
- A browser playground that compiles both ways, EffectScript → TS+Effect and TS+Effect →
  EffectScript, deterministically and without AI. Where the reverse direction is hard, change the
  language.
- An AI skill teaching best-practice EffectScript, so "just use EffectScript" works for models.
- Real tooling: a compiler, a CLI, integrations, and editor support.

### Decisions made with the user

| Decision          | Choice                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| Name / extension  | **EffectScript**, `.efx`                                                 |
| Effect keyword    | `effect` (self-explanatory, same token cost as `fx`, the brand itself)   |
| Effect bind       | `await` inside `effect` code (in place of `yield*`), with guardrails: EFX8111, distinct editor styling and hover for effect awaits, a plain-English rewrite of Promise-await type errors, and docs that lead with `async` ↔ `effect` (decided after a multi-angle review; `run`/`perform`/postfix `.run` rejected) |
| Combinators       | Bare Effect builtins (`retry`, `timeout`, `all`, …); namespace follows the construct |
| Philosophy        | Effect primitives over plain TS: builtins, ambient capture, strict rules |
| Location          | Inside the Effect monorepo, following its conventions                   |
| Scope             | Everything: compiler, CLI, integrations, editor tooling, site, skill     |
| JSX               | One extension (`.efx`). The compiler auto-detects JSX (§3.2)            |
| Browser compiler  | Pure JS; no wasm needed (§9.2)                                          |

### Assumptions (open to correction)

- Output must read like hand-written Effect code. Reviewability and AI training quality depend on
  this, so no runtime helper library and no opaque helper calls. Readable local temporaries are
  allowed when correctness needs them (ADR-0003).
- The target is Effect v4 (`effect@4.0.0`, this repo's `packages/effect`).
- The first releases are explicitly experimental (`4.0.0-alpha.N`, ADR-0015). Some constructs are
  deferred to a roadmap (§14).

### Success criteria

1. Each construct in §4 compiles to TypeScript that type-checks with `strict` +
   `exactOptionalPropertyTypes` against this repo's `effect`. CI-verified.
2. Superset property: real-world `.ts` files (the whole `packages/effect/src` tree) parse as `.efx`
   and compile to themselves byte-for-byte.
3. Round-trip property: the canonicalization contract of §6.4 holds for every canonical fixture,
   with runtime traces and exported-declaration checks for each supported shape.
4. These all work: `bun run app.efx`, `node --import effectscript/register app.efx`, Vite, Vitest,
   Astro, `efx build`, `efx check` (real tsc diagnostics mapped to `.efx` lines), and VS Code
   IntelliSense in `.efx` files.
5. The site's playground converts in both directions live, in the browser.

---

## 2. Design principles

1. **Superset.** New syntax is contextual: it only triggers in positions where TypeScript has no
   valid parse. Renaming any `.ts`/`.tsx` file to `.efx` keeps its meaning. The one exception is
   the prelude (§4.13), which is documented.
2. **Idiomatic output.** Every construct has exactly one canonical desugaring into idiomatic Effect
   v4 (the `LLMS.md` style). No helper runtime.
3. **Reversible.** Every canonical desugaring can be recognized, so the reverse compiler can
   re-sugar it. If a construct cannot be reversed reliably, change the construct, not the
   guarantee. Code that cannot be re-sugared stays TypeScript, which is still valid EffectScript.
4. **No hidden effects.** Every effect is visible in the source. It is either marked by
   `effect`/`await`/`throw`, or it is an ambient call like `console.log` or `Date.now()` that is already
   a side effect in JavaScript; the compiler only routes those through Effect services (§4.15). So
   diffs are reviewable without type information. The compiler is purely syntactic and never needs
   the type checker.
7. **Magic only where it's safe.** Automatic behavior (spans, structured logs, scopes, service
   keys, concurrency, platform services, telemetry) appears only when its result is exactly what an
   Effect expert would write by hand, and when it can be reversed (§6).
8. **Stricter than TypeScript.** `effect` code is checked for Effect bug patterns that TS cannot see,
   such as a floating effect that is created but never run (§4.17). AI-written code is checked by
   the compiler, not just by convention.
5. **Familiar keywords first.** Reuse `await`, `throw`, `try/catch`, `using`, and TC39 syntax
   before inventing words. New keywords (`effect`, `schema`, `error`, `service`, `layer`, `main`,
   `match`, `when`, `defer`, `throws`, `needs`) are short and read as English.
6. **Tooling-native.** No fork of TypeScript or Bun. Compile to TS with exact source maps and Volar
   mappings, the same model Vue, Svelte, Astro, and MDX use.

---

## 3. Files and parsing

### 3.1 Extension

`.efx` is the only EffectScript extension. `.ets` was rejected because HarmonyOS ArkTS already uses
it on GitHub Linguist, in editors, and heavily in AI training data.

### 3.2 TS vs JSX mode (one extension)

TypeScript needs `.tsx` only because of two ambiguities: `<T>expr` casts and `<T>(x) => …` generic
arrows. EffectScript resolves them per file:

1. Choose the preferred mode. JSX is preferred if the text contains `</` or `/>`. Otherwise TS.
2. Parse in the preferred mode. On a syntax error, parse in the other mode.
3. If both fail, report the error from the attempt that got further.

The parse mode decides the output flavor: `.ts` (TS mode) or `.tsx` (JSX mode). Integrations use it
to pick loaders, and Volar uses it to pick `scriptKind`. Every valid `.ts` file parses in TS mode
and every valid `.tsx` file parses in JSX mode, so the superset property holds for both.

### 3.3 Parser

`acorn` + `@sveltejs/acorn-typescript` (the TS parser Svelte 5 maintains) + `efxPlugin`, an acorn
plugin class that extends the TS parser. A spike validated the approach: `effect` declarations, `effect`
blocks, `await`/`throw` inside `effect`, and left-associative `|>` all parse, with original source
positions. Notes from the spike:

- acorn's `TokenType` treats `binop: 0` as "not a binary operator". `|>` uses `binop: 0.5`, which
  is lower than `??`/`||` and higher than `?:` and assignment.
- `|>` is only tokenized outside type context (`!this.inType`).
- Contextual keywords require no line break before what follows, the same way `async` works, and
  they must not contain escape sequences.

---

## 4. Language reference

Each subsection gives the syntax, its canonical TypeScript desugaring (→), and its rules. In
examples, "TS" means the compiler output.

### 4.1 `effect` functions

```ts
export effect getUser(id: UserId): User throws UserNotFound {
  const users = await Users
  return await users.find(id)
} |> retry({ times: 3 })
```

→

```ts
export const getUser = Effect.fn("getUser")(function*(id: UserId): Effect.fn.Return<User, UserNotFound> {
  const users = yield* Users
  return yield* users.find(id)
}, Effect.retry({ times: 3 }))
```

| Form                                       | Desugars to                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `effect name(…) {…}` (declaration)             | `const name = Effect.fn("name")(function*(…) {…})`                         |
| `effect name(…) {…}` nested in a `service`     | span name `"Service.name"` (matches the Effect idiom)                       |
| `export default effect name(…) {…}`            | `const name = …` followed by `export default name`                         |
| `effect (…) => expr` / `effect x => expr`          | `Effect.fnUntraced(function*(…) { return expr })`                          |
| `effect (…) => { … }`                          | `Effect.fnUntraced(function*(…) { … })`                                     |
| `effect { … }` (expression)                    | `Effect.gen(function*() { … })`                                             |
| `effect { … }` using `this`                    | `Effect.gen({ self: this }, function*() { … })`                             |
| `{ effect m(…) { … } }` (object method)        | `{ m: Effect.fn("m")(function*(…) { … }) }` (`"Service.m"` inside a service) |
| `effect … {…} \|> p1 \|> p2` (declaration)     | extra `Effect.fn` arguments: `…}, p1, p2)`                                 |

Rules:

- Generics, `this` parameters, default parameters, and rest parameters pass through unchanged.
- `effect` declarations compile to `const`, so they are not hoisted. A `main` block (§4.10) always runs
  after the whole module has initialized.
- `effect` arrows must not reference `this`. Use an `effect` block or method instead. Error **EFX2001**.
- `effect` class methods are on the roadmap (§14). Error **EFX2002** with a hint.
- `effect` blocks at statement level are rejected. Error **EFX2003**: "an effect that is never used;
  did you mean `main { … }`?"

### 4.2 Return types: `throws` / `needs`

`: A throws E needs R` on an `effect` function, arrow, method, or service member:

- On `effect` functions → `: Effect.fn.Return<A, E, R>`. Without `throws`, E is `never`, so the
  signature becomes a checked contract.
- On service members → `Effect.Effect<A, E>` in the service shape.

`throws` without a return type is an error (**EFX2004**: write `: void throws E`).

### 4.3 Inside `effect` code

These rules apply to the body of the `effect` construct itself. Nested non-`effect` functions, arrows, and
classes are boundaries, the same way `async` scoping works. Nested `effect` constructs start their own
`effect` context.

| EffectScript                                | TypeScript                                                       |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `await e`                                   | `yield* e` (parenthesized when precedence requires it)           |
| `await [a, b]`                              | `yield* Effect.all([a, b], { concurrency: "unbounded" })`        |
| `await { a, b }`                            | `yield* Effect.all({ a, b }, { concurrency: "unbounded" })`      |
| `throw e;`                                  | `return yield* Effect.fail(e);`                                  |
| `throw new E(…)` (`E` is a local `error`)   | `return yield* new E(…);`                                        |
| `x ?? throw e` (throw expression)           | `x ?? (yield* Effect.fail(e))`; with a local `error` → `x ?? (yield* new E(…))` |
| `defer e`                                   | `yield* Effect.addFinalizer(() => e)`, and the function is scoped |
| `defer { stmts }`                           | `yield* Effect.addFinalizer(() => Effect.sync(() => { stmts }))`; with `await` inside → `Effect.gen(function*() { stmts })` |
| `using x = await e` (top level of the `effect` only, ADR-0011) | `const x = yield* e`, and the function is scoped |
| `for await (const x of s) { … }`            | `yield* Stream.runForEach(s, (x) => Effect.gen(function*() { … }))` |

`yield*` precedence: the compiler adds parentheses when the parent is a binary, unary, `as`,
`satisfies`, non-null, member, call-callee, tagged-template, or conditional-test expression. In
every other position it emits a bare `yield* e`.

Resource lifetimes (ADR-0011): `using x = await e` is only allowed directly in the top-level body
of an `effect`; anywhere else it is an error (**EFX2013**). `using x = e` without `await` keeps
native TS semantics. `defer` is function-scoped, like Go's: allowed anywhere in `effect` code, and
each executed `defer` registers a finalizer that runs when the `effect` exits, in reverse order. The
deferred expression is evaluated at cleanup time.

Scoping: `defer` and `using … await` mark the enclosing `effect` as scoped:

- On declarations → `Effect.scoped` becomes the first extra `Effect.fn` argument.
- On blocks → `.pipe(Effect.scoped, …)`.
- On a `main` block → the scope wraps the program.
- `effect` blocks that are `layer` constructors are never scoped, because the layer owns the scope.
  This is the idiomatic acquire-in-layer pattern.

`for await`: `continue` becomes `return`. `break`, labeled jumps, and `return` inside the loop are
errors (**EFX2010**).

### 4.4 `try` / `catch` / `finally` inside `effect`

The contract and its rationale are in ADR-0010. Inside `effect` code, **every** `try` compiles to
Effect, whatever it contains. Outside `effect` code, `try` is native JavaScript. A harmless added
`await` therefore never changes what a `catch` catches.

```ts
try { return await load(id) }
catch (e: NotFound) { return guest }
catch (e) { console.error(e); return guest }
finally { await Metric.increment(loads) }
```

→

```ts
return yield* Effect.gen(function*() { return yield* load(id) }).pipe(
  Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect))),
  Effect.catchTag("NotFound", (e) => Effect.gen(function*() { return guest }), (e) => Effect.gen(function*() { yield* Effect.logError(e); return guest })),
  Effect.ensuring(Effect.gen(function*() { yield* Metric.increment(loads) }))
)
```

**What each clause catches.** Clauses are alternatives over the original outcome of the `try`
block, checked in source order:

- `catch (e: A)` / `catch (e: A | B)` catches typed failures by `_tag`.
- An untyped `catch (e)` / `catch` (last clause only) catches every failure no typed clause
  matched, **and every defect of the `try` block**, such as a `JSON.parse` exception. Defects arrive
  as `Cause.UnknownError` with the thrown value in `e.cause` (Effect's convention for thrown
  values). So `e: E | Cause.UnknownError`, and `catch (e: UnknownError)` catches only thrown
  exceptions.
- **Interruption is never caught.**
- A failure or defect raised inside a handler propagates; sibling clauses never see it.
- `finally` runs on success, failure, defect and interruption.

| Catch clauses                                       | Handlers after `Effect.gen(…)`                                   |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| any clause that catches defects (untyped or `UnknownError`) | first `Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect)))` |
| `catch (e)` / `catch` only                          | `Effect.catch((e) => …)`                                          |
| one typed clause `catch (e: A)` / `(e: A \| B)` [+ untyped] | `Effect.catchTag("A" \| ["A", "B"], (e) => …[, (e) => …])`       |
| several single-tag typed clauses [+ untyped]        | `Effect.catchTags({ A: …, B: … }[, (e) => …])`                    |
| several typed clauses, some unions [+ untyped]      | nested `orElse`: `Effect.catchTag(K1, h1, (e) => Effect.catchTag(Effect.fail(e), K2, h2[, …]))` |
| `finally { … }`                                     | `Effect.ensuring(Effect.gen(…))`                                  |

Rules:

- **Several `catch` clauses are EffectScript syntax** and are only valid inside `effect`
  (**EFX2024** outside). An untyped clause must be last (**EFX2023**).
- **Tags.** A local `error`, or a `schema` with `_tag`, contributes its declared tag (custom
  `_tag` values included). Any other type uses the last segment of its name
  (`Errors.NotFound` → `"NotFound"`); `catchTag`'s signature makes the type check reject a tag that
  isn't in the error channel.
- **Control flow.** If every path of the `try` and `catch` blocks ends in `return`/`throw`, emit
  `return yield* …`. If no path does, emit `yield* …;`. Anything mixed is an error (**EFX2020**,
  with a refactoring hint). `break`/`continue` that cross the `try` boundary, and `return` in
  `finally`, are errors (**EFX2021**).

### 4.5 Bare Effect types

In any type position, a bare reference to a prelude data-type name that is not declared locally
expands to its namespaced form. For example, `Effect<A, E, R>` → `Effect.Effect<A, E, R>`.

The set is every prelude module whose same-named type exists, verified by a test against
`packages/effect/src`:

`Effect`, `Stream`, `Layer`, `Option`, `Result`, `Exit`, `Cause`, `Fiber`, `Scope`, `Queue`, `Ref`,
`Schedule`, `Duration`, `Chunk`, `Deferred`, `PubSub`, `Redacted`, `DateTime`, `HashMap`, `HashSet`,
`Sink`, `Channel`, `Metric`, `Config`, `Context`, `Brand`, `Semaphore`, `Latch`, `Pool`,
`ManagedRuntime`.

### 4.6 `schema`: data types that are TypeScript types

Three forms:

```ts
schema User {                              // class form → Schema.Class
  id: UserId
  name: string
  email?: string
  age = Int.check(isGreaterThan(0))        // `=` field: schema expression (Schema builtins)
  get label() { return `${this.name} <${this.email ?? "?"}>` }
}

schema UserId = string & Brand<"UserId">   // alias form → const + type
schema Point = { x: number; y: number }

schema Shape =                             // ADT form → TaggedClass per variant + Union
  | Circle { radius: number }
  | Square { side: number }
```

→

```ts
class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.optionalKey(Schema.String),
  age: Schema.Int.check(Schema.isGreaterThan(0))
}) {
  get label() { return `${this.name} <${this.email ?? "?"}>` }
}
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type
const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
type Point = typeof Point.Type
class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type
```

Tagged classes: if the class form contains a field `_tag: "Lit"`, it becomes
`Schema.TaggedClass<X>()("Lit", { …other fields })`. ADT variants are this shorthand with
`_tag` = the variant name. A unit variant is written `Empty {}`.

**Type → Schema mapping.** This applies in schema positions only. The table is maintained in code
and tested.

| Type                                        | Schema                                         |
| ------------------------------------------- | ---------------------------------------------- |
| `string` `number` `boolean` `bigint`        | `Schema.String` / `.Number` / `.Boolean` / `.BigInt` |
| `unknown` `any` `never` `null` `undefined` `void` | `Schema.Unknown` / `.Any` / `.Never` / `.Null` / `.Undefined` / `.Void` |
| `"a"` / `1` / `true`                        | `Schema.Literal("a")`                           |
| `"a" \| "b"` (all literals)                 | `Schema.Literals(["a", "b"])`                   |
| `T \| null` / `T \| undefined`              | `Schema.NullOr(T)` / `Schema.UndefinedOr(T)`    |
| `A \| B`                                    | `Schema.Union([A, B])`                          |
| `T[]`, `Array<T>`, `ReadonlyArray<T>`       | `Schema.Array(T)`                               |
| `[A, B]`                                    | `Schema.Tuple([A, B])`                          |
| `Record<K, V>`                              | `Schema.Record(K, V)`                           |
| `Set<T>` / `ReadonlySet<T>`                 | `Schema.ReadonlySet(T)`                         |
| `Map<K, V>` / `ReadonlyMap<K, V>`           | `Schema.ReadonlyMap(K, V)`                      |
| `Option<T>` / `Redacted<T>`                 | `Schema.Option(T)` / `Schema.Redacted(T)`       |
| `Date` / `URL` / `Uint8Array` / `Duration` / `BigDecimal` | `Schema.Date` / `.URL` / …        |
| `{ a: T; b?: U }`                           | `Schema.Struct({ a: T, b: Schema.optionalKey(U) })` |
| `b?: U \| undefined` (field)                | `b: Schema.optional(U)` (accepts an explicit `undefined`) |
| `T & Brand<"X">`                            | `T.pipe(Schema.brand("X"))`                      |
| Schema vocabulary: `Int`, `Finite`, `NonEmptyString`, `Trimmed`, `DateTimeUtc` | `Schema.Int`, … |
| `Defect`                                    | `Schema.Defect()`                               |
| `Name` (other identifier)                   | `Name` (must be a schema value)                  |
| `A.B` (qualified name)                      | `A.B` (schema value)                             |

Optional fields follow `exactOptionalPropertyTypes` (ADR-0013): `name?: T` → `Schema.optionalKey(T)`,
`name?: T | undefined` → `Schema.optional(T)`. This holds in class, `error`, ADT and alias forms.
`readonly` modifiers are ignored, because schemas are already readonly: `T[]` decodes to
`ReadonlyArray<T>`, and `Set`/`Map` to their readonly forms. That is deliberate, not exact
preservation of a mutable type. Unsupported type syntax
(conditional, mapped, `keyof`, generics of unknown names) is an error (**EFX3001**) that suggests
an `=` field.

### 4.7 `error`

```ts
error UserNotFound { id: UserId }
error DbError { cause: Defect }
```

→

```ts
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: UserId }) {}
class DbError extends Schema.TaggedError<DbError>()("DbError", { cause: Schema.Defect() }) {}
```

The body uses the same rules as the `schema` class form: fields, `=` fields, and methods. A
`_tag: "X"` field overrides the tag.

### 4.8 `service` and `layer`

```ts
service Users {
  effect find(id: UserId): User throws UserNotFound   // effectful member
  readonly size: number                           // plain member

  layer = effect {                                     // static readonly layer
    const sql = await SqlClient
    return {
      size: 0,
      effect find(id) {                                // span "Users.find"
        const rows = await sql`select * from users where id = ${id}`
        return rows[0] ?? throw new UserNotFound({ id })
      }
    }
  } |> provide(SqlLive)

  layer test = { size: 1, find: effect (id) => new User({ id, name: "Test" }) }
}
```

→

```ts
class Users extends Context.Service<Users, {
  find(id: UserId): Effect.Effect<User, UserNotFound>
  readonly size: number
}>()("myapp/users/Users") {
  static readonly layer = Layer.effect(Users, Effect.gen(function*() {
    const sql = yield* SqlClient
    return Users.of({
      size: 0,
      find: Effect.fn("Users.find")(function*(id) {
        const rows = yield* sql`select * from users where id = ${id}`
        return rows[0] ?? (yield* new UserNotFound({ id }))
      })
    })
  })).pipe(Layer.provide(SqlLive))

  static readonly layerTest = Layer.succeed(Users, Users.of({ size: 1, find: Effect.fnUntraced(function*(id) { return new User({ id, name: "Test" }) }) }))
}
```

Rules:

- **Members.** `effect m(…): A throws E` (a return type is required, error **EFX4001**), property
  signatures, and plain method signatures form the shape. `layer [name] = expr` members become
  `static readonly layer[Name]`. Other class members are errors (**EFX4002**).
- **Layer initializers:**
  - An `effect` block → `Layer.effect(Self, Effect.gen(…))`. Every top-level `return { … }` object
    literal is wrapped in `Self.of(…)`, which gives contextual typing for method parameters.
  - An object literal → `Layer.succeed(Self, Self.of({…}))`.
  - Any other expression is used as-is.
  - `|>` pipes apply to the resulting `Layer`.
- **Key** (ADR-0014). By default, `"<package>/<dir>/<module>/<Name>"`: `<dir>` is relative to the
  package root, minus a leading `src/`; `<module>` is the file name without extension, omitted when
  it equals `<Name>` (ignoring case) or is `index`. So `src/users/Users.efx` → `"myapp/users/Users"`,
  and `src/a.efx` → `"myapp/a/Users"`. A relative filename keeps its directories; an absolute one outside the package root keeps only
  its file name, so keys never contain absolute paths (ADR-0018). Without package information, the key is `"<Name>"`. To override:
  `service Users as "acme/Users" { … }`.
- `Context.Reference` services with defaults are on the roadmap.

### 4.9 Pipeline `|>` (TC39 Stage 2, both flavors)

Evaluation order is decided in ADR-0012.

- **Function style** (Effect style): if the right-hand side contains no topic `%`, `a |> f |> g`
  applies `f`, then `g`, to `a`:
  - If `a` is known to be pipeable → `a.pipe(f, g)`. Known pipeable means an `effect` block, a call
    to a module-level `effect` declaration that has no declaration pipes, or a module-level `const`
    initialized with one of those.
    - The rule is deliberately narrow. Module calls such as `Effect.runSync(…)` or
      `Option.getOrElse(…)` return plain values, so "rooted at a pipeable module" would produce
      `.pipe` on non-pipeables.
  - Otherwise → `pipe(a, f, g)`, with `pipe` imported automatically (hygienically, ADR-0009).
  - **Order:** Effect's `pipe` order. The head is evaluated, then every stage expression, then each
    application in turn (`head, make f, make g, apply f, apply g`). This is what Effect code
    written by hand does. It differs from a strictly sequential reading only when stage
    expressions have side effects.
- **Hack style** (the proposal as currently specified): a right-hand side containing the topic `%`
  substitutes the left-hand side. For example, `user |> Effect.map(%, f)` → `Effect.map(user, f)`.
  - **The head is always evaluated first.** A step is inlined only into the head, only when
    everything evaluated before `%` in the right-hand side is a literal, an identifier, or a member
    read on an imported module namespace (`Effect.map`), and only when `%` occurs exactly once and
    is evaluated unconditionally (not inside a function, a short-circuit operand, a conditional
    branch or an optional chain).
  - Otherwise the step becomes the function `($) => rhs` inside the surrounding `pipe(…)`, which
    preserves evaluation order. `makeValue() |> obj.method(%)` → `pipe(makeValue(), ($) =>
    obj.method($))`. The parameter name is fresh in the whole file.
  - An effect `await` inside a step that must become a function is an error (**EFX5002**: assign the
    awaited value to a variable first).
  - A `%` outside a pipeline right-hand side is a syntax error.
- **`await` covers the whole pipeline.** Inside `effect` code, `await x |> f |> g` means
  `await (x |> f |> g)` → `yield* x.pipe(f, g)`. This is the most common Effect pattern: pipe,
  then run.
- Consecutive steps of the same flavor are grouped into one `.pipe(…)`/`pipe(…)`.
- Precedence is below `??`/`||` and above `?:`/assignment/arrow. `a ? b : c |> f` pipes only `c`.
  Use parentheses to pipe the whole conditional. This precedence, and mixing both flavors, are
  EffectScript choices and differ from the current TC39 topic proposal.
- `|>` directly after an `effect` declaration, `main`, or `layer` attaches pipeables (§4.1, §4.8,
  §4.10). Hack style is not allowed there (**EFX5001**).

### 4.10 `main`

```ts
main {
  const user = await getUser(UserId.make("42"))
  await Console.log(user.name)
} |> provide(Users.layer)
```

→ emitted at the **end of the module** (so every declaration is initialized):

```ts
NodeRuntime.runMain(Effect.gen(function*() { … }).pipe(Effect.provide(Users.layer)))
```

The runtime comes from options (`node` by default; `bun`, `deno`, or `browser`). That selects
`@effect/platform-{node,bun,deno,browser}`, imported automatically. Only one `main` is allowed per
module (**EFX6001**).

### 4.11 `match` (TC39 pattern-matching shape → Effect `Match`)

```ts
const area = match (shape) {
  when Circle({ radius }): Math.PI * radius ** 2
  when Square({ side }): side ** 2
}
const label = match (status) { when "active": "✓"; when "banned": "✗"; default: "?" }
```

→

```ts
const area = Match.valueTags(shape, {
  Circle: ({ radius }) => Math.PI * radius ** 2,
  Square: ({ side }) => side ** 2
})
const label = Match.value(status).pipe(
  Match.when("active", () => "✓"),
  Match.when("banned", () => "✗"),
  Match.orElse(() => "?")
)
```

- **Patterns:**
  - `Tag`, `Tag(binding)`, or `Tag({ destructuring })`: matches `_tag`.
  - Literals: string, number, boolean, `null`, `undefined`.
  - `default`.
- Arms are separated by newlines, `;`, or `,`.
- **Output:** if every arm is a tag pattern and there is no `default` → `Match.valueTags`.
  Otherwise → `Match.value(x).pipe(Match.tag | Match.when …, Match.orElse | Match.exhaustive)`.
- **Inside `effect`:** if any arm contains `await` or `throw`, every arm becomes
  `(binding) => Effect.gen(function*() { return arm })` and the whole match is yielded.
- **Syntax:** `match (x) {` requires the `{` on the same line as `)`. Guards (`if (…)`) are on the
  roadmap.

### 4.12 Other adopted proposals

| Proposal                         | Status   | In EffectScript                                                                 |
| -------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Pipeline operator                | Stage 2  | §4.9, both function and Hack styles                                             |
| Pattern matching                 | Stage 1  | §4.11, compiled to Effect `Match`                                               |
| Throw expressions                | Stage 2  | Inside `effect` → typed failure. Outside → `(() => { throw e })()`                  |
| Do expressions                   | Stage 1  | `do { … }` in expression position → IIFE. Inside `effect` with `await` → `(yield* Effect.gen(…))`. The completion value is the last expression statement, recursing through `if`/`else` and blocks. `return`/`break`/`continue` that escape are errors (**EFX7001**) |
| Explicit resource management     | Stage 3+ | Native outside `effect`. `using x = await e` in `effect` → scoped acquisition (§4.3)   |
| Decorators                       | Stage 3  | Native TypeScript                                                               |

Considered and **not adopted**:

- Partial application (`f~(?, x)`): Hack pipes and Effect's two-way (data-first and data-last)
  APIs cover it.
- Records & Tuples: withdrawn.
- Function bind `::`: dead.
- Extractors: depend on pattern matching. Roadmap.
- Slice notation: unrelated to Effect.

### 4.13 Prelude (automatic imports)

A free identifier, meaning one not declared or imported anywhere in the file, that names an
`effect` module export is imported automatically:

`import { Effect, Schema, … } from "effect"`. Names inserted by the compiler (`Effect`, `Schema`,
`Layer`, `Context`, `Match`, `Stream`, `pipe`, runtime modules) are added the same way.

- The prelude includes every namespace export of `effect`'s `index.ts`, plus `pipe`, `flow`, and
  `identity`. It excludes names that shadow JS globals: `Array`, `BigInt`, `Boolean`, `Function`,
  `Iterable`, `Number`, `Record`, `String`, `Symbol`, `RegExp`.
- Subpath modules come from the export map of `packages/effect/package.json`; the table is
  generated and tested:
  - `effect/http`: `HttpClient`, `HttpRouter`, `HttpServer`, `FetchHttpClient`, …
  - `effect/http-api`: `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`, `HttpApiBuilder`, …
  - `effect/sql`: `SqlClient`, `Model`, …
  - `effect/cli`: `Command`, `Flag`, `Argument`
  - `effect/reactivity`: `Atom`
  - `effect/observability`: `OtlpTracer`, `OtlpLogger`, …
  - `effect/testing`: `TestClock`, …
  - Platform runtimes: `NodeRuntime` and `NodeServices` from `@effect/platform-<runtime>`.
- Opt-out: the `// @efx no-prelude` directive, or the `prelude: false` option.

#### Effect builtins (bare combinators)

Every value export of the `Effect` module is a **builtin** in `.efx`, for example:

```ts
getUser(id) |> retry({ times: 3 }) |> timeout("5 seconds") |> orDie
await sleep("1 second")
const [a, b] = await all([x, y])            // or `await [x, y]`
```

→ `Effect.retry(…)`, `Effect.timeout(…)`, `Effect.sleep(…)`, and so on. Output is always qualified
and idiomatic.

- **Resolution is lexical.** An identifier is a builtin only if it is *free*, meaning no local
  declaration, parameter, or import has that name in scope. `const map = …` keeps its meaning.
- **The namespace follows the construct.** A bare name resolves in the construct's namespace first,
  then falls back to `Effect`:
  - `layer` initializers and pipes, and `impl` pipes → `Layer` (`provide`, `provideMerge`, `launch`)
  - schema `=` fields → `Schema` (`Int`, `isGreaterThan`, `check`)
  - `atom` pipes → `Atom` (`keepAlive`)
  - `command` pipes → `Command` (`withSubcommands`, `withDescription`)
- **Excluded names keep their JS meaning:**
  - JS reserved words (`void`, `if`, `try`, `catch`, `do`, …)
  - JS, Web, and Node globals (`fetch`, `name`, `close`, `open`, `print`, `event`, `status`,
    `length`, `exit`, …)

  The set is generated from `globalThis`, the TypeScript `lib.dom`/`lib.es` declarations, and
  `@types/node`, and it is tested. Use the qualified form for excluded names (`Effect.void`,
  `Effect.exit`).
- `gen`/`fn`/`fnUntraced` are builtins too. Strict warning **EFX8101** suggests `effect` instead.
- **Reverse compiler:** `Effect.x(…)` becomes `x(…)` when `x` is free at that position and not
  excluded. It never drops a qualifier when the bare name would be ambiguous (shadowed).
- This is the one documented superset exception: a `.ts` file that references a *global* named,
  say, `Effect` would now resolve to the `effect` module.

### 4.14 Effect libraries as language constructs

Each construct below replaces one of the most ceremony-heavy library shapes. Each has one
canonical desugaring and one reverse shape (§6).

#### `test` / `describe` (`@effect/vitest`)

```ts
describe "Users" {
  test "finds a user" {
    const user = await getUser(UserId.make("1"))
    assert.strictEqual(user.name, "Ada")
  } |> provide(Users.layerTest)
  test.live "talks to the real clock" { await sleep(1) }
}
describe "with shared layer" with Users.layerTest {
  test "uses it" { … }
}
```

→

```ts
describe("Users", () => {
  it.effect("finds a user", () => Effect.gen(function*() { … }).pipe(Effect.provide(Users.layerTest)))
  it.live("talks to the real clock", () => Effect.gen(function*() { yield* Effect.sleep(1) }))
})
layer(Users.layerTest)("with shared layer", (it) => { it.effect("uses it", () => Effect.gen(…)) })
```

- Test modifiers: `test.live`, `test.skip`, `test.only` (→ `it.live`, `it.effect.skip`,
  `it.effect.only`). Test bodies are `effect` bodies. `it.effect` provides the `Scope`, so they are
  never wrapped in `Effect.scoped`.
- `describe`, `it`, `assert`, `expect`, and `layer` are imported automatically from
  `@effect/vitest`.

#### `doctest` (living docs, ADR-0042)

`doctest "../src/bank.efx" [with Layer]` turns every ` ```efx ` example in that file's doc comments
into one `it.effect` test. The assertions are `expr // => expected`, `await e // => throws Name`
and `await e // => dies`. It compiles to `describe(…)`, or to `layer(Layer)(…)` with `with`, around
the default export of the virtual module `"../src/bank.efx?doctest"`. The Vite plugin builds that
module, keeping every example on its doc-comment line. The full design is in
`2026-10-03-effectscript-docs-design.md`.

#### `api` / `group` / `impl` (HttpApi, `effect/http-api`)

```ts
export group UsersApi "users" {
  get list "/" (query: { search?: string }): User[]
  get getById "/:id" (params: { id: UserId }): User throws UserNotFound
  post create "/" (payload: NewUser): User
  middleware Authorization
}
export api Api "api" { UsersApi, SystemApi }

export const UsersHandlers = impl Api.users {
  const users = await Users
  return {
    list: ({ query }) => users.list(query.search) |> orDie,
    effect getById({ params }) { return await users.getById(params.id) }
  }
} |> provide(Users.layer)
```

→

```ts
export class UsersApi extends HttpApiGroup.make("users").add(
  HttpApiEndpoint.get("list", "/", { query: { search: Schema.optionalKey(Schema.String) }, success: Schema.Array(User) }),
  HttpApiEndpoint.get("getById", "/:id", { params: { id: UserId }, success: User, error: UserNotFound }),
  HttpApiEndpoint.post("create", "/", { payload: NewUser, success: User })
).middleware(Authorization) {}
export class Api extends HttpApi.make("api").add(UsersApi, SystemApi) {}

export const UsersHandlers = HttpApiBuilder.group(Api, "users", Effect.fn("Api.users")(function*(handlers) {
  const users = yield* Users
  return handlers.handleAll({
    list: ({ query }) => users.list(query.search).pipe(Effect.orDie),
    getById: Effect.fn("Api.users.getById")(function*({ params }) { return yield* users.getById(params.id) })
  })
})).pipe(Layer.provide(Users.layer))
```

- **Endpoint line:** `<method> <name> "<path>" [(sections)] [: Success] [throws E1 | E2]`. The
  method is one of `get post put patch del head options`. The sections are `params`, `query`,
  `payload`, and `headers`, typed with §4.6 types.
- **Name strings:** the identifier string is optional. It defaults to the camelCase name with a
  trailing `Api`/`Group` removed (`UsersApi` → `"users"`).
- **`impl` bodies** are `effect` bodies. Their top-level `return { … }` is wrapped in
  `handlers.handleAll(…)`. `effect` methods inside are spanned `Api.group.method`, and `impl` pipes
  resolve in the `Layer` namespace.
- `del` lowers to `HttpApiEndpoint.delete`. Several errors (`throws A | B`) become `error: [A, B]`.
  Optional section fields are `Schema.optionalKey` (ADR-0013).

#### `command` (CLI, `effect/cli`)

```ts
/** Create a task */
export command create(
  /** Task title */ title: NonEmptyString,
  /** Priority */ --priority: "low" | "normal" | "high" = "normal",
  /** Assignee email @alias a */ --assignee?: Email,
  --dryRun: boolean = false,
) {
  console.log(`Created "${title}" with ${priority} priority`)
}
```

→

```ts
export const create = Command.make("create", {
  title: Argument.String("title").pipe(Argument.withSchema(Schema.NonEmptyString), Argument.withDescription("Task title")),
  priority: Flag.Literals("priority", ["low", "normal", "high"]).pipe(Flag.withDefault("normal"), Flag.withDescription("Priority")),
  assignee: Flag.String("assignee").pipe(Flag.withSchema(Email), Flag.optional, Flag.withAlias("a"), Flag.withDescription("Assignee email")),
  dryRun: Flag.Boolean("dry-run").pipe(Flag.withDefault(false))
}, Effect.fn("create")(function*({ title, priority, assignee, dryRun }) {
  yield* Effect.log(`Created "${title}" with ${priority} priority`)
})).pipe(Command.withDescription("Create a task"))
```

- Parameters with a `--` prefix are flags; plain parameters are positional arguments.
- **Type mapping:** `string`/`boolean`/`Int`/`Finite`/`Date`/`Redacted` and literal unions use the
  native constructors (`Flag.String`, …, `Flag.Literals`). Any other type uses
  `String` + `withSchema(T)`.
- **Modifiers:** `= d` → `withDefault(d)`. `?` → `optional`.
- **Metadata comes from JSDoc:** the text becomes `withDescription` and `@alias` becomes
  `withAlias`.
- camelCase names become kebab-case flags.
- Compose subcommands with `|> withSubcommands([...])`.

#### `config` (`Config`)

```ts
config AppConfig {
  port: Port = 3000
  databaseUrl: Redacted
  logLevel: LogLevel = "Info"
  region?: "eu" | "us"
}
```

→

```ts
const AppConfig = Config.all({
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  databaseUrl: Config.Redacted("DATABASE_URL"),
  logLevel: Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info")),
  region: Config.option(Config.Literals(["eu", "us"], "REGION"))
})
```

- Keys become `SCREAMING_SNAKE_CASE`.
- Usage: `const cfg = await AppConfig`. A `Config` is itself an Effect.
- Field types:
  - `string`/`number`/`boolean` use the matching constructor.
  - `Int`, `Finite`, `Port`, `LogLevel`, `Redacted`, `Duration`, `URL`, `Date` and
    `NonEmptyString` use `Config.<Name>`.
  - A literal union uses `Config.Literals([…], KEY)`.
  - Any other name is a schema: `Config.schema(Name, KEY)`.
  - Anything else is **EFX3010**.

#### `atom` (`effect/reactivity`, for frontends)

`atom count = 0`, `atom doubled = (get) => get(count) * 2`, and `atom me = effect { … }` each compile to
`const x = Atom.make(…)`. Pipes apply to the atom, for example `|> keepAlive`.

#### Top-level `layer`

`layer AppLive = Users.layer & Posts.layer |> provide(SqlLive)` →
`const AppLive = Layer.mergeAll(Users.layer, Posts.layer).pipe(Layer.provide(SqlLive))`. Inside a
`layer` initializer, `&` means merge. `layer Worker = effect { … }` → `Layer.effectDiscard(Effect.gen(…))`,
for background tasks.

#### Bare service tags and platform services

- **Bare service tags:** `await M`, where `M` is a bare prelude module with a same-named service
  (`FileSystem`, `Path`, `Terminal`, `HttpClient`, `SqlClient`, …; the list is generated and
  tested), becomes `yield* M.M`. The same names in type positions expand like §4.5.
- **Platform services in `main`:** `main` automatically provides `<Runtime>Services.layer`
  (`NodeServices`/`BunServices`), so the file system, paths, terminal, and child processes just
  work, as they would in a language with native I/O.
- **Services you declare:** a `service` also gets **static accessors** for each `effect` member:

  ```ts
  static readonly find = (id: UserId) => Effect.flatMap(Users.asEffect(), (_) => _.find(id))
  ```

  So `await Users.find(id)` works from `.efx` and from plain `.ts`. Names that clash with
  `Context.Service` statics (`key`, `of`, `Service`, `name`, `length`, …) skip accessor generation
  (warning **EFX4003**).

  The exact accessor body is confirmed during implementation against v4's `Context.Service` API.

### 4.15 Ambient capture (magic, inside `effect` only)

JavaScript's ambient side effects become calls to the matching Effect services. The result is
traced, structured, testable (`TestClock`, seeded `Random`, `ConfigProvider`), and reversible.

| In `effect` code                         | TypeScript                                                   |
| ------------------------------------ | ------------------------------------------------------------ |
| `console.log/info/warn/error/debug(…)` | `yield* Effect.log/logInfo/logWarning/logError/logDebug(…)` |
| `Date.now()`                         | `(yield* Clock.currentTimeMillis)`                           |
| `Math.random()`                      | `(yield* Random.next)`                                       |
| `process.env.NAME`                   | `(yield* Config.String("NAME").pipe(Config.withDefault(undefined)))`: still `string \| undefined`, so `??`, `\|\|` and truthiness keep their meaning (ADR-0027) |

Only *free* `console`, `Date`, `Math` and `process` are captured. Writes to `process.env` are
left alone.
Nested non-`effect` functions are boundaries and keep native behavior. You can turn this off per file
with `// @efx no-ambient` or project-wide with `ambient: false`.

### 4.16 Observability (zero-config)

- **Automatic spans:** every `effect` declaration and method (`"name"`, `"Service.method"`), every
  `impl` handler (`"Api.group.endpoint"`), and every `command` handler (`"command"`).
- **Structured logs everywhere:** `console.*` in `effect` becomes Effect logging, with span and fiber
  context (§4.15).
- **Telemetry with no code:** with `observability: "otlp"` (option or `// @efx observability otlp`),
  `main` provides
  `Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson]))`.
  It reads the standard `OTEL_*` variables and is a no-op when no endpoint is configured
  (ADR-0029).

### 4.17 Strict mode (stricter than TypeScript)

Errors apply only to `effect` code, so the superset guarantee holds:

| Code    | Rule                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------- |
| EFX8001 | **Floating effect:** an expression statement that calls a prelude Effect module or a local `effect` without `await`. The effect would be created and never run. |
| EFX8002 | `yield` / `yield*` inside `effect` (use `await`); enforced by the parser as a syntax error (EFX1001) |
| EFX8003 | `Effect.runPromise/runSync/runFork/runCallback` inside `effect` (running effects inside effects)        |
| EFX8004 | `throw` of a primitive (`throw "x"`); declare an `error`                                          |
| EFX8005 | `catch (e: any)`                                                                                  |
| EFX8111 | `await` on a visible Promise inside `effect` (`fetch(…)`, `new Promise`, `Promise.*`, `.then(…)`, a call to a local `async` function). Hint: `await tryPromise(() => …)` |

Warnings apply anywhere in `.efx`. The `strict: true` option turns them into errors, and `efx fix`
applies the fixes:

| Code    | Rule                                                                                          |
| ------- | --------------------------------------------------------------------------------------------- |
| EFX8101 | TS-style Effect code (`Effect.gen`, `Effect.fn`, `.pipe`): `efx fix` runs `toEffectScript`     |
| EFX8102 | `async`, `new Promise`, or `.then` inside `effect`                                                |
| EFX8103 | `throw new Error(…)` inside `effect` (prefer a tagged `error`)                                    |
| EFX8104 | explicit `any`                                                                                |
| EFX8105 | `setTimeout`/`setInterval` inside `effect` (use `Effect.sleep`/`Schedule`)                         |
| EFX8106 | `fetch` inside `effect` (use `HttpClient`)                                                        |
| EFX8107 | `Promise.all/race/allSettled` inside `effect` (use `await [..]` / `all` / `race`)                  |
| EFX8108 | `JSON.parse` inside `effect` (decode with `schema` + `Schema.decodeUnknownEffect`)                 |
| EFX8109 | `new Date()` inside `effect` (use `DateTime.now`)                                                |
| EFX8110 | `T \| null` / `T \| undefined` in `service` member signatures (prefer `Option<T>`)                 |
| EFX8112 | `await` on an array built at runtime (`xs.map(…)`, `Array.from(…)`): its effects run one by one and the result is `undefined`; use `await all(…)`/`forEach` (ADR-0053) |

Type-level strictness:

- `efx init` writes the strictest `tsconfig`: `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
  `verbatimModuleSyntax`.
- `efx check` adds the Effect language service's diagnostics (floating effects, leaking
  requirements, and so on) on a best-effort basis (§7.3).

### 4.18 Frontend patterns (inspired by Foldkit)

Foldkit applies The Elm Architecture on top of Effect: one Schema model, messages as tagged unions,
a pure `update`, and side effects as values. EffectScript expresses this with constructs it already
has, so no runtime is bundled:

- **Messages** are ADT `schema` declarations.
- **`update`** is a `match`.
- **Commands** are `effect` values.
- **State** is `atom`.
- **Views** use JSX in `.efx` with `@effect/atom-react`.

The skill and the site include a TEA counter and a todo example. A dedicated `app` construct is on
the roadmap.

### 4.19 Superset guarantee and contextual keyword triggers

| Keyword / syntax  | Triggers only when                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `effect`              | Followed on the same line by an identifier (declaration), `{` (block), or arrow parameters followed by `=>` (arrow; speculative parse with `effect` falling back to an identifier) |
| `schema` `error` `service` `group` `api` `command` `config` `atom` `layer` | Statement position (optionally after `export`), followed on the same line by an identifier |
| `test` `describe` (+ `.live/.skip/.only`) | Statement position, followed on the same line by a string literal |
| `doctest`         | Statement position, followed on the same line by a string literal (docs spec §2.3)      |
| `impl`            | Expression position, followed on the same line by `Ident.ident {`                        |
| `main`            | Statement position, followed by `{` on the same line                                     |
| `defer`           | Statement position inside `effect`, followed by an expression on the same line              |
| `layer` (member)  | `service` body member position                                                           |
| `--name` params   | `command` parameter lists only                                                           |
| `get`/`post`/…, `middleware` | `group` body lines only                                                         |
| Ambient capture   | Inside `effect` only, for free (non-shadowed) `console`, `Date`, `Math`, `process`           |
| `throws` `needs`  | Directly after a return-type annotation                                                  |
| `match` / `when` / `default` | `match (…) {` on one line, in expression position                             |
| `\|>` `%`         | Expression context (never inside types)                                                  |
| `throw` / `do`    | Expression position (statement forms keep their meaning)                                |

Each trigger is a position where TypeScript has no valid parse, so the meaning of valid TS never
changes. CI checks this with the identity test (§11).

---

## 5. Compiler architecture (`packages/effectscript/core/src/compiler`)

```
source.efx
  │  parse (§3): acorn + acorn-typescript + efxPlugin, TS→JSX fallback
  ▼
ESTree + TS AST (original offsets) ── analyze: scopes, effect contexts, declared names, local `error`s
  ▼
transform: walk the AST and emit edits into MagicString(source)
  │   - only keyword/token overwrites, insertions at node boundaries, and node moves
  │   - never overwrite a range that contains other edit points (magic-string constraint)
  ▼
emit: code (.ts/.tsx) + SourceMap v3 + Volar CodeMapping[] + diagnostics[]
```

Modules (one purpose each):

- `parser/plugin.ts`: the `efxPlugin` acorn extension (tokens, statements, expressions, members).
- `parser/parse.ts`: TS/JSX mode selection and fallback; returns `{ ast, mode }` or diagnostics.
- `analyze/scope.ts`: declared names per scope, free identifiers, `this` usage, `effect` contexts.
- `transform/*.ts`: one file per construct (`effect`, `await-throw`, `try`, `schema`, `error`,
  `service`, `pipeline`, `match`, `main`, `types`, `proposals`, `prelude`). Each takes `(node, ctx)`
  and edits through `ctx.s`.
- `schema/mapping.ts`: the type → Schema table (shared with the reverse compiler).
- `emit/mappings.ts`: converts magic-string's decoded hi-res map into Volar mappings (runs where
  both offsets advance together become one mapping; overwritten tokens map as whole ranges).
- `diagnostics.ts`: codes, messages, and code frames.
- `index.ts`: public API.

### 5.1 Public API

```ts
toTypeScript(source: string, options?: CompileOptions): CompileResult
toEffectScript(source: string, options?: ConvertOptions): ConvertResult
parse(source: string, options?): ParseResult           // for tooling

interface CompileOptions {
  filename?: string                 // used for diagnostics, the service key, and output flavor
  packageName?: string              // service key derivation
  packageRoot?: string
  runtime?: "node" | "bun" | "deno" | "browser"
  prelude?: boolean                 // default true
  rewriteImportExtensions?: "ts" | "js" | false   // ./x.efx → ./x.ts (default false)
  sourceMap?: boolean
}
interface CompileResult {
  code: string
  mode: "ts" | "tsx"
  map: SourceMapV3 | undefined
  mappings: ReadonlyArray<CodeMapping>   // Volar-compatible
  diagnostics: ReadonlyArray<Diagnostic> // success = no diagnostic with severity "error" (ADR-0017)
}
```

The compiler only depends on `acorn`, `@sveltejs/acorn-typescript`, and `magic-string`. It has no
Node APIs, so it runs in the browser unchanged.

---

## 6. Reverse compiler: `toEffectScript` (TS+Effect → EffectScript)

### 6.1 Approach

Parse TypeScript with the same parser (in TS or JSX mode), match canonical Effect shapes, and
re-sugar with magic-string. It is deterministic and needs no AI. Any node that doesn't match a
canonical shape is left as TypeScript. That is always valid EffectScript, so conversion is safe at
any granularity.

### 6.2 Canonical shapes

Each row is the inverse of a row in §4. All rows are implemented: §4.1–4.13 in Plan 6, and the
library constructs and ambient forms in Plan 7 (ADR-0031).

| TypeScript shape                                                                    | EffectScript                         |
| ----------------------------------------------------------------------------------- | ------------------------------------ |
| `const x = Effect.fn("x")(function*(…) {…}, …ps)` (`"Svc.x"` inside service `Svc`)  | `effect x(…) {…} \|> …ps`                 |
| `Effect.fnUntraced(function*(…) {…})`                                               | `effect (…) => {…}`; a single `return e` body → `effect (…) => e` |
| `Effect.gen(function*() {…})` / `Effect.gen({ self: this }, …)`                     | `effect {…}`                              |
| `: Effect.fn.Return<A, E, R>`                                                       | `: A throws E needs R`                |
| `yield* e` inside those generators                                                  | `await e`                             |
| `yield* Effect.all(xs, { concurrency: "unbounded" })` with an array/object literal | `await [ … ]` / `await { … }`         |
| `return yield* Effect.fail(e)` / `return yield* new E(…)`                           | `throw e` / `throw new E(…)`          |
| A native `throw e` inside an Effect generator (a defect)                            | stays TypeScript (a §6.3 blocker; ADR-0030 amendment 2) |
| `yield* Effect.addFinalizer(() => e \| Effect.sync(() => {…}) \| Effect.gen(…))` in a frame with the forward scope (`Effect.scoped` first pipe or wrapper, or a layer constructor) | `defer e` / `defer {…}` (the scope is removed) |
| `Effect.gen(…).pipe(catch…/ensuring)` in the §4.4 shape                             | `try … catch … finally`               |
| `x.pipe(f, g)` / `pipe(x, f, g)`                                                    | `x \|> f \|> g`                       |
| `Effect.Effect<…>` etc. (§4.5 set)                                                  | `Effect<…>`                           |
| `class X extends Schema.Class<X>("X")({…}) {…}`                                     | `schema X {…}`                        |
| `class X extends Schema.TaggedClass<X>()("T", {…}) {…}`                             | `schema X { _tag: "T"; … }`; a run of these plus `Schema.Union([...])` → the ADT form |
| `const X = <schema expr>` plus `type X = typeof X.Type`                              | `schema X = <type>`                   |
| `class X extends Schema.TaggedError<X>()("X", {…}) {…}`                             | `error X {…}` (or a `_tag` field when the tag differs) |
| `class S extends Context.Service<S, {…}>()("key") { static readonly layer… }`       | `service S [as "key"] { … layer … }` |
| `Match.valueTags(x, {…})` / `Match.value(x).pipe(Match.tag/when…, orElse/exhaustive)` with expression arrows | `match (x) { when … }` |
| `<Runtime>.runMain(e)` as the last statement                                         | `main {…} \|> …`                      |
| `describe(…, () => {…})` with `it.effect(name, () => Effect.gen(…))`                 | `describe "…" { test "…" {…} }`       |
| `HttpApiGroup.make(…).add(HttpApiEndpoint.<m>(…), …)` class / `HttpApi.make(…).add(…)` class | `group …` / `api …`         |
| `HttpApiBuilder.group(Api, "g", Effect.fn(function*(handlers) { …; return handlers.handleAll({…}) }))` | `impl Api.g { … }` |
| `Command.make(name, { Flag/Argument… }, Effect.fn(…))`                               | `command name(…)`                     |
| `Config.all({ k: Config.X("K")… })`                                                  | `config …`                            |
| `const x = Atom.make(e)` / `Layer.mergeAll(…)` / `Layer.effectDiscard(Effect.gen(…))` | `atom x = e` / `layer … = a & b` / `layer … = effect {…}` |
| `yield* Effect.log*(…)`, `Clock.currentTimeMillis`, `Random.next`, `Config.String("X")` in generators | ambient forms (§4.15) |
| `yield* M.M` (bare-service-tag set)                                                  | `await M`                             |
| `Effect.x(…)` / `Layer.x(…)` in layer pipes / … where `x` is free and not excluded    | `x(…)` (builtins, §4.13)              |
| `import { …prelude names } from "effect"`                                            | removed                               |

Schema fields use the reverse of the §4.6 table. A field whose schema is not in the table becomes
an `=` field, so it is lossless.

### 6.3 Blockers (leave the node as TypeScript)

A generator stays `Effect.gen`/`Effect.fn` TypeScript, which is still valid EffectScript, when its
direct body contains any of these. "Direct" means its `effect` level, outside nested functions.

- **Statements that would change meaning:**
  - A native `throw`: a defect, where `throw` in `effect` code is a typed failure.
  - A native `try`. Under §4.4 every `try` in `effect` code is an Effect `try`.
  - A `using` declaration. In `effect` code it acquires a scoped resource (ADR-0011).
  - `console.*`, `Date.now()`, `Math.random()` or `process.env`, which would be captured
    (§4.15) until Plan 7 adds the ambient rows.
- **Strict-mode errors:** an effect that is created and never yielded (EFX8001), `run*` (EFX8003),
  or an awaited Promise (EFX8111). A `throw` of a primitive stays `await fail(…)` (EFX8004).
- `yield` without `*`.
- `arguments`.
- `this` in an `Effect.fnUntraced` body.
- **Span names:** an `Effect.fn` span name that doesn't match the binding (or the `Svc.x` rule), or
  span options.
- **Statement position:** an `Effect.gen(…)` used as a statement (EFX2003).

A label can't cross a JavaScript function boundary, so the spec's earlier label blocker can't occur.

Shapes that the forward compiler would produce differently also stay TypeScript, under
ADR-0030's identity rule:

- `.pipe` on a head that isn't known to be pipeable;
- a pipe step that would parse differently after `|>`;
- a class with instance properties;
- a typed `static layer`;
- a hand-written static in a `Context.Service` class;
- a `runMain` for another runtime.

The converter reports what it left as TS and why, for example in `efx convert --explain` and in the
playground's notes panel.

### 6.4 Round-trip contract

Reversibility is canonicalization plus semantic preservation (from review R07), not recovery of
arbitrary source text:

```text
toEffectScript(toTypeScript(efx)) = normalizeEFX(efx)
toTypeScript(toEffectScript(ts))  = canonicalTS(ts)   for supported shapes, preserving runtime
                                                      behavior and public types
Unsupported shapes stay TypeScript, with an explanation.
```

- `normalizeEFX` and `canonicalTS` are defined construct by construct, next to each canonical
  shape. They never permit an observable order change. Import order and module side effects are
  preserved. Moving `runMain` is allowed only because `main` is defined to run after module
  initialization (§4.10).
- Several sources can share one output (for example `T[]`, `Array<T>` and `ReadonlyArray<T>` in a
  schema). The reverse direction produces one canonical spelling; that loss is listed explicitly
  per shape.
- A rewrite applies only where compiling its result reproduces the input TypeScript (ADR-0030).
  For compiler output that means byte for byte. For any other TypeScript it means the same code
  tokens (trailing commas aside), the same line breaks where automatic semicolon insertion depends
  on them, and the same comments in order. `toEffectScript` checks this at
  conversion time (ADR-0030 amendment 2). When the check fails, it keeps only the top-level
  statements that verify and notes the others.
- **EffectScript-side normalizations** (`toEffectScript(toTypeScript(efx))` differs from `efx`):
  - `Effect.Effect<A>` → `Effect<A>` and `Effect.succeed(…)` → `succeed(…)`. A builtin stays
    qualified when its name is bound anywhere in the file.
  - Prelude imports that the prelude restores are removed.
  - `using x = await e` → `const x = await e`.
  - `main` moves to the end of the module.
  - Parentheses the forward compiler restores, such as `(await t) + n`, are dropped.
  - `ReadonlyArray<T>` in a schema → `Array<T>`.
  - Class members of a `schema` come after its fields.
  - Explicit `Effect.fn.Return<A, never>` keeps `throws never`.
  - A first Hack step that the forward compiler inlined stays a call.
  - `do { … }` comes back as `await effect { … }`.
  - `for await` comes back as `await Stream.runForEach(…)`.
  - Ambient forms replace the effect spellings in `effect` code: `await log(x)` → `console.log(x)`,
    `await Clock.currentTimeMillis` → `Date.now()`, and `process.env["X"]` → `process.env.X`.
  - `group`/`api` declarations are written in their canonical layout. An identifier equal to the
    default is dropped, and `T[]` becomes `Array<T>`.
  - `command` parameters are written one per line, with JSDoc for descriptions and aliases.
- Canonical outputs reach a fixed point: converting again changes nothing.
- Effect APIs are recognized by binding origin (their import), never by spelling (ADR-0009). A
  user object named `Effect` is never re-sugared.
- Comments and documentation are preserved where the shape keeps their anchor, and each shape that
  drops them says so. Side-effectful imports get dedicated cases.
- **Evidence:**
  - `core/test/reverse-golden.test.ts`: every golden fixture round-trips byte for byte, and its
    reverse is snapshotted as `<name>.reverse.efx`.
  - `core/test/reverse-corpus.test.ts`: the `ai-docs/src` corpus is token- and
    comment-equivalent.
  - Per-shape tests in `core/test/reverse-*.test.ts`.

## 7. Packages and integrations

All live under `packages/effectscript/`, registered in the monorepo (§10).

| Path                     | npm name                 | Purpose                                                                 |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------- |
| `core/`                  | `effectscript`           | Compiler + reverse compiler (`effectscript/compiler`, browser-safe), CLI `efx`, `effectscript/bun`, `effectscript/vite`, `effectscript/register`, AI skill files |
| `language/`              | `@effectscript/language` | Volar language plugin, `efx-tsc`, TS server plugin, `efx-language-server` |
| `vscode/`                | `effectscript-vscode` (private) | VS Code extension                                               |
| `site/`                  | private                  | Astro landing page + playground                                          |
| `examples/`              | private                  | Runnable example app and tests (Bun, Node, Vitest)                      |

### 7.1 CLI: `efx` (built with `effect/unstable/cli`; command handlers written in `.efx`)

- `efx build [paths] [--outDir] [--target ts|js] [--runtime]`: compile `.efx` files to
  `.ts`/`.tsx`/`.js` plus maps. Relative `.efx` imports are rewritten.
- `efx convert [paths] [--write] [--explain]`: TS+Effect → `.efx` (the codemod).
- `efx print <file> [--to ts|efx]`: print one conversion to stdout, useful for reviews and AI.
- `efx run <file> [-- args]`: run an `.efx` (or `.ts`) file. The standalone binary runs it with its
  embedded Bun runtime (§7.5), so nothing else needs to be installed. From npm, it uses a local Bun
  if present, otherwise Node with `effectscript/register`.
- `efx check`: delegates to `efx-tsc` from `@effectscript/language`.
- `efx docs [paths] [--out docs/api] [--check] [--strict]`: write signature-first Markdown API pages
  for Blume from doc comments, or with `--check` only report doc problems (docs spec §3, ADR-0043,
  Plan 12).
- `efx init`: add tsconfig/bunfig/vite settings, scripts, the skill, and a Blume docs site in
  `docs/` to a project.
- `efx setup`: detect the editors and coding agents installed on this machine and offer to set each
  one up (§7.5).
- `efx convert --ai`: after the mechanical conversion, hand the leftovers to a locally installed
  coding agent along with the skill (§7.5).
- `efx doctor`: report what is installed and configured (runtime, editors, agents, project) and
  what is missing.
- `efx skill [--dir]`: install the AI skill (default `.claude/skills/effectscript`).

**Status (Plan 8, ADR-0032):**

- **Implemented:** `build`, `check`, `run`, `print`, `convert` (the mechanical pass with
  verification), `init` and `doctor`.
- **Pending:** `setup`, `convert --ai` and `skill` are Plan 10.
- **Runtime:** `efx run` picks Bun only when the project can run `main` on it (ADR-0034).
- **Passing arguments through:** `check` and `run` pass extra arguments after `--`.
- **Dry run:** `convert` reports by default; `--write` converts on the branch
  `effectscript/convert`.

Dogfooding: the CLI's command modules are `src/cli/*.efx`. `pnpm codegen` compiles them into
checked-in `src/cli/*.ts`, formatted with dprint, the same way the monorepo handles generated
barrels. That keeps `pnpm check`/`lint` meaningful and proves the compiler on real code.

Gaps that dogfooding found in the constructs, and how the CLI works around them:

- `command` has no variadic parameters, so `check`, `run` and `convert` use plain
  `Command.make` inside the `.efx` file.
- `override` was rejected in `error` bodies. Fixed in the parser.
- The prelude puts generated imports above the leading comment.

### 7.2 Runtime integrations

**Status (Plan 9):**

- **Implemented:** the Bun plugin and preload, the Vite plugin, and the examples package.
- **Imports:** write `.efx` imports with their extension (ADR-0035). The Bun plugin doesn't resolve
  extensionless imports; Vite does, through `resolve.extensions`.
- **Bun:** with the `bunfig.toml` preload, `bun ./x.efx`, `bun run x.efx` and `bun test` work.
  Bun ignores the inline source map, so stack traces show the compiled lines.
- **Vite:** two plugins, compile and then strip types with Vite's `transformWithOxc`. Vite's
  built-in oxc plugin only matches `.ts`/`.tsx`/`.jsx`/`.mts` ids. In dev, a direct `.efx`
  request (an HTML entry) is served as JavaScript.

- **Bun:** `effectscript/bun` exports a `BunPlugin` (`onLoad` filter `/\.efx$/` → `{ contents,
  loader: "ts" | "tsx" }`, runtime `bun`) and a `preload` entry for `bunfig.toml`, so `bun run
  x.efx` and `bun test` work. The plugin also resolves extensionless imports that point to `.efx`.
- **Vite** (and Vitest, Astro, Vite+): `effectscript/vite` (`enforce: "pre"`) transforms `.efx` →
  TS, then strips types with Vite's bundled transform (oxc/esbuild), returning code and source map.
  It adds `.efx` to `resolve.extensions`. The runtime defaults to `browser` for client builds and
  `node` for SSR/Vitest.
- **Node:** `effectscript/register` uses `module.registerHooks`. It compiles `.efx`, then runs
  Node's `stripTypeScriptTypes` in transform mode (enums included), falling back to strip mode
  where transform mode is unavailable (ADR-0021, ADR-0024). JSX output is rejected (EFX1101).
  Qualified on Node 24.21.

### 7.3 Editor and type checking (`@effectscript/language`)

- `languagePlugin`: a Volar `LanguagePlugin`. For `.efx`, `createVirtualCode` runs `toTypeScript`
  and exposes one TS/TSX virtual file with the mappings from §5. `typescript.extraFileExtensions`
  registers `efx`.
- `efx-tsc`: `@volar/typescript`'s `runTsc` with the plugin. It is real `tsc` with diagnostics
  mapped back to `.efx` positions, the way `vue-tsc` works.
- TS server plugin (`createLanguageServicePlugin`): gives full IntelliSense in `.efx` and lets
  `.ts` files import `.efx` modules. It decorates syntactic diagnostics with EffectScript compiler
  diagnostics. When parsing fails mid-edit, the plugin compiles with recovery (ADR-0020): the
  failing lines are neutralized, the rest compiles, and the original lines are spliced back so
  completion keeps working. Only if that fails is the virtual code the source verbatim.
- **`await` guardrails in the editor:**
  - `await` inside `effect` bodies gets its own semantic token (`keyword` with modifier `effect`), so themes color it differently.
  - Hovering an effect `await` shows "Effect bind (`yield*`): runs this effect here and short-circuits on failure".
  - TS errors caused by awaiting a Promise inside `effect` are rewritten into "Cannot `await` a Promise inside `effect` — use `await tryPromise(() => …)`".
- `efx-language-server`: the standalone LSP (`@volar/language-server` +
  `volar-service-typescript`) for Neovim, Helix, Zed and others (ADR-0040).
  - EffectScript's own results are added by wrapping each project's language service, so they
    stay in `.efx` positions: compiler diagnostics, the bind hover, and bind semantic tokens
    (`keyword` + `effect`).
  - **TypeScript 6:** the `tsdk` option, else the workspace's, else the server's own.
  - **`efx lsp`:** runs the project's server (npm), or the one in the standalone binary with its
    bundled TypeScript.
  - Neovim and Helix configs are in the language package README.
- **The guardrails' source** (ADR-0039): the compiler's `CompileResult.binds` lists every `await`
  lowered to `yield*`.
  - **TS server plugin:** quick info and semantic diagnostics are proxied.
  - **VS Code:** binds are decorated with the theme color `effectscript.effectAwait`, because
    TypeScript's semantic tokens have no keyword type.

### 7.4 VS Code extension

- A language contribution `effectscript` for `.efx`, a language configuration, and an icon.
- A TextMate grammar `source.efx` that includes `source.tsx`, plus an injection grammar for the
  EffectScript keywords, `|>`, `%`, and the `throws`/`needs` clauses. The site's Shiki highlighting
  reuses this grammar.
- `contributes.typescriptServerPlugins`: `@effectscript/language` with
  `languages: ["effectscript"]`. VS Code's built-in TS server then serves `.efx` files (hybrid
  mode), so no separate server is needed in VS Code.
- Commands: **Show Compiled TypeScript** (a live side-by-side virtual document), **Convert File to
  EffectScript**, and **Convert File to TypeScript**.
  - The conversions are one undoable `WorkspaceEdit` that also rewrites importers, and the
    touched files are saved.
  - A conversion whose target exists is refused (ADR-0041).
- **Packaging** (`scripts/package.ts`): `out/extension.cjs`, and the TS plugin as a CommonJS pack
  in `node_modules/@effectscript/language`, so it runs on VS Code ^1.95's Node without
  `require(esm)`. Icons come from `brand/icons/editor`.
- **Tested:** the `.vsix` is tested end to end in VS Code 1.138, in a throwaway profile.

---

### 7.5 Distribution and onboarding: from zero to EffectScript in one minute

```bash
brew install effectscript-lang/tap/effectscript   # or: npm i -D effectscript / curl -fsSL https://effectscript.dev/install | sh
efx setup                   # editors + agents on this machine (Plan 10b)
efx convert                 # this repo → EffectScript (mechanical; add --ai for the rest, Plan 10b)
```

**Channels:**

- **npm:** `npm i -D effectscript` (project-local; `npx`/`bunx effectscript` also work).
- **Homebrew:** `brew install effectscript`, from the `EffectScript-Lang/homebrew-tap` tap first (`brew install effectscript-lang/tap/effectscript`, ADR-0036) and homebrew-core
  later.
- **Install script:** `curl -fsSL https://effectscript.dev/install | sh`, served by the site.
  It is `packages/effectscript/core/distribution/install.sh` (ADR-0038):
  - It detects the OS, architecture, Rosetta and musl.
  - It verifies `SHASUMS256.txt` and runs the binary before installing it into
    `~/.effectscript/bin`.
  - It prints the PATH line and never edits shell startup files.
  - Settings: `EFX_VERSION`, `EFX_INSTALL` and `EFX_DOWNLOAD_BASE`.
- **Later:** a PowerShell installer, winget and scoop. Until then, Windows users download the zip
  or use npm.

**Standalone binary** (ADR-0037, ADR-0038):

- **Build:** `bun build --compile` (`scripts/standalone.ts`). The targets are darwin-arm64,
  darwin-x64, linux-x64, linux-arm64, linux-x64-musl, linux-arm64-musl and windows-x64. On Alpine,
  the musl builds need `apk add libstdc++ libgcc`.
- **Publishing:** `.github/workflows/effectscript-release.yml` publishes them on GitHub Releases
  of `EffectScript-Lang/effect-lang` (tag `effectscript@<version>`) as `efx-<target>.tar.gz` or
  `.zip`, with `SHASUMS256.txt` and `install.sh`, and updates the tap's formula.
- **Contents:** the Bun runtime, the compiler and the Bun plugin. The language server (phase 8)
  and the skill files (phase 9) join later. Users need no Node, Bun or npm to run `.efx` files.
- **How `efx run` works:** the binary runs the entry on its own Bun. It re-runs itself with
  `BUN_BE_BUN=1` and `--preload` of the EffectScript plugin, unpacked into the user cache
  directory. `main` targets Bun when the project has `@effect/platform-bun`, and Node's platform
  otherwise.

  An in-process import can't resolve workspace packages whose `exports` point at `.ts` sources
  inside a compiled binary (Bun 1.4), so the binary doesn't use one.
- **Resolving `effect`:**
  - inside a project → the project's own install;
  - a lone file outside a project → Bun's auto-install.
- A locally installed Bun or Node is never required. `efx run --runtime node` runs on Node when
  the project has `effectscript` installed.
- **Cross-platform checks:** `scripts/xplatform.sh` runs on a developer Mac. It runs:
  - every Linux build and `install.sh` in Docker (Debian, Ubuntu, Alpine; arm64 and amd64);
  - the formula with real Homebrew;
  - darwin-x64 under Rosetta;
  - windows-x64 in Parallels (`--windows`).

**`efx setup`** is interactive, writes only after you confirm each item, and supports `--yes` for
CI. It detects:

- **VS Code-family editors** (VS Code, Cursor, Windsurf, VSCodium): installs the EffectScript
  extension through each editor's CLI (`code`/`cursor`/`windsurf`/`codium --install-extension`).
  It uses the VS Code Marketplace or Open VSX, with the `.vsix` bundled in the binary as a
  fallback.
- **Neovim:** writes an `lsp/effectscript.lua` config (Neovim 0.11 `vim.lsp.config`) that points
  at `efx lsp`, plus filetype detection for `.efx`.
- **Helix and Zed:** `languages.toml` / extension settings that point at `efx lsp`. The Zed
  extension itself is a Plan 5 stretch goal.
- **JetBrains IDEs:** instructions for LSP4IJ that point at `efx lsp`; a native plugin is on the
  roadmap.
- **Coding agents** (Claude Code, Codex, Cursor, Gemini CLI, opencode): installs the EffectScript
  skill in each agent's skill or rules location, user-wide or per project. Where the agent
  supports it (for example, Claude Code plugins with LSP servers), it also registers `efx lsp` and
  `efx check` as tools.

**`efx convert`** turns a whole project into EffectScript:

1. **Safety:** requires a clean git working tree (or `--force`) and works on a new branch,
   `effectscript/convert`.
2. **Mechanical pass** (deterministic, no AI): `toEffectScript` runs on every `.ts`/`.tsx` file.
   Files are renamed to `.efx`, relative imports are updated, and a report lists everything left
   as TS, with the reason.
3. **Verification:** `efx check` (type check) and the project's test command must pass. Otherwise
   the conversion is reverted file by file down to the last green state.
4. **`--ai` pass (opt-in):** for the regions the mechanical pass left as TS, `efx` runs a coding
   agent already installed locally (`claude -p`, `codex exec`, or another detected agent) with the
   EffectScript skill. It uses the "left as TS because …" notes as task context. Each AI edit is
   kept only if verification still passes. No code is sent anywhere except through the user's own
   agent.

**One-command onboarding:** `efx setup` and `efx convert` are offered at the end of `brew install`
(via the formula's caveats) and at the end of `efx init`.

### 7.6 Versioning, the Effect version header, and release automation

**Lockstep versions.** EffectScript's major.minor follows Effect's; the patch number is
EffectScript's own (the `@types/node` convention):

- `effectscript@4.0.x` targets `effect@4.0.*`, as a peer dependency `effect: ~4.0.0`.
- When Effect releases 4.1.0, `effectscript@4.1.0` follows.
- During the experiment, releases are `4.0.0-alpha.N`. Breaking language changes are allowed in
  alpha; afterwards they ship only with an Effect minor and are called out in the changelog.
- The review (R11) recommended independent semver instead. The user chose lockstep; the reasons
  and the conditions for revisiting are in ADR-0015.
- Three versions stay distinct: the compiler's own, the target Effect version (header or option),
  and the version actually installed (known only to Node and project integrations, never to the
  browser compiler).

The link is technical, not cosmetic: the prelude tables (§4.13) and the builtins are generated from
that Effect release's source. The prelude is a curated compatibility surface: each release PR shows
the diff of newly exposed names for review, and nothing becomes a builtin unreviewed.

**Version header.** A file may start with `// @effect 4.0`:

- It tells an agent or reader which Effect API the file targets, even for a single file pasted
  without its project.
- `efx init` and `efx convert` can add it (`header: true` in config).
- The source of truth is still the project's installed `effect`. The compiler warns (EFX1003) when
  a header and the installed major.minor disagree.

**Release automation (CI):**

1. **Trigger:** a new `effect` release, detected by watching npm or upstream tags.
2. **Upgrade:** a workflow syncs the upstream merge into this fork and regenerates the prelude tables
   (`pnpm codegen`). It then runs the full EffectScript suite against the new Effect: superset,
   goldens, type-checking, runtime, and the reverse round trip.
3. **Green:** open a release PR (with the prelude diff); after human approval, publish `effectscript@<effect major.minor>.0`, the binaries,
   the Homebrew formula, and the VS Code extension.
4. **Red:** open an issue with the failing tests. Hand it to an AI agent, either GitHub Copilot's
   coding agent or the Claude Code GitHub Action, with the skill and the failing goldens as context.
   A human reviews the resulting PR before anything ships.

## 8. AI skill (`packages/effectscript/core/skills/effectscript/`)

**Status (Plan 14, ADR-0051):** built.

- `references/syntax.md` and `references/effect-docs.md` are generated: from the fixtures, and
  from the Effect docs in EffectScript (`@effectscript/effect-docs`, ADR-0050).
- Every hand-written example compiles and type-checks against `effect` in the tests.
- `efx skill` installs the skill into `.claude/skills` (project), `~/.claude/skills`
  (`--global`), or `--dir`.
- `efx setup` (Plan 15) adds the other agents.

- `SKILL.md`: when to use EffectScript, the core rules (`effect`/`await`/`throw`, services, errors,
  schemas, layers, `main`, `match`, `|>`), and a short decision table that maps the `LLMS.md`
  best practices to EffectScript ("prefer services", "errors are `error` declarations", "parse
  with `schema`, never with predicates", "use `effect` declarations instead of functions that return
  `effect { }`").
- `references/syntax.md`: the full syntax with desugarings (generated from §4 fixtures, so it never
  drifts).
- `references/patterns.md`: services and layers, testing with `it.effect` + `effect`, HTTP, SQL,
  streams, resources, concurrency, retries, and schedules.
- `SKILL.md` and the docs open with the `async` ↔ `effect` table: `await`, `throw`, `try`/`catch`/`finally`, `for await`, `using`. They also cover the one real difference, laziness: an effect that is never `await`ed never runs.
- `references/pitfalls.md`: the `try` contract (`catch (e)` also catches defects, as `UnknownError`), `await` on Promises (use
  `Effect.tryPromise`), the hoisting of `effect` declarations, and the `catch` handler semantics.
- Written following the repo's `writing-for-agents` guidance. `efx skill` installs it.

---

## 9. Site and docs (`packages/effectscript/site`, at effectscript.dev)

**Content available to the site:** `packages/effectscript/effect-docs/content` (ADR-0050). It has
the Effect docs and examples in EffectScript, with `LLMS.efx.md`, guides, per-module API
examples, a TS ↔ EffectScript corpus, and `REPORT.md` with the token numbers that §9's claims
cite.

The site lives in this monorepo, so there are no separate repos to maintain. Its domain is
**effectscript.dev**; effectscript.com redirects there for now.

### 9.1 Audience and pitch

The page must sell the idea in seconds. It opens with **the problem, then the solution**, and
speaks to two groups:

1. **People who wanted Effect but could not stand the verbosity.**
2. **Effect users who want code that is easier to read and review.**

The message: the same Effect, as a language. It is less verbose, stricter than TypeScript, built
for agents (fewer tokens, one canonical way to write things), and has no lock-in (two-way compiler,
any TS is valid).

**Credit:** the site says it is made by **@gunta85**, with a "Follow @gunta85" call to action in
the hero, in the footer, and after the playground.

### 9.2 Page

The narrative follows §0: Effect is settled → verbosity is the complaint → EffectScript → zero risk.

1. **Problem → Solution hero.** A real Effect TS snippet next to its EffectScript twin, with live
   token counts. The headline says the same thing ("Effect, as a language"), backed by the numbers.
2. **Before/after gallery:** rendered as **real VS Code-style editor windows**, with title bar, tab
   strip (`orders.ts` · `orders.effect.ts` · `orders.efx`), activity bar, gutter line numbers,
   minimap strip, and status bar (language mode, `Ln/Col`, `UTF-8`).
   - Code is highlighted by Shiki using **our own `source.efx` TextMate grammar** (§7.4) and the
     VS Code Dark Modern / Light Modern themes.
   - There are three panes, plain TS · Effect TS · EffectScript.
   - There are ten scenarios: typed errors + retry, services + layers, schemas + decoding,
     concurrency, resources, pattern matching, HTTP API, CLI, tests (vitest + Effect), and config.
   - The Effect TS pane is generated at build time by `toTypeScript`, so it cannot drift. The
     samples are type-checked in CI.
3. **Live, real token counts.** A real BPE tokenizer runs in the browser (`gpt-tokenizer`,
   `o200k_base`, in a Web Worker):
   - Each pane shows its token count and the change relative to the others.
   - A **"show tokens"** toggle colors each token boundary.
   - The tokenizer is labeled honestly.
   - Claude token counts are computed at build time (Anthropic `count_tokens` API, cached JSON)
     when `ANTHROPIC_API_KEY` is set.
4. **Two-way playground:** built on **`@effect/monaco-editor`**, the same Monaco setup the Effect
   website uses:
   - our grammar, compiler diagnostics as squiggles, and a Problems panel
   - live two-way conversion that follows the focused pane
   - presets, "left as TS because …" notes, and a shareable URL hash
   - the compiler running in a Web Worker
5. **"Stricter than TypeScript, ready for agents":** strict-mode rules (§4.17), one canonical way
   to write each construct, explicit effects, fewer tokens, and the AI skill.
6. **Library constructs:** `test`/`describe` (the vitest + Effect story), `api`/`impl`, `command`,
   `config`, `layer`, and zero-config observability (§4.14–4.16).
7. **"Zero risk":** the superset guarantee, mixing in one file, two-way conversion, `.ts` ↔ `.efx`
   imports, and "works with your tools" (Bun, Vite, Vitest, Astro, tsc, VS Code).
8. **Roadmap teaser**, clearly labeled as future work (§14): proofs (Lean 4 / Bend2), Alchemy infra
   constructs, AoT-friendly output, and direct oxlint support.
9. **Install/quickstart**, and the follow call to action.

### 9.3 Docs (Starlight at `/docs`)

The docs are a language reference generated from the golden fixtures (EffectScript ↔ TypeScript
pairs), plus guides: getting started, migrating with `efx convert`, services and layers, errors,
testing, HTTP, CLI, the strict rules, editor setup, and the AI skill. The pages use Expressive Code
blocks with the `.efx` grammar, and every example has an "Open in playground" link.

### 9.4 Stack (mirrors the Effect website)

The site uses the same tools as `Effect-TS/website`:

- Astro 7 (static output) + Starlight
- Expressive Code + Shiki 4
- Tailwind CSS 4
- React 19 islands
- `@effect/monaco-editor`
- `motion` for animation
- `astro-seo` plus generated Open Graph images

**Deployment** follows the Effect website: Alchemy (`alchemy/Cloudflare`, `Cloudflare.Website.Astro`)
to Cloudflare, with the domains `effectscript.dev` and `effectscript.com` (the latter redirects).
The `alchemy.run.ts` deployment file is written in `.efx` as a dogfooding example once Plan 4's
runner exists.

Visual design is done during implementation with the frontend-design skill.

### 9.5 Why no wasm

The compiler is plain JavaScript (acorn + magic-string, about 250 KB minified before gzip). It runs
natively in the browser with no wasm. Wasm would only matter for a future Rust (oxc-based)
implementation.

---

## 10. Monorepo registration (per `.agents/skills/package-development`)

| Surface                    | Change                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`      | Add `packages/effectscript/*`. Classify `allowBuilds` for any new install scripts.       |
| `tsconfig.packages.json`   | Reference `core` and `language` (buildable, published)                                  |
| `tsconfig.tests.json`      | Existing `./packages/**/test/**` globs already cover these packages                     |
| `vitest.config.ts`         | Add `effectscript-core`, `effectscript-language`, and `effectscript-examples` projects   |
| `jsdocs.config.json`       | Exclude the `effectscript` family initially (documented, like other tool packages)       |
| `deno.json`                | Exclude `packages/effectscript/**` (Node/Bun tooling)                                   |
| `.changeset`               | A changeset for `effectscript` and `@effectscript/language` (new packages)               |
| `README.md`                | A catalog entry for EffectScript                                                         |
| dprint/oxlint              | Apply to `.ts` sources. `.efx` is ignored by both.                                       |

---

## 11. Testing strategy

| Layer             | What                                                                                     | Where                          |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| Parser            | Each trigger in §4.19 parses. Each non-trigger stays TS. Error positions.               | `core/test/parser.test.ts`     |
| Golden            | `test/fixtures/<case>.efx` → `<case>.ts` (`toMatchFileSnapshot`)                          | `core/test/compile.test.ts`    |
| Type check        | Every golden output type-checks against the workspace `effect` with strict settings (TS compiler API, in-memory host) | `core/test/typecheck.test.ts` |
| Runtime           | Executes compiled fixtures and asserts behavior: try/catch, defer order, match, pipes, `await [..]`, scoped `using` | `core/test/runtime.test.ts` |
| Superset identity | Every `packages/effect/src/**/*.ts` compiles to itself byte-for-byte                     | `core/test/superset.test.ts`   |
| Round trip        | `≡` (§6.4) in both directions over all fixtures and site samples                          | `core/test/roundtrip.test.ts`  |
| Reverse           | Canonical shapes → expected `.efx`. Blockers stay TS, with reasons.                      | `core/test/convert.test.ts`    |
| Integrations      | The Bun plugin runs an example (skipped if Bun is absent). Vite via Vitest on examples. The Node register hook. | `examples/test/*`  |
| Language          | `efx-tsc` on a fixture project: an intentional error is reported at the right `.efx` line and column | `language/test/*` |
| Site              | `astro build` succeeds. Sample outputs equal the compiler output.                        | the site's `build` script      |

---

## 12. Diagnostics

Codes have the form `EFX<area><nn>`. Areas: 1 = parse, internal errors and configuration, 2 = `effect`,
3 = schema, 4 = service, 5 = pipe, 6 = main, 7 = proposals, 8 = strict rules, 9 = library constructs
(`command`, `group`/`api`/`impl`) and tooling. EFX9301–EFX9307 are the living-docs diagnostics
(docs spec §4).

The compiler reports syntactic diagnostics; rules that need types run in the checker (language
service and `efx check`). Heuristic rules say so in their message. A compile fails only when a
diagnostic has severity `error`; warnings never abort output unless `strict: true` promotes them
(ADR-0017).

Each diagnostic carries `{ code, message, start, end, severity, hint? }`. The integrations format
them with a code frame. Parse errors don't throw: `toTypeScript` returns diagnostics and an empty
`code`.

---

## 13. Delivery phases

Each phase ends green: its tests pass, plus `pnpm check` and `pnpm lint` for the touched packages.
The order was revised after the plan review (ADR-0016).

1. **Core compiler, language core (§4.1–4.13).** Done (Plan 1).
2. **Semantic hardening (Plan 2).** Done. Hygienic references (ADR-0009), the `try` contract
   (ADR-0010), resource lifetimes (ADR-0011), pipeline order (ADR-0012), exact optional fields
   (ADR-0013), service keys (ADR-0014), diagnostics policy (ADR-0017), and behavior tests that
   observe order, cleanup and failure kinds.
3. **Adoption slice (Plan 3).** Done; see `packages/effectscript/COMPATIBILITY.md`. A fixture project: `.efx` + `.ts` modules, `efx build` with
   graph-aware import rewriting, `efx check` (Volar on the TypeScript 6 JS API), running on Node,
   VS Code IntelliSense including incomplete code, reverse conversion of the supported subset, and a
   packed-package consumer.
4. **Everyday constructs (Plan 4).** Done: `config`, top-level `layer`, `test`/`describe`, ambient
   capture, and syntactic strict mode (ADR-0027, ADR-0028).
5. **Library DSLs and telemetry (Plan 5).** Done: `api`/`group`/`impl`, `command`, `atom`, and the
   OTLP layer for `main` (§4.14, §4.16, ADR-0029).
6. **Full reverse compiler (ADR-0031):**
   - **6a (Plan 6):** the language-core shapes (§4.1–4.13), the §6.3 blockers, and the ADR-0030
     identity harness.
   - **6b (Plan 7):** library constructs and ambient forms (§4.14–4.15).
7. **CLI, integrations and distribution (ADR-0032):**
   - **7a (Plan 8):** the dogfooded `efx` CLI: `build`, `check`, `run`, `print`, `convert`,
     `init`, `doctor`.
   - **7b (Plan 9):** the Bun and Vite plugins and the examples package.
   - **7c (Plan 10):** the standalone binary, Homebrew, the install script and the release
     workflow.
   - **Plan 10b** (after phases 8 and 9, ADR-0038): `setup`, `convert --ai` and `skill`.
8. **Language tooling completion (Plan 11):** the language server for other editors (`efx lsp`),
   the `await` guardrails in every editor, and the VS Code commands and `.vsix`
   (ADR-0039–0041).
9. **AI skill (Plan 14, done):** `SKILL.md` + references, generated syntax reference, and
   `efx skill` (ADR-0051). Also done: the Effect docs and examples in EffectScript, a parallel
   corpus for agents and training (Plan 13, ADR-0050).
10. **Site:** VS Code-style before/after gallery, Monaco two-way playground, and the narrative
   sections. Every claim links to evidence (review R15).
11. **Monorepo registration and release prep:** §10 surfaces, changeset, README.

## 14. Roadmap (explicitly out of v0.1)

- `effect` class methods and `effect` methods in `schema` classes.
- Generator streams (`effect*` with `yield` → `Stream`).
- `match` guards and object patterns (`when { status: 404 }`).
- `Context.Reference` services with defaults.
- More library constructs: `rpc` (RpcGroup), `workflow` (effect/workflow), `tool`/`toolkit`
  (effect/ai), `entity` (cluster), and a Foldkit-style `app` (Model/Message/update/view).
- Automatic layer wiring for `main` (whole-program analysis of which services are used).
- Error-tolerant parsing that recovers at the statement level, for a smoother editor experience
  while typing.
- A GitHub "view as EffectScript" browser extension, built on the reverse compiler.
- A Rust/oxc implementation compiled to wasm, for speed at scale.
- Partial application, if the proposal advances.
- **AoT-ready output.** Bun is experimenting with AoT compilation of TS that relies on baked-in
  type guesses, and ChadScript compiles a fixed-shape subset of TS to native code. EffectScript
  output should help these tools:
  - **Generated code never introduces `any`.** It keeps every explicit type the source has
    (`Effect.fn.Return<…>` from `throws`, schema-derived types).
  - **`schema`/`error`/`service` classes give fixed object shapes.**
  - **Schema decoding at the boundaries turns type guesses into verified types**, so code after
    decoding can be trusted.
  - **An opt-in `strict: "aot"` profile** adds ChadScript-like rules to EffectScript's strict mode:
    no `any`, no `eval`, no dynamic property addition or `delete` on schema instances, and every
    optional field initialized.
  - **`isolatedDeclarations`-friendly exports**, for fast `.d.ts` emit in tsgo and oxc.
  - **AoT type hints** in a Bun-specific emit mode, once Bun exposes a stable mechanism.
- **Living docs** (delivered in Plan 12, ADR-0042/0043): doc comments written once at the
  definition, `efx` examples run as doctests, and `efx docs` writing Markdown for Blume. These are
  the first rung of the trust ladder that contracts, property tests and proofs build on.
- **Proofs.** Generate Effect code *and* proof obligations automatically. Planned in stages:
  1. **Contracts.** `requires`/`ensures` clauses on `effect` functions and schema refinements. They
     are checked at runtime in development, and property tests are derived from them automatically
     (fast-check through Schema `Arbitrary` and `it.effect.prop`).
  2. **Export.** Pure functions plus their contracts and schemas are exported to Lean 4 theorem
     statements and Bend2 specs.
  3. **CI.** Proof status is reported in CI.
- **Alchemy integration.** `infra`/`resource` constructs compile to Alchemy's Effect-based
  resources, so infrastructure is written in `.efx` as well.
- **Linting `.efx` directly.** Run oxlint on the compiled TS, mapping diagnostics back through
  source maps. Then, if worthwhile, contribute or fork a parser so oxlint lints `.efx` natively.
- **Performance profile.**
  - `hot effect name()` → `Effect.fnUntraced`, with no span or stack capture, for hot paths.
  - Schema codecs precompiled at build time.
  - AoT hints (above).
- **More observability magic.** Automatic span attributes for parameters whose type is a branded
  ID schema (`UserId`), which carry no PII by construction. A `span "name" { … }` block sugar.
- **AI evaluation harness** to test the §0 hypothesis: the same Effect tasks solved by models
  writing `.efx` versus Effect TS. Measure correctness (does the compiled output type-check and pass
  the tests?), idiomatic-ness (lint against `LLMS.md` practices), and tokens used.
