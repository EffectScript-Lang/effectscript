# EffectScript: Design Spec

- **Status:** Draft for review
- **Date:** 2026-10-02
- **Location:** `packages/effectscript/*` in the `gunta/effect-lang` fork of the Effect monorepo

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
  compiles to TS instantly. That makes adoption risk-free:
  - **No full buy-in.** Any TS is valid EffectScript, so you can mix both inside one file.
  - **Mix files freely.** `.ts` imports `.efx` and `.efx` imports `.ts`.
  - **Go back and forth.** The two-way compiler converts TS+Effect → `.efx` and back, so there is
    no lock-in.
  - **Your tools keep working.** tsc, Bun, Vite, Vitest, Astro, VS Code, and the AI skill all
    handle `.efx`.
- **Hypothesis (to be proven, roadmap §14):** models get better at Effect when they write `.efx`.
  In EffectScript the Effect way is the only syntax there is, so nobody has to remind the model to
  "do it the Effect way", and the code it reads and writes is denser and has less ceremony.
- **Status:** an experiment, but a working one. Every interop path is tested.

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
| Effect bind       | `await` inside `fx` code (in place of `yield*`)                          |
| Location          | Inside the Effect monorepo, following its conventions                   |
| Scope             | Everything: compiler, CLI, integrations, editor tooling, site, skill     |
| JSX               | One extension (`.efx`). The compiler auto-detects JSX (§3.2)            |
| Browser compiler  | Pure JS; no wasm needed (§9.2)                                          |

### Assumptions (open to correction)

- Output must read like hand-written Effect code. Reviewability and AI training quality depend on
  this, so no runtime helper library and no opaque helper calls.
