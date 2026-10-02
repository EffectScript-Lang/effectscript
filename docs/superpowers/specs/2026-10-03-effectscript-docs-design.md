# EffectScript living docs: design spec

- **Date:** 2026-10-03
- **Status:** Draft, awaiting user review
- **Decisions:** ADR-0042 (doc format and doctests), ADR-0043 (`efx docs` generator and Blume)
- **Extends:** the main spec `2026-10-02-effectscript-design.md` (§4.14, §4.19, §7.1, §12)

## 1. Intent

**What the user asked for:**
- Elixir's results: docs that are part of the language, examples that run as tests, and docs that
  look the same everywhere. People and agents read signatures and docs, not bodies.
- Standard TSDoc. No new doc syntax.
- Compact docs that don't repeat the signature, because repetition costs tokens. Constraints on
  parameters are expressed with Effect Schema.
- Blume (useblume.dev) generates the docs site for every project that uses the `efx` CLI.
- Our own extractor in the spirit of ts-docs-gen, built on the EffectScript parser.

**Success criteria:**
1. A documented `.efx` module and its `doctest` line run under Vitest. A wrong `// =>` fails with a
   diff that points at the doc comment line.
2. `efx docs` writes Markdown pages that Blume builds without warnings. Each page shows the
   EffectScript signature, with errors, requirements and parameter schemas linked to their own
   definitions and summarized from those definitions' docs.
3. Every fact in the docs is written once. Changing a schema's doc changes every page that uses
   the schema.
4. The superset identity test still passes. Plain `.ts` files are unaffected.

## 2. Writing docs

### 2.1 Shape

```ts
/**
 * Bank transfers between accounts.
 *
 * @module
 */

/** An amount of money in cents. Never negative. */
export schema Money = Int.check(isGreaterThanOrEqualTo(0))

/** An account has less money than the transfer needs. */
export error InsufficientFunds { needed: Money; available: Money }

/**
 * Moves money between two accounts.
 *
 * Both balances change, or neither does.
 *
 * Moving money:
 *
 * ```efx
 * const receipt = await transfer(AccountId.make("alice"), AccountId.make("bob"), Money.make(30))
 * receipt.amount // => 30
 * ```
 *
 * Not enough money:
 *
 * ```efx
 * await transfer(AccountId.make("alice"), AccountId.make("bob"), Money.make(9999)) // => throws InsufficientFunds
 * ```
 */
export effect transfer(from: AccountId, to: AccountId, amount: Money): Receipt throws InsufficientFunds | AccountNotFound needs Ledger { … }
```

**Rules:**
- **Doc comment.** A doc comment is the last `/** … */` comment directly before a declaration,
  with only whitespace (or `export`) in between. Leading ` * ` prefixes are stripped, and the body
  is CommonMark.
- **Summary.** The summary is the first paragraph. It is what other pages quote when they link
  here, so it should make sense on its own.
- **Module doc.** A module doc is the first comment in the file, and it contains a `@module` tag.
- **Tags are optional and standard TSDoc:** `@see`, `@since`, `@deprecated`, `@module`, and
  `{@link X}` inline. `@param`, `@returns` and `@throws` are accepted and rendered, but the
  idiomatic way is not to write them (ADR-0042).
- **Document each thing where it's defined.** Parameter meaning goes on the parameter's schema,
  the meaning of an error goes on its `error` declaration, and the meaning of a service goes on
  its `service` declaration. `service` members and `schema` fields can have their own doc
  comments.

### 2.2 Examples

- **Runnable examples.** Every fenced code block with the language tag `efx` is a runnable
  example. Fences in other languages are only displayed.
- **Titles.** An example's title is the last paragraph before the fence, without a trailing `:`.
  If there is none, the title is `example N`.
- **Body.** The body is an `effect` body: `await` binds effects, and the prelude applies.
- **Scope.** All exports of the documented module are in scope.
- **Assertions:**
  - `expr // => expected` is allowed on an expression statement or a single-declarator
    `const x = expr`. It passes when `Equal.equals(actual, expected)` holds or
    `isDeepStrictEqual(actual, expected)` holds. On failure, it reports with
    `assert.deepStrictEqual` so the message carries a diff.
  - `await e // => throws Name` is allowed only on an `await` expression statement. It runs
    `Effect.exit(e)` and passes when the result is a failure whose error has `_tag === "Name"`.