- The target is Effect v4 (`effect@4.0.0`, this repo's `packages/effect`).
- The first release is explicitly experimental (`0.x`). Some constructs are deferred to a roadmap
  (§14).

### Success criteria

1. Each construct in §4 compiles to TypeScript that type-checks with `strict` +
   `exactOptionalPropertyTypes` against this repo's `effect`. CI-verified.
2. Superset property: real-world `.ts` files (the whole `packages/effect/src` tree) parse as `.efx`
   and compile to themselves byte-for-byte.
3. Round-trip property: for every canonical fixture, `toEffectScript(toTypeScript(x)) ≡ x` and
   `toTypeScript(toEffectScript(t)) ≡ t`, where `≡` is defined in §6.4.
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
4. **Effects stay visible.** Effects are never implicit. `fx`, `await`, and `throw` mark every
   effect boundary, so diffs are reviewable without type information. The compiler is purely
   syntactic and never needs the type checker.
5. **Familiar keywords first.** Reuse `await`, `throw`, `try/catch`, `using`, and TC39 syntax
   before inventing words. New keywords (`fx`, `schema`, `error`, `service`, `layer`, `main`,
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
plugin class that extends the TS parser. A spike validated the approach: `fx` declarations, `fx`
blocks, `await`/`throw` inside `fx`, and left-associative `|>` all parse, with original source
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

### 4.1 `fx` functions

```ts
export fx getUser(id: UserId): User throws UserNotFound {
  const users = await Users
  return await users.find(id)
} |> Effect.retry({ times: 3 })
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
| `fx name(…) {…}` (declaration)             | `const name = Effect.fn("name")(function*(…) {…})`                         |
| `fx name(…) {…}` nested in a `service`     | span name `"Service.name"` (matches the Effect idiom)                       |
| `export default fx name(…) {…}`            | `const name = …` followed by `export default name`                         |
| `fx (…) => expr` / `fx x => expr`          | `Effect.fnUntraced(function*(…) { return expr })`                          |
| `fx (…) => { … }`                          | `Effect.fnUntraced(function*(…) { … })`                                     |
| `fx { … }` (expression)                    | `Effect.gen(function*() { … })`                                             |
| `fx { … }` using `this`                    | `Effect.gen({ self: this }, function*() { … })`                             |
| `{ fx m(…) { … } }` (object method)        | `{ m: Effect.fn("m")(function*(…) { … }) }` (`"Service.m"` inside a service) |
| `fx … {…} \|> p1 \|> p2` (declaration)     | extra `Effect.fn` arguments: `…}, p1, p2)`                                 |

Rules:

- Generics, `this` parameters, default parameters, and rest parameters pass through unchanged.
- `fx` declarations compile to `const`, so they are not hoisted. A `main` block (§4.10) always runs
  after the whole module has initialized.
- `fx` arrows must not reference `this`. Use a `fx` block or method instead. Error **EFX2001**.
- `fx` class methods are on the roadmap (§14). Error **EFX2002** with a hint.
- `fx` blocks at statement level are rejected. Error **EFX2003**: "an effect that is never used;
  did you mean `main { … }`?"

### 4.2 Return types: `throws` / `needs`

`: A throws E needs R` on a `fx` function, arrow, method, or service member:

- On `fx` functions → `: Effect.fn.Return<A, E, R>`. Without `throws`, E is `never`, so the
  signature becomes a checked contract.
- On service members → `Effect.Effect<A, E>` in the service shape.

`throws` without a return type is an error (**EFX2004**: write `: void throws E`).

### 4.3 Inside `fx` code

These rules apply to the body of the `fx` construct itself. Nested non-`fx` functions, arrows, and
classes are boundaries, the same way `async` scoping works. Nested `fx` constructs start their own
`fx` context.

| EffectScript                                | TypeScript                                                       |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `await e`                                   | `yield* e` (parenthesized when precedence requires it)           |
| `await [a, b]`                              | `yield* Effect.all([a, b], { concurrency: "unbounded" })`        |
| `await { a, b }`                            | `yield* Effect.all({ a, b }, { concurrency: "unbounded" })`      |
| `throw e;`                                  | `return yield* Effect.fail(e);`                                  |
| `throw new E(…)` (`E` is a local `error`)   | `return yield* new E(…);`                                        |
| `x ?? throw e` (throw expression)           | `x ?? (yield* Effect.fail(e))`; with a local `error` → `x ?? (yield* new E(…))` |
| `defer e`                                   | `yield* Effect.addFinalizer(() => e)`, and the function is scoped |
| `defer { stmts }`                           | `yield* Effect.addFinalizer(() => Effect.sync(() => { stmts }))`  |
| `using x = await e`                         | `const x = yield* e`, and the function is scoped                 |
| `for await (const x of s) { … }`            | `yield* Stream.runForEach(s, (x) => Effect.gen(function*() { … }))` |

`yield*` precedence: the compiler adds parentheses when the parent is a binary, unary, `as`,
`satisfies`, non-null, member, call-callee, tagged-template, or conditional-test expression. In
every other position it emits a bare `yield* e`.

Scoping: `defer` and `using … await` mark the enclosing `fx` as scoped:

- On declarations → `Effect.scoped` becomes the first extra `Effect.fn` argument.
- On blocks → `.pipe(Effect.scoped, …)`.
- On a `main` block → the scope wraps the program.
- `fx` blocks that are `layer` constructors are never scoped, because the layer owns the scope.
  This is the idiomatic acquire-in-layer pattern.

`for await`: `continue` becomes `return`. `break`, labeled jumps, and `return` inside the loop are
errors (**EFX2010**).

### 4.4 `try` / `catch` / `finally` inside `fx`

A `try` statement in `fx` code is **effectful** if its `try` block contains, at that `fx` level, an
`await` or a `throw`. Otherwise it is a plain JavaScript `try` and catches synchronous exceptions
as usual. This rule follows what the code means: a `try` around effects catches their failures, and
a `try` around synchronous code catches exceptions. It also keeps the reverse compiler exact
(§6.3).

An effectful `try` desugars to an inner `Effect.gen` piped through handlers:

```ts
try { return await load(id) }
catch (e: NotFound) { return guest }
catch (e) { await Console.error(e); return guest }
finally { await Metric.increment(loads) }
```

→

```ts
return yield* Effect.gen(function*() { return yield* load(id) }).pipe(
  Effect.catchTag("NotFound", (e) => Effect.gen(function*() { return guest })),
  Effect.catch((e) => Effect.gen(function*() { yield* Console.error(e); return guest })),
  Effect.ensuring(Effect.gen(function*() { yield* Metric.increment(loads) }))
)
```

| Catch clauses                                    | Handlers                                                    |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `catch (e)` / `catch`                            | `Effect.catch((e) => …)`                                     |
| `catch (e: A)`                                   | `Effect.catchTag("A", …)`                                    |
| `catch (e: A \| B)`                              | `Effect.catchTag(["A", "B"], …)`                             |
| Several typed clauses, each a single tag         | one `Effect.catchTags({ A: …, B: … })`                       |
| Several typed clauses, some unions               | sequential `Effect.catchTag(…)` calls in source order       |
| A final untyped clause after typed ones          | appended `Effect.catch(…)`                                   |
| `finally { … }`                                  | appended `Effect.ensuring(Effect.gen(…))`                    |

Rules:

- **Several `catch` clauses are EffectScript syntax** and are only valid inside `fx`.
- The tag name is the last segment of the type name (`Errors.NotFound` → `"NotFound"`). `error`
  declarations always tag with their class name. If a tag doesn't match, the type check of the
  output catches it.
- Control flow: if every path of the `try` and `catch` blocks ends in `return`/`throw`, emit
  `return yield* …`. If no path does, emit `yield* …;`. Anything mixed is an error (**EFX2020**,
  with a refactoring hint). `break`/`continue` that cross the `try` boundary, and `return` in
  `finally`, are errors (**EFX2021**).
- Semantics note (documented): a failure raised inside a typed handler can be caught by a later
  untyped clause. This is Effect's handler semantics, not JS's.

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
  age = Schema.Int.check(Schema.isGreaterThan(0))   // `=` field: raw schema expression
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
  email: Schema.optional(Schema.String),
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
| `{ a: T; b?: U }`                           | `Schema.Struct({ a: T, b: Schema.optional(U) })` |
| `T & Brand<"X">`                            | `T.pipe(Schema.brand("X"))`                      |
| Schema vocabulary: `Int`, `Finite`, `NonEmptyString`, `Trimmed`, `DateTimeUtc` | `Schema.Int`, … |
| `Defect`                                    | `Schema.Defect()`                               |
| `Name` (other identifier)                   | `Name` (must be a schema value)                  |
| `A.B` (qualified name)                      | `A.B` (schema value)                             |

`readonly` modifiers are ignored, because schemas are already readonly. Unsupported type syntax
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
  fx find(id: UserId): User throws UserNotFound   // effectful member
  readonly size: number                           // plain member

  layer = fx {                                     // static readonly layer
    const sql = await SqlClient
    return {
      size: 0,
      fx find(id) {                                // span "Users.find"
        const rows = await sql`select * from users where id = ${id}`
        return rows[0] ?? throw new UserNotFound({ id })
      }
    }
  } |> Layer.provide(SqlLive)

  layer test = { size: 1, find: fx (id) => new User({ id, name: "Test" }) }
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

- **Members.** `fx m(…): A throws E` (a return type is required, error **EFX4001**), property
  signatures, and plain method signatures form the shape. `layer [name] = expr` members become
  `static readonly layer[Name]`. Other class members are errors (**EFX4002**).
- **Layer initializers:**
  - A `fx` block → `Layer.effect(Self, Effect.gen(…))`. Every top-level `return { … }` object
    literal is wrapped in `Self.of(…)`, which gives contextual typing for method parameters.
  - An object literal → `Layer.succeed(Self, Self.of({…}))`.
  - Any other expression is used as-is.
  - `|>` pipes apply to the resulting `Layer`.
- **Key.** By default, `"<package name>/<dir relative to package root, minus a leading src/>/<Name>"`
  (the convention in `LLMS.md`). With no package information, the key is `"<Name>"`. To override:
  `service Users as "acme/Users" { … }`.
- `Context.Reference` services with defaults are on the roadmap.

### 4.9 Pipeline `|>` (TC39 Stage 2, both flavors)

- **Function style** (Effect style): if the right-hand side contains no topic `%`, `a |> f |> g`
  applies `f`, then `g`, to `a`:
  - If `a` is known to be pipeable → `a.pipe(f, g)`. Known pipeable means a `fx` expression, a call
    or member chain rooted at a pipeable prelude module (`Effect`, `Layer`, `Stream`, `Schema`,
    `Schedule`, `Option`, `Result`, `Exit`, `Sink`, `Channel`, `Chunk`, `HashMap`, `HashSet`,
    `Duration`, `Cause`), or a local `const` initialized with one of those.
  - Otherwise → `pipe(a, f, g)`, with `pipe` imported automatically.
- **Hack style** (the proposal as currently specified): a right-hand side containing the topic `%`
  substitutes the left-hand side. For example, `user |> Effect.map(%, f)` → `Effect.map(user, f)`.
  The value is inlined if everything evaluated before `%` is side-effect-free (identifiers, member
  reads, literals). Otherwise the compiler emits `(($) => rhs)(lhs)`. A `%` outside a pipeline
  right-hand side is a syntax error.
- Consecutive steps of the same flavor are grouped into one `.pipe(…)`/`pipe(…)`.
- Precedence is below `??`/`||` and above `?:`/assignment/arrow. `a ? b : c |> f` pipes only `c`.
  Use parentheses to pipe the whole conditional.
- `|>` directly after a `fx` declaration, `main`, or `layer` attaches pipeables (§4.1, §4.8,
  §4.10). Hack style is not allowed there (**EFX5001**).

### 4.10 `main`

```ts
main {
  const user = await getUser(UserId.make("42"))
  await Console.log(user.name)
} |> Effect.provide(Users.layer)
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
- **Inside `fx`:** if any arm contains `await` or `throw`, every arm becomes
  `Effect.fnUntraced(function*(binding) { return arm })` and the whole match is yielded.
- **Syntax:** `match (x) {` requires the `{` on the same line as `)`. Guards (`if (…)`) are on the
  roadmap.

### 4.12 Other adopted proposals

| Proposal                         | Status   | In EffectScript                                                                 |
| -------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Pipeline operator                | Stage 2  | §4.9, both function and Hack styles                                             |
| Pattern matching                 | Stage 1  | §4.11, compiled to Effect `Match`                                               |
| Throw expressions                | Stage 2  | Inside `fx` → typed failure. Outside → `(() => { throw e })()`                  |
| Do expressions                   | Stage 1  | `do { … }` in expression position → IIFE. Inside `fx` with `await` → `(yield* Effect.gen(…))`. The completion value is the last expression statement, recursing through `if`/`else` and blocks. `return`/`break`/`continue` that escape are errors (**EFX7001**) |
| Explicit resource management     | Stage 3+ | Native outside `fx`. `using x = await e` in `fx` → scoped acquisition (§4.3)   |
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
- Curated unstable modules: `HttpClient`, `HttpServer`, `HttpRouter`, … from `effect/unstable/http`;
  `SqlClient` from `effect/unstable/sql`; CLI modules from `effect/unstable/cli`. The table is
  generated from `packages/effect/package.json` exports and tested.
- Opt-out: the `// @efx no-prelude` directive, or the `prelude: false` option.
- This is the one documented superset exception: a `.ts` file that references a *global* named,
  say, `Effect` would now resolve to the `effect` module.