- **Positions.** A `// =>` anywhere else is diagnostic EFX9302 or EFX9303.

### 2.3 Running doctests

```ts
// test/transfer.test.efx
doctest "../src/transfer.efx" with Ledger.layerTest
```

- **Syntax:** `doctest "<relative path>" [with <expr>]`, at statement position, with the string on
  the same line. This adds a row to the §4.19 trigger table, after `test`/`describe`.
- **Paths.** The path must be relative and end in `.efx` or `.ts` (EFX9304).
- **Lowering:**

  ```ts
  import __doctest_transfer from "../src/transfer.efx?doctest"
  layer(Ledger.layerTest)("doctest ../src/transfer.efx", (it) => __doctest_transfer(it))
  ```

  Without `with`, it lowers to `describe("doctest …", () => __doctest_transfer(it))`, using the
  imported `it`.
  - The local name is generated hygienically (ADR-0009).
  - `describe`, `it` and `layer` come from `@effect/vitest`, as in §4.14.
- **The `?doctest` virtual module.** The Vite plugin (`effectscript/vite`) loads it like this:
  1. Read the target file, parse it, and extract its examples into the doc model (§3.1).
  2. Generate `.efx` source that imports the module's exported names, then default-exports
     `(it) => { … }` with one `it.effect("<declaration>: <title>", () => effect { … })` per
     example, after rewriting the assertions into calls to `effectscript/doctest` helpers.
  3. Compile the result with `toTypeScript`. Pad it so every example line keeps the line number it
     has in the target file, then chain the source map so failures point into the doc comment.
- **Parse errors.** An example that fails to parse produces EFX9301 at its line in the target file.
  The whole virtual module fails, and Vitest shows that diagnostic.
- **Runtime helpers.** `effectscript/doctest` is a new runtime export of the `effectscript`
  package, with `assertDoc(actual, expected)` and `assertFailsWith(exit, tag)`.

## 3. Generating docs: `efx docs`

```
efx docs [paths] [--out docs/api] [--check] [--strict]
```

- **Inputs.** The default is the project's `src/**/*.{efx,ts}`, excluding `*.test.*` and `internal/`
  directories.
- **Exports only.** Only exported declarations are documented. A module with no exports gets no
  page.
- **Writing pages.** It writes `<out>/<module path>.md` for each module and `<out>/index.md`. The
  output directory is deleted and fully regenerated.
- **`--check`.** Writes nothing, prints the diagnostics, and exits with 1 on errors (or on warnings
  with `--strict`).

### 3.1 Doc model (internal, `core/src/docs/model.ts`)

```ts
interface DocModule { path: string; doc?: DocComment; declarations: DocDeclaration[] }
interface DocDeclaration {
  kind: "effect" | "function" | "schema" | "error" | "service" | "layer" | "config" | "command"
      | "api" | "group" | "const" | "type" | "interface" | "class"
  name: string
  location: { file: string; line: number }
  signature: string                        // as written, without the body
  params: Array<{ name: string; type?: string }>
  success?: string; failure?: string; requirements?: string   // A, E, R as written
  doc?: DocComment
  members?: DocDeclaration[]                // service members, schema fields, ADT variants
}
interface DocComment {
  summary: string; body: string            // Markdown; body excludes the summary
  examples: Array<{ title: string; code: string; line: number }>
  tags: Array<{ name: string; text: string }>
}
```

- **Built from the parse tree.** The model comes from the `.efx` AST, with no type checker, so
  values are kept exactly as written. For an `effect` declaration, A, E and R are the return type
  and the `throws` and `needs` clauses. For other functions, A is the return annotation, if there
  is one.
- **Type references are linked syntactically.** An identifier in a type position that names an
  exported declaration of a documented module (local, or reached through a relative import) links
  to that declaration's anchor. Its summary is copied into the table where it is referenced.
- **Schema constraints are shown as written** (`Int.check(isGreaterThanOrEqualTo(0))`), not
  rephrased. The text is exact, short and already familiar to Effect users.
- **One parser.** The doc-comment parser (`core/src/docs/comment.ts`) replaces `jsdocBefore` in
  `transform/command.ts`, so CLI help text and API pages read comments the same way.

### 3.2 Page layout

````md
---
title: bank/transfer
description: Bank transfers between accounts.
---

Bank transfers between accounts.

## transfer

```efx
effect transfer(from: AccountId, to: AccountId, amount: Money): Receipt throws InsufficientFunds | AccountNotFound needs Ledger
```

Moves money between two accounts.

| | |
| --- | --- |
| **amount** | [`Money`](#money): An amount of money in cents. Never negative. |
| **Returns** | [`Receipt`](#receipt): Proof that a transfer happened. |
| **Fails with** | [`InsufficientFunds`](#insufficientfunds): An account has less money than the transfer needs.<br>[`AccountNotFound`](./accounts.md#accountnotfound): No account has this id. |
| **Needs** | [`Ledger`](./ledger.md#ledger): The store of balances. |

Both balances change, or neither does.

**Moving money**

```efx
…
```
````

**Rules:**
- **Frontmatter.** `title` is the module path, and `description` is the module summary. These are
  Blume fields. Nothing else goes in the frontmatter unless the user asks for it.
- **Section order.** Declarations follow source order. Each one has a heading, its signature in an
  `efx` fence, its summary, the facts table, then the body, the examples, and the tags (rendered as
  a list).
- **Table rows.** Only rows with a linked or written type appear. A parameter whose type has no
  documented definition shows the type and no description. Rows from `@param`/`@returns`/`@throws`
  tags are merged into the same table.
- **Schemas.** A `schema` section shows its fields, or its variants for ADTs, in a table with each
  field's own doc.
- **Index.** `index.md` lists every module page with its summary.

### 3.3 Blume in `efx init`

- **What `efx init` adds:** `blume` as a devDependency, a minimal `blume.config.ts`, and the scripts
  `"docs:dev": "efx docs && blume dev"` and `"docs:build": "efx docs && blume build"`.
- **Verification.** The exact config shape is checked against Blume's quickstart while the plan is
  carried out.
- **Existing setups.** `init` doesn't overwrite an existing `blume.config.ts` or `docs/` content
  outside `docs/api/`.
- **Generated output.** `docs/api/` is generated. `init` adds it to `.gitignore`.

## 4. Diagnostics (area 9, library constructs and tooling)

| Code | Severity | When | Reported by |
| --- | --- | --- | --- |
| EFX9301 | error | An `efx` example doesn't parse | `efx docs`, `?doctest` |
| EFX9302 | error | `// =>` not on an expression statement or a single `const` | `efx docs`, `?doctest` |
| EFX9303 | error | `// => throws` not on an `await` expression statement | `efx docs`, `?doctest` |
| EFX9304 | error | A `doctest` path that isn't relative or doesn't end in `.efx`/`.ts` | compiler |
| EFX9305 | warning | A target file of a `doctest` that has no `efx` examples | `?doctest` |
| EFX9306 | warning (strict only) | `@returns`/`@throws` repeating a written return type or `throws` clause, or `@param` on a parameter whose type is a documented schema | `efx docs --check --strict` |

**Doc comments and normal compiles.** `toTypeScript` doesn't parse doc comments. Normal compiles
pay nothing for docs. Doc diagnostics come from `efx docs` and from loading a `?doctest` module.

## 5. Testing

| Layer | What | Where |
| --- | --- | --- |
| Comment parser | summary/body split, fences, titles, tags, ` * ` stripping, `command` help unchanged | `core/test/docs-comment.test.ts` |
| Model | declarations of every kind, A/E/R as written, links across relative imports | `core/test/docs-model.test.ts` |
| Pages | golden `.efx` → `.md` (`toMatchFileSnapshot`) | `core/test/docs-render.test.ts` |
| `doctest` syntax | parse, lowering with and without `with`, EFX9304, superset identity still passes | `core/test/doctest.test.ts` |
| `?doctest` | passing and failing examples under Vitest, failure line points into the doc comment | `examples/test/doctest.test.efx` |
| CLI | `efx docs` writes pages, `--check` exit codes, `init` scaffolds Blume | `core/test/cli-docs.test.ts` |

## 6. Out of scope

- Running Blume in CI here. The pages are plain Markdown, and only the scaffold is Blume-specific.
- Doctests in README or other `.md` files.
- Reporting examples that no `doctest` covers.
- Inferring A/E/R that aren't written, and showing doc diagnostics in the editor.
- A public JSON doc model (ADR-0043).
- Contracts, property tests and proofs, which are later rungs of the trust ladder (main spec §14).