### 4.14 Superset guarantee and contextual keyword triggers

| Keyword / syntax  | Triggers only when                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `fx`              | Followed on the same line by an identifier (declaration), `{` (block), or arrow parameters followed by `=>` (arrow; speculative parse with `fx` falling back to an identifier) |
| `schema` `error` `service` | Statement position (optionally after `export`), followed on the same line by an identifier |
| `main`            | Statement position, followed by `{` on the same line                                     |
| `defer`           | Statement position inside `fx`, followed by an expression on the same line              |
| `layer`           | `service` body member position                                                           |
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
ESTree + TS AST (original offsets) ── analyze: scopes, fx contexts, declared names, local `error`s
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
- `analyze/scope.ts`: declared names per scope, free identifiers, `this` usage, `fx` contexts.
- `transform/*.ts`: one file per construct (`fx`, `await-throw`, `try`, `schema`, `error`,
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
  diagnostics: ReadonlyArray<Diagnostic> // empty when successful
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

Each row is the inverse of a row in §4.

| TypeScript shape                                                                    | EffectScript                         |
| ----------------------------------------------------------------------------------- | ------------------------------------ |
| `const x = Effect.fn("x")(function*(…) {…}, …ps)` (`"Svc.x"` inside service `Svc`)  | `fx x(…) {…} \|> …ps`                 |
| `Effect.fnUntraced(function*(…) {…})`                                               | `fx (…) => {…}`; a single `return e` body → `fx (…) => e` |
| `Effect.gen(function*() {…})` / `Effect.gen({ self: this }, …)`                     | `fx {…}`                              |
| `: Effect.fn.Return<A, E, R>`                                                       | `: A throws E needs R`                |
| `yield* e` inside those generators                                                  | `await e`                             |
| `yield* Effect.all(xs, { concurrency: "unbounded" })` with an array/object literal | `await [ … ]` / `await { … }`         |
| `return yield* Effect.fail(e)` / `return yield* new E(…)`                           | `throw e` / `throw new E(…)`          |
| A native `throw e` inside an Effect generator (a defect)                            | `await Effect.die(e)`                 |
| `yield* Effect.addFinalizer(() => e)` plus an `Effect.scoped` pipeable              | `defer e` (the pipeable is removed)   |
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
| `import { …prelude names } from "effect"`                                            | removed                               |

Schema fields use the reverse of the §4.6 table. A field whose schema is not in the table becomes
an `=` field, so it is lossless.

### 6.3 Blockers (leave the node as TypeScript)

A generator stays `Effect.gen`/`Effect.fn` TypeScript, which is still valid EffectScript, when its
direct body contains any of these:

- a native `try` whose `try` block contains `yield*` (it would change meaning under §4.4)
- `yield` without `*`
- `arguments`
- an `Effect.fn` span name that doesn't match the binding (or the `Svc.x` rule)
- `Effect.fn` span options
- `this` in an `Effect.fnUntraced` body
- a label that crosses a desugaring boundary

The converter reports what it left as TS and why, for example in `efx convert --explain` and in the
playground's notes panel.

### 6.4 Round-trip equivalence

`a ≡ b` means both parse, and after these normalizations their ASTs are equal (ignoring positions):

- import declarations are normalized (merged and sorted by module and name)
- redundant parentheses are dropped
- `return yield* Effect.fail(new E(…))` is treated as `return yield* new E(…)`
- `yield* Effect.die(e)` is treated as a native `throw e` inside generators
- `.pipe(…)` on a known-pipeable value is treated as `pipe(…)`
- the position of a trailing `runMain` statement is ignored

Tests assert `≡` over every fixture in both directions (§11).

---

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
- `efx run <file> [-- args]`: run with Bun if available, otherwise Node with `effectscript/register`.
- `efx check`: delegates to `efx-tsc` from `@effectscript/language`.
- `efx init`: add tsconfig/bunfig/vite settings, scripts, and the skill.
- `efx skill [--dir]`: install the AI skill (default `.claude/skills/effectscript`).

Dogfooding: the CLI's command modules are `src/cli/*.efx`. `pnpm codegen` compiles them into
checked-in `src/cli/*.ts`, formatted with dprint, the same way the monorepo handles generated
barrels. That keeps `pnpm check`/`lint` meaningful and proves the compiler on real code.

### 7.2 Runtime integrations

- **Bun:** `effectscript/bun` exports a `BunPlugin` (`onLoad` filter `/\.efx$/` → `{ contents,
  loader: "ts" | "tsx" }`, runtime `bun`) and a `preload` entry for `bunfig.toml`, so `bun run
  x.efx` and `bun test` work. The plugin also resolves extensionless imports that point to `.efx`.
- **Vite** (and Vitest, Astro, Vite+): `effectscript/vite` (`enforce: "pre"`) transforms `.efx` →
  TS, then strips types with Vite's bundled transform (oxc/esbuild), returning code and source map.
  It adds `.efx` to `resolve.extensions`. The runtime defaults to `browser` for client builds and
  `node` for SSR/Vitest.
- **Node:** `effectscript/register` uses `module.registerHooks` and returns
  `format: "module-typescript"`, so Node's type stripping runs the output. Requires Node ≥ 22.18.

### 7.3 Editor and type checking (`@effectscript/language`)

- `languagePlugin`: a Volar `LanguagePlugin`. For `.efx`, `createVirtualCode` runs `toTypeScript`
  and exposes one TS/TSX virtual file with the mappings from §5. `typescript.extraFileExtensions`
  registers `efx`.
- `efx-tsc`: `@volar/typescript`'s `runTsc` with the plugin. It is real `tsc` with diagnostics
  mapped back to `.efx` positions, the way `vue-tsc` works.
- TS server plugin (`createLanguageServicePlugin`): gives full IntelliSense in `.efx` and lets
  `.ts` files import `.efx` modules. It decorates syntactic diagnostics with EffectScript compiler
  diagnostics. When parsing fails, the virtual code is the source verbatim, with the compiler
  diagnostic shown.
- `efx-language-server`: the standalone LSP (`@volar/language-server` +
  `volar-service-typescript`) for Neovim, Zed, and others.

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

---

## 8. AI skill (`packages/effectscript/core/skills/effectscript/`)

- `SKILL.md`: when to use EffectScript, the core rules (`fx`/`await`/`throw`, services, errors,
  schemas, layers, `main`, `match`, `|>`), and a short decision table that maps the `LLMS.md`
  best practices to EffectScript ("prefer services", "errors are `error` declarations", "parse
  with `schema`, never with predicates", "use `fx` declarations instead of functions that return
  `fx { }`").
- `references/syntax.md`: the full syntax with desugarings (generated from §4 fixtures, so it never
  drifts).
- `references/patterns.md`: services and layers, testing with `it.effect` + `fx`, HTTP, SQL,
  streams, resources, concurrency, retries, and schedules.
- `references/pitfalls.md`: the `try` effectfulness rule, `await` on Promises (use
  `Effect.tryPromise`), the hoisting of `fx` declarations, and the `catch` handler semantics.
- Written following the repo's `writing-for-agents` guidance. `efx skill` installs it.

---

## 9. Site (`packages/effectscript/site`, Astro)

### 9.1 Page

The narrative follows §0: Effect is settled → verbosity is the complaint → EffectScript → zero risk.

- **Hero:** "Effect, as a language." A live typing demo of `.efx` beside its compiled TS.
- **Before/after gallery:** rendered as **real VS Code-style editor windows**, with title bar, tab
  strip (`orders.ts` · `orders.effect.ts` · `orders.efx`), activity bar, gutter line numbers,
  minimap strip, and status bar (language mode, `Ln/Col`, `UTF-8`). Code is highlighted by Shiki
  using **our own `source.efx` TextMate grammar** (§7.4) and the VS Code Dark Modern / Light Modern
  themes. Three panes, plain TS · Effect TS · EffectScript, for six scenarios:
  1. typed errors + retry
  2. services + layers
  3. schemas + decoding
  4. concurrency
  5. resources (`defer`/`using`)
  6. pattern matching

  The Effect TS pane is generated at build time by running `toTypeScript` on the EffectScript
  sample, so it cannot drift. The same samples are type-checked in CI. Each scenario shows counts
  (characters, lines, ceremony tokens) and the percentage reduction.
- **Two-way playground:** built on **Monaco**, the editor component inside VS Code, so it is a real
  editor with minimap, folding, find, and multi-cursor:
  - Syntax highlighting uses our grammar through `@shikijs/monaco`.
  - EffectScript compiler diagnostics appear as squiggles (Monaco markers) and in a Problems panel.
  - Typing in either pane converts the other live; direction follows the focused pane.
  - It has example presets, a notes panel with "left as TS because …" explanations, and a shareable
    URL hash.
  - The compiler runs in a Web Worker.
- **Sections:**
  - "Zero risk": the superset guarantee, mixing in one file, two-way conversion, `.ts` ↔ `.efx`
    imports.
  - "Works with your tools": Bun, Vite, Vitest, Astro, tsc, VS Code.
  - "Built for AI": the skill, fewer tokens, explicit effects, and the hypothesis from §0, labeled
    as an experiment.
  - The TC39-proposals table.
  - Install/quickstart.

### 9.2 Why no wasm

The compiler is plain JavaScript (acorn + magic-string, about 250 KB minified before gzip). It runs
natively in the browser with no wasm. Wasm would only matter for a future Rust (oxc-based)
implementation.

### 9.3 Build

- Astro (static output). Shiki highlighting with the `source.efx` grammar, rendered inside
  VS Code-style editor frames (an Astro component).
- The playground is a client island: Monaco (lazy-loaded) + `@shikijs/monaco` + the compiler in a
  Web Worker.
- Visual design is done during implementation with the frontend-design skill.

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
| Parser            | Each trigger in §4.14 parses. Each non-trigger stays TS. Error positions.               | `core/test/parser.test.ts`     |
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

Codes have the form `EFX<area><nn>`. Areas: 1 = parse, 2 = `fx`, 3 = schema, 4 = service, 5 = pipe,
6 = main, 7 = proposals.

Each diagnostic carries `{ code, message, start, end, severity, hint? }`. The integrations format
them with a code frame. Parse errors don't throw: `toTypeScript` returns diagnostics and an empty
`code`.

---

## 13. Delivery phases

Each phase ends green: its tests pass, plus `pnpm check` and `pnpm lint` for the touched packages.

1. **Core compiler:** parser plugin, analysis, every §4 transform, mappings, and diagnostics. Golden,
   type-check, runtime, and superset-identity tests.
2. **Reverse compiler:** §6 shapes and blockers, plus the round-trip tests.
3. **CLI + integrations:** `efx` (handlers in `.efx`), the Bun plugin, the Vite plugin, the Node
   hook, and the examples package.
4. **Language tooling:** Volar plugin, `efx-tsc`, TS server plugin, language server, and the
   VS Code extension (grammar + commands).
5. **AI skill:** `SKILL.md` + references, generated syntax reference, and `efx skill`.
6. **Site:** VS Code-style before/after gallery, Monaco two-way playground, and the narrative
   sections.
7. **Monorepo registration and release prep:** §10 surfaces, changeset, README.

## 14. Roadmap (explicitly out of v0.1)

- `fx` class methods and `fx` methods in `schema` classes.
- Generator streams (`fx*` with `yield` → `Stream`).
- `match` guards and object patterns (`when { status: 404 }`).
- `Context.Reference` services with defaults.
- Error-tolerant parsing that recovers at the statement level, for a smoother editor experience
  while typing.
- A GitHub "view as EffectScript" browser extension, built on the reverse compiler.
- A Rust/oxc implementation compiled to wasm, for speed at scale.
- Partial application, if the proposal advances.
- **AI evaluation harness** to test the §0 hypothesis: the same Effect tasks solved by models
  writing `.efx` versus Effect TS. Measure correctness (does the compiled output type-check and pass
  the tests?), idiomatic-ness (lint against `LLMS.md` practices), and tokens used.
