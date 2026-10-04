# EffectScript Plan 29: `is` tag tests (ADR-0087)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Commit with explicit, gated paths: another session shares the `effectscript` branch.

**Goal:** `e is TimeoutError`, `e is A or B`, `e is not A` and the predicate `is A` work through the
whole toolchain: parser, compiler, reverse compiler, type check, editor grammars, skill and site.

**Architecture:** the acorn plugin parses one new node, `IsExpression` (its `subject` is `null` for
the predicate form), with an `IsPattern`. A MagicString handler in
`core/src/compiler/transform/is.ts` rewrites it to the hand-written `_tag` comparison, taking tags
by the `catch` rule, which moves to a shared `transform/tags.ts`. `core/src/compiler/reverse/tags.ts`
recognizes the comparisons and gives the sugar back. Tree-sitter and the TextMate injection
grammar learn the forms first, because the tree-sitter test parses every fixture.

**Tech Stack:** acorn plugin (`@sveltejs/acorn-typescript`), MagicString, TypeScript 6, Vitest,
tree-sitter CLI 0.27 (ABI 14), shiki for TextMate tests, Effect v4.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` §4.4, §4.11 (`is`), §4.12,
§6.2; `docs/adr/0087-is-tests-a-tag.md`, including its Amendment 1.

## Global Constraints

- Output is plain, idiomatic Effect TypeScript, with no runtime of EffectScript's own (spec §2).
- Every `.ts` file stays valid `.efx` with the same meaning: `is`, `or` and `not` are contextual
  (spec §4.19). `core/test/superset.test.ts` must keep passing.
- The compiler stays syntactic: no type checker (ADR-0017).
- Generated code never introduces `any`.
- Every reverse rewrite compiles back to its input (ADR-0030).
- Tags follow ADR-0010's rule: a module-level `error` or tagged `schema` gives its declared tag,
  any other name its last segment.
- New diagnostics are errors: EFX7002, EFX7003, EFX7004, EFX7005 (spec §12, area 7).
- Generated files are regenerated, never hand-edited: `core/skills/effectscript/references/syntax.md`
  (`pnpm codegen` in `packages/effectscript/core`), `tree-sitter/src/*` (`pnpm generate` in
  `packages/effectscript/tree-sitter`), the query copies (`node scripts/queries.mjs` there),
  `effect-docs/content/` (`pnpm codegen` in `packages/effectscript/effect-docs`). The site's
  `content/reference` is gitignored and built.
- Tests run from the repository root as `pnpm test --run <file>`, never bare `pnpm test`.

## Review Focus

1. **Valid TypeScript keeps its meaning:** `is(x)`, `Object.is(a, b)`, `const is = 1`,
   `const or = 1, not = 2`, `is as Guard`, `is satisfies Guard`, `for (is of list) {}`, type
   predicates (`(x: unknown): x is string => true`), and a conditional whose branch is such an
   arrow (`ok ? (x: unknown): x is string => true : undefined`) all compile to themselves.
   *(Task 1, superset tests)*
2. **Output precedence:** `a && s is A or B`, `a === s is A`, a predicate used as an operand
   (`is A || f`), and an `await` subject each get parentheses exactly where JavaScript needs
   them, and nowhere else, or the reverse round trip breaks. *(Task 3)*
3. **A line break before `is` doesn't silently change meaning:** `const ok = error` followed by
   `  is RateLimited` parses as two statements and reports EFX7005. *(Tasks 1 and 3)*
4. **A misspelled tag fails the build where the user wrote it:** `failure is TimeoutErorr` is
   TS2367 at the test's line and column in `efx-tsc`. *(Task 3)*
5. **The reverse compiler never writes misleading or non-reproducing `is`:** tags named `String`
   or `default` or `not-found`, a class whose tag differs from its name, a reversed comparison,
   and a parenthesized operand in a chain stay TypeScript or convert to an exact round trip.
   *(Task 4)*

---

### Task 1: Parse `is` in the acorn plugin

**Files:**
- Modify: `packages/effectscript/core/src/compiler/parser/plugin.ts` (`parseExprOp` at line 93,
  `parseExprAtom` at line 312, new methods after `efxParseMatch`)
- Test: `packages/effectscript/core/test/parser-is.test.ts` (create)

**Interfaces:**
- Produces, for Tasks 3 and 4:
  ```ts
  // IsExpression: `subject is pattern`, or `is pattern` with subject null
  { type: "IsExpression", start, end, subject: Node | null, keyword: { start: number, end: number }, pattern: IsPattern }
  // IsPattern: tags are Identifier or MemberExpression (dotted names); any other node is kept for EFX7004
  { type: "IsPattern", start, end, negated: boolean, parenthesized: boolean, tags: Array<Node> }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { toTypeScript } from "effectscript/compiler"
import { parse } from "effectscript/compiler/parser/parse"
import { describe, expect, it } from "vitest"

const program = (source: string) => {
  const result = parse(source)
  if (result._tag === "Failure") throw new Error(result.diagnostics.map((d) => d.message).join("\n"))
  return result.program
}
const init = (source: string) => program(source).body[0].declarations[0].init
const names = (pattern: any) =>
  pattern.tags.map((t: any) => t.type === "MemberExpression" ? `${t.object.name}.${t.property.name}` : t.name)

describe("parse: is (ADR-0087)", () => {
  it("parses a test", () => {
    const node = init("const a = e is TimeoutError\n")
    expect(node.type).toBe("IsExpression")
    expect(node.subject.name).toBe("e")
    expect(names(node.pattern)).toEqual(["TimeoutError"])
    expect(node.pattern.negated).toBe(false)
  })

  it("parses dotted names, or, not and parentheses", () => {
    expect(names(init("const a = e is Cause.TimeoutError or RateLimited\n").pattern)).toEqual([
      "Cause.TimeoutError",
      "RateLimited"
    ])
    const not = init("const a = e is not A\n").pattern
    expect([not.negated, not.parenthesized, names(not)]).toEqual([true, false, ["A"]])
    const group = init("const a = e is not (A or B)\n").pattern
    expect([group.negated, group.parenthesized, names(group)]).toEqual([true, true, ["A", "B"]])
    const plain = init("const a = e is (A or B)\n").pattern
    expect([plain.negated, plain.parenthesized, names(plain)]).toEqual([false, true, ["A", "B"]])
  })

  it("parses a predicate where an expression starts", () => {
    const call = program("retry({ times: 2, while: is TimeoutError })\n").body[0].expression
    const predicate = call.arguments[0].properties[1].value
    expect(predicate.type).toBe("IsExpression")
    expect(predicate.subject).toBe(null)
    expect(names(predicate.pattern)).toEqual(["TimeoutError"])
    expect(init("const p = is not Closed\n").pattern.negated).toBe(true)
  })

  it("binds like instanceof", () => {
    const and = init("const a = ok && e is A\n")
    expect([and.type, and.right.type]).toEqual(["LogicalExpression", "IsExpression"])
    const plus = init("const a = x + y is A\n")
    expect([plus.type, plus.subject.type]).toEqual(["IsExpression", "BinaryExpression"])
    const awaited = init("const a = await load() is A\n")
    expect([awaited.type, awaited.subject.type]).toEqual(["IsExpression", "AwaitExpression"])
  })

  it("wraps after `or`, not before it", () => {
    expect(names(init("const a = e is A or\n  B\n").pattern)).toEqual(["A", "B"])
    const body = program("const a = e is A\nor(b)\n").body
    expect(body.map((s: any) => s.type)).toEqual(["VariableDeclaration", "ExpressionStatement"])
  })

  it("reads a line that starts with `is` as a predicate, not a test", () => {
    const body = program("const ok = error\n  is RateLimited\n").body
    expect(body.map((s: any) => s.type)).toEqual(["VariableDeclaration", "ExpressionStatement"])
    expect(body[1].expression.subject).toBe(null)
  })

  it("keeps a pattern that isn't a name for EFX7004", () => {
    expect(init("const a = x is 404\n").pattern.tags[0].type).toBe("Literal")
  })

  it.each([
    ["a call", "is(x)\n"],
    ["a method", "const same = Object.is(a, b)\n"],
    ["variables", "const is = 1, or = 2, not = 3\n"],
    ["as", "const g = is as Guard\n"],
    ["satisfies", "const g = is satisfies Guard\n"],
    ["for of", "for (is of list) {}\n"],
    ["a type predicate", "function f(x: unknown): x is string { return true }\n"],
    ["an arrow's type predicate", "const g = (x: unknown): x is string => true\n"],
    ["a conditional with a predicate arrow", "const h = ok ? (x: unknown): x is string => true : undefined\n"],
    ["a call on the next line", "e\nis(A)\n"]
  ])("keeps %s as TypeScript", (_, source) => {
    expect(toTypeScript(source, { filename: "plain.efx" }).code).toBe(source)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run packages/effectscript/core/test/parser-is.test.ts`
Expected: FAIL. The new-syntax cases throw an EFX1001 parse error ("Unexpected token"); the
"keeps … as TypeScript" cases pass already.

- [ ] **Step 3: Write minimal implementation**

In `plugin.ts`, add next to `typeOperators`:

```ts
/** acorn's precedence for `<`, `instanceof` and `in`: a test binds like them (ADR-0087). */
const relationalPrecedence = 7
```

At the top of `parseExprOp`, before the pipeline branch:

```ts
      if (relationalPrecedence > minPrec && this.efxIsTestAhead()) {
        const node = this.startNodeAt(leftStartPos, leftStartLoc)
        node.subject = left
        node.keyword = { start: this.start, end: this.end }
        this.next()
        node.pattern = this.efxParseIsPattern()
        this.finishNode(node, "IsExpression")
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit)
      }
```

At the top of `parseExprAtom`:

```ts
      if (this.efxIsPredicateAhead()) {
        const node = this.startNode()
        node.subject = null
        node.keyword = { start: this.start, end: this.end }
        this.next()
        node.pattern = this.efxParseIsPattern()
        return this.finishNode(node, "IsExpression")
      }
```

New methods, after `efxParseMatch`:

```ts
    // --- is (ADR-0087) ---------------------------------------------------------------------------

    /** `subject is pattern`: `is` on the line where its subject ends, the pattern on the same line. */
    efxIsTestAhead(): boolean {
      if (!this.efxIsWord("is") || lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) return false
      return this.efxSameLine(this.lookahead())
    }

    /** `is pattern` where an expression starts. `is (`, `is as`, `is satisfies`, `is of` stay TypeScript. */
    efxIsPredicateAhead(): boolean {
      if (!this.efxIsWord("is")) return false
      const next = this.lookahead()
      return next.type === tt.name && this.efxSameLine(next) && !typeOperators.has(next.value)
    }

    /** `Tag`, `Tag or Tag …`, `not Tag`, `(…)`, `not (…)`. */
    efxParseIsPattern(): any {
      const node = this.startNode()
      node.negated = false
      node.parenthesized = false
      if (this.efxIsWord("not")) {
        const next = this.lookahead()
        if (this.efxSameLine(next) && (next.type === tt.name || next.type === tt.parenL)) {
          node.negated = true
          this.next()
        }
      }
      if (this.eat(tt.parenL)) {
        node.parenthesized = true
        node.tags = this.efxParseIsTags()
        this.expect(tt.parenR)
      } else {
        node.tags = this.efxParseIsTags()
      }
      return this.finishNode(node, "IsPattern")
    }

    /** Tags joined by `or`. `or` stays on the line of the tag before it; the next tag may wrap. */
    efxParseIsTags(): Array<any> {
      const tags = [this.efxParseIsTag()]
      while (this.efxIsWord("or") && !lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
        this.next()
        tags.push(this.efxParseIsTag())
      }
      return tags
    }

    /** A name or a dotted name; anything else is kept as an expression atom for EFX7004. */
    efxParseIsTag(): any {
      if (this.type !== tt.name) return this.parseExprAtom(null, false, false)
      let tag = this.parseIdent()
      while (this.eat(tt.dot)) {
        const member = this.startNodeAt(tag.start, tag.loc.start)
        member.object = tag
        member.property = this.parseIdent(true)
        member.computed = false
        member.optional = false
        tag = this.finishNode(member, "MemberExpression")
      }
      return tag
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run packages/effectscript/core/test/parser-is.test.ts packages/effectscript/core/test/parser.test.ts packages/effectscript/core/test/superset.test.ts`
Expected: PASS. If the conditional-with-predicate-arrow case fails, the speculative arrow parse
in acorn-typescript lost to the new test: make `efxIsTestAhead` return false while
`this.inType` is set, and rerun.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core/src/compiler/parser/plugin.ts packages/effectscript/core/test/parser-is.test.ts
git commit -m "feat(effectscript): parse is tests and predicates (Plan 29 Task 1, ADR-0087)"
```

---

### Task 2: Editor grammars: tree-sitter and TextMate

**Files:**
- Modify: `packages/effectscript/tree-sitter/grammar.js` (`keywords`, `conflicts`, `expression`,
  `primary_expression`, new rules after `do_expression`)
- Modify: `packages/effectscript/tree-sitter/queries/src/highlights.scm`
- Modify: `packages/effectscript/tree-sitter/test/corpus/expressions.txt`,
  `packages/effectscript/tree-sitter/test/corpus/identifiers.txt`
- Regenerate: `packages/effectscript/tree-sitter/src/*`, `packages/effectscript/tree-sitter/queries/*.scm`,
  `packages/effectscript/tree-sitter/queries/helix/highlights.scm`,
  `packages/effectscript/zed/languages/effectscript/highlights.scm`
- Modify: `packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json`, then copy it
  to `packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json`
- Test: `packages/effectscript/core/test/blume-grammar.test.ts` (add a `describe`)

**Interfaces:**
- Consumes: the syntax of Task 1 (no code).
- Produces: tree-sitter nodes `is_expression` (fields `subject`, `pattern`), `is_predicate`
  (field `pattern`), `is_pattern` (field `tag`, repeated); TextMate scopes
  `keyword.operator.expression.is.efx` (`is`, `not`, `or`) and `entity.name.type.efx` (tags).

- [ ] **Step 1: Write the failing corpus tests and TextMate test**

Append to `tree-sitter/test/corpus/expressions.txt`:

```
=======================
is tests and predicates
=======================

const a = e is TimeoutError
const b = e is Cause.TimeoutError or RateLimited
const c = state is not (Open or Closing)
retry({ times: 2, while: is TimeoutError })

---

(program
  (lexical_declaration
    (variable_declarator
      (identifier)
      (is_expression
        (identifier)
        (is_pattern
          (identifier)))))
  (lexical_declaration
    (variable_declarator
      (identifier)
      (is_expression
        (identifier)
        (is_pattern
          (nested_identifier
            (identifier)
            (property_identifier))
          (identifier)))))
  (lexical_declaration
    (variable_declarator
      (identifier)
      (is_expression
        (identifier)
        (is_pattern
          (identifier)
          (identifier)))))
  (expression_statement
    (call_expression
      (identifier)
      (arguments
        (object
          (pair
            (property_identifier)
            (number))
          (pair
            (property_identifier)
            (is_predicate
              (is_pattern
                (identifier)))))))))
```

Append to `tree-sitter/test/corpus/identifiers.txt`:

```
=====================================
is, or and not used as identifiers
=====================================

const is = 1, or = 2, not = 3
is(x)
Object.is(a, b)

---

(program
  (lexical_declaration
    (variable_declarator
      (identifier)
      (number))
    (variable_declarator
      (identifier)
      (number))
    (variable_declarator
      (identifier)
      (number)))
  (expression_statement
    (call_expression
      (identifier)
      (arguments
        (identifier))))
  (expression_statement
    (call_expression
      (member_expression
        (identifier)
        (property_identifier))
      (arguments
        (identifier)
        (identifier)))))
```

Add to `core/test/blume-grammar.test.ts`:

```ts
describe("efx is scopes (ADR-0087)", () => {
  it("scopes is, not and or as operators and each tag as a type", async () => {
    const s = await scopesOf("const ok = error is not (RateLimited or Cause.TimeoutError)")
    expect(s.get("is")).toContain("keyword.operator.expression.is.efx")
    expect(s.get("not")).toContain("keyword.operator.expression.is.efx")
    expect(s.get("or")).toContain("keyword.operator.expression.is.efx")
    expect(s.get("RateLimited")).toContain("entity.name.type.efx")
    expect(s.get("Cause.TimeoutError")).toContain("entity.name.type.efx")
    const p = await scopesOf("retry({ times: 2, while: is TimeoutError })")
    expect(p.get("is")).toContain("keyword.operator.expression.is.efx")
    expect(p.get("TimeoutError")).toContain("entity.name.type.efx")
  })

  it.each(["const same = Object.is(a, b)", "const is = 1", "const g = is as Guard", "for (is of list) {}"])(
    "leaves is alone in %s",
    async (code) => {
      expect((await scopesOf(code)).get("is") ?? "").not.toContain("keyword.operator.expression.is.efx")
    }
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (in `packages/effectscript/tree-sitter`): `pnpm test`
Expected: the two new corpus entries fail (ERROR nodes).
Run (repository root): `pnpm test --run packages/effectscript/core/test/blume-grammar.test.ts`
Expected: the first new test fails (`is` gets no `.efx` scope).

- [ ] **Step 3: Write the grammar rules**

In `grammar.js`, add `"is"`, `"or"` and `"not"` to `keywords` (so `_reserved_identifier` keeps
them names). Then:

```js
    expression: ($, previous) => choice(previous, $.pipeline_expression, $.throw_expression, $.is_expression),
```

add `$.is_predicate` to `primary_expression`'s choice, and after `do_expression`:

```js
    // `subject is pattern` binds like `instanceof`; `is pattern` alone is a predicate (ADR-0087)
    is_expression: ($) =>
      prec.left("binary_relation", seq(field("subject", $.expression), "is", field("pattern", $.is_pattern))),

    is_predicate: ($) => prec.right(seq("is", field("pattern", $.is_pattern))),

    is_pattern: ($) => prec.left(seq(optional("not"), choice(seq("(", $._is_tags, ")"), $._is_tags))),

    _is_tags: ($) => prec.left(sep1(field("tag", choice($.identifier, $.nested_identifier)), "or")),
```

Run `pnpm generate` in `packages/effectscript/tree-sitter`. For each conflict it reports, add the
pair it names to `conflicts`, next to the existing keyword-or-construct pairs (expect
`[$.primary_expression, $.is_predicate]` and
`[$.primary_expression, $._keyword_identifier, $.is_predicate]`), and generate again until it
succeeds.

Add to `queries/src/highlights.scm`, after `(match_arm "default" @keyword)`:

```scheme
(is_expression "is" @keyword.operator)
(is_predicate "is" @keyword.operator)
(is_pattern ["not" "or"] @keyword.operator)
(is_pattern tag: (identifier) @type)
(is_pattern tag: (nested_identifier (property_identifier) @type))
```

Then run `node scripts/queries.mjs` in `packages/effectscript/tree-sitter`, which rewrites
`queries/*.scm`, the Helix copy and the Zed copy.

- [ ] **Step 4: Write the TextMate rule**

In `core/grammars/effectscript.injection.tmLanguage.json`, add `{ "include": "#is" }` to
`patterns` and this entry to `repository`:

```json
"is": {
  "match": "(?<![.$\\w])(is)\\s+(?!(?:as|satisfies|of)\\b)(?:(not)\\s+)?(\\(?\\s*[A-Za-z_$][\\w$.]*(?:\\s+or\\s+[A-Za-z_$][\\w$.]*)*\\s*\\)?)",
  "captures": {
    "1": { "name": "keyword.operator.expression.is.efx" },
    "2": { "name": "keyword.operator.expression.is.efx" },
    "3": {
      "patterns": [
        { "match": "\\bor\\b", "name": "keyword.operator.expression.is.efx" },
        { "match": "[A-Za-z_$][\\w$.]*", "name": "entity.name.type.efx" }
      ]
    }
  }
}
```

Copy it: `cp packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json packages/effectscript/vscode/syntaxes/`

- [ ] **Step 5: Run tests to verify they pass**

Run (in `packages/effectscript/tree-sitter`): `pnpm test` and `node scripts/queries.mjs --check`
Expected: `failed parses: 0`; no stale query files.
Run (repository root): `pnpm test --run packages/effectscript/tree-sitter/test/grammar.test.ts packages/effectscript/core/test/blume-grammar.test.ts packages/effectscript/core/test/blume.test.ts packages/effectscript/vscode/test/package.test.ts`
Expected: PASS.
Run: `cmp packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/tree-sitter/grammar.js packages/effectscript/tree-sitter/src packages/effectscript/tree-sitter/queries packages/effectscript/tree-sitter/test/corpus packages/effectscript/zed/languages/effectscript/highlights.scm packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json packages/effectscript/core/test/blume-grammar.test.ts
git commit -m "feat(effectscript): is tests and predicates in tree-sitter, Zed, Helix and TextMate (Plan 29 Task 2, ADR-0087)"
```

---

### Task 3: Compile `is`

**Files:**
- Create: `packages/effectscript/core/src/compiler/transform/tags.ts`
- Modify: `packages/effectscript/core/src/compiler/transform/try.ts:124-149` (use `tagOf`)
- Create: `packages/effectscript/core/src/compiler/transform/is.ts`
- Modify: `packages/effectscript/core/src/compiler/transform/registry.ts` (add `isHandlers` after
  `matchHandlers`)
- Create: `packages/effectscript/core/test/fixtures/match/is.efx` (the golden tests write
  `is.ts` and `is.reverse.efx` next to it)
- Create: `packages/effectscript/core/test/is.test.ts`
- Regenerate: `packages/effectscript/core/skills/effectscript/references/syntax.md`
- Create: `packages/effectscript/language/test/fixtures/check-is/tsconfig.json`,
  `packages/effectscript/language/test/fixtures/check-is/src/tag.efx`
- Modify: `packages/effectscript/language/test/efxTsc.test.ts`

**Interfaces:**
- Consumes: `IsExpression` and `IsPattern` from Task 1.
- Produces, for Task 4:
  ```ts
  // transform/tags.ts
  export const tagOf: (ctx: Ctx, name: Node) => string // Identifier | MemberExpression | TSQualifiedName
  export const isPlainReference: (node: Node) => boolean // a name, `this`, or property reads without calls
  ```

- [ ] **Step 1: Write the failing tests**

`core/test/fixtures/match/is.efx`:

```ts
error RateLimited { retryAfter: number }

declare const fetchUser: (id: string) => Effect<string, RateLimited>
declare const failure: RateLimited | Cause.TimeoutError | Cause.NoSuchElementError
declare const failures: Array<RateLimited | Cause.TimeoutError>

export const user = (id: string) =>
  fetchUser(id) |> timeout("2 seconds") |> retry({ times: 2, while: is TimeoutError or RateLimited })

export const transient = failure is TimeoutError or RateLimited
export const permanent = failure is not (TimeoutError or RateLimited)
export const limited: Array<RateLimited> = failures.filter(is RateLimited)
export const waitFor = failure is RateLimited ? failure.retryAfter : 0
```

`core/test/is.test.ts`:

```ts
import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { typecheck } from "./utils/typecheck.ts"

// the type-checking tests build a program over Effect's sources, slowly under load
vi.setConfig({ testTimeout: 180_000 })

const compile = (source: string) => toTypeScript(source, { filename: "is.efx" })
const code = (source: string) => {
  const result = compile(source)
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}
const codes = (source: string) => compile(source).diagnostics.map((d) => d.code)
const ab = `declare const s: { readonly _tag: "A" } | { readonly _tag: "B" }\n`

describe("is (ADR-0087)", () => {
  it("compiles a test to the tag comparison", () => {
    expect(code(`${ab}export const a = s is A\n`)).toContain(`export const a = s._tag === "A"\n`)
  })

  it("joins or with || and not with !== and &&", () => {
    const out = code(`${ab}export const a = s is A or B\nexport const b = s is not A\nexport const c = s is not (A or B)\nexport const d = s is (A or B)\n`)
    expect(out).toContain(`export const a = s._tag === "A" || s._tag === "B"\n`)
    expect(out).toContain(`export const b = s._tag !== "A"\n`)
    expect(out).toContain(`export const c = s._tag !== "A" && s._tag !== "B"\n`)
    expect(out).toContain(`export const d = s._tag === "A" || s._tag === "B"\n`)
  })

  it("compiles a predicate to an arrow", () => {
    expect(code(`${ab}export const p = [s].filter(is not (A or B))\n`)).toContain(
      `export const p = [s].filter((e) => e._tag !== "A" && e._tag !== "B")\n`
    )
  })

  it("takes a local error's declared tag and a dotted name's last segment", () => {
    const out = code(`error Late { _tag: "Timeout" }\ndeclare const e: Late | Cause.TimeoutError\nexport const a = e is Late\nexport const b = e is Cause.TimeoutError\n`)
    expect(out).toContain(`export const a = e._tag === "Timeout"\n`)
    expect(out).toContain(`export const b = e._tag === "TimeoutError"\n`)
  })

  it("doesn't import the module a tag name is qualified by", () => {
    expect(code(`${ab}export const a = s is Cause.A\n`)).not.toMatch(/import .*\bCause\b/)
  })

  it("adds parentheses only where precedence needs them", () => {
    const out = code(`${ab}declare const ok: boolean\nexport const x = ok && s is A\nexport const y = ok && s is A or B\nexport const z = ok === s is A\nexport const w = s is A === ok\nexport const v = ok ?? s is A or B\n`)
    expect(out).toContain(`export const x = ok && s._tag === "A"\n`)
    expect(out).toContain(`export const y = ok && (s._tag === "A" || s._tag === "B")\n`)
    expect(out).toContain(`export const z = ok === (s._tag === "A")\n`)
    expect(out).toContain(`export const w = s._tag === "A" === ok\n`)
    expect(out).toContain(`export const v = ok ?? (s._tag === "A" || s._tag === "B")\n`)
  })

  it("parenthesizes a subject that doesn't take ._tag as written", () => {
    expect(code(`declare const load: Effect<{ readonly _tag: "A" }>\nexport effect f() {\n  return await load is A\n}\n`)).toContain(
      `return (yield* load)._tag === "A"`
    )
  })

  it("parenthesizes a predicate used as an operand", () => {
    expect(code(`declare const f: (x: unknown) => boolean\nexport const p = is A || f\n`)).toContain(
      `export const p = ((e) => e._tag === "A") || f\n`
    )
  })

  it("reports EFX7002 for or on a subject with a call", () => {
    expect(codes(`declare const f: () => { readonly _tag: "A" }\nexport const x = f() is A or B\n`)).toContain("EFX7002")
  })

  it("reports EFX7003 for not with or and no parentheses", () => {
    expect(codes(`${ab}export const x = s is not A or B\n`)).toContain("EFX7003")
  })

  it("reports EFX7004 for a pattern that isn't a tag name", () => {
    expect(codes(`declare const x: number\nexport const a = x is 404\n`)).toContain("EFX7004")
  })

  it("reports EFX7005 for a predicate on its own as a statement", () => {
    expect(codes(`declare const error: unknown\nconst ok = error\n  is RateLimited\n`)).toContain("EFX7005")
  })

  it("type-checks: a tag the value can't have doesn't compile", () => {
    const errors = typecheck(new Map([["is-typo.ts", code(`declare const e: Cause.TimeoutError | Cause.NoSuchElementError\nexport const a = e is TimeoutErorr\n`)]]))
    expect(errors.join("\n")).toMatch(/have no overlap/)
  })

  it("type-checks: tests narrow in a conditional, in filter and in retry", () => {
    const errors = typecheck(new Map([["is-narrow.ts", code(`error RateLimited { retryAfter: number }
declare const call: Effect<string, RateLimited | Cause.NoSuchElementError>
declare const e: RateLimited | Cause.TimeoutError
declare const all: Array<RateLimited | Cause.TimeoutError>
export const after: number = e is RateLimited ? e.retryAfter : 0
export const limited: Array<RateLimited> = all.filter(is RateLimited)
export const retried: Effect<string, Cause.NoSuchElementError> = call |> retry({ while: is RateLimited })
`)]]))
    expect(errors).toEqual([])
  })
})
```

In `language/test/fixtures/check-is/`, copy `../check/tsconfig.json` as `tsconfig.json`, and write
`src/tag.efx`:

```ts
declare const failure: Cause.TimeoutError | Cause.NoSuchElementError
export const late = failure is TimeoutErorr
```

Add to `language/test/efxTsc.test.ts`, after the "reports EffectScript compiler errors too" test:

```ts
  it("reports a tag the value can't have at its is test (ADR-0087)", () => {
    const result = run("check-is")
    expect(result.stdout).toMatch(/src\/tag\.efx\(2,21\): error TS2367/)
    expect(result.status).toBe(2)
  }, 120_000)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --run packages/effectscript/core/test/is.test.ts packages/effectscript/language/test/efxTsc.test.ts`
Expected: FAIL. `is` passes through untranslated, so the output still contains `is` and the
type checks report syntax errors.

- [ ] **Step 3: Move the tag rule to `transform/tags.ts`**

```ts
/**
 * Tags from names (ADR-0010, ADR-0087): what `catch (e: T)` and `is T` compare `_tag` with.
 *
 * @since 4.0.0
 */
import type { Scope } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { Ctx } from "../context.ts"

/** `A` → `A`; `A.B`, as an expression or a type name, → `B`. */
const lastSegment = (name: Node): string =>
  name.type === "TSQualifiedName" ? name.right.name : name.type === "MemberExpression" ? name.property.name : name.name

/** Whether the nearest binding of type name `name` is the module scope. */
const boundAtModule = (ctx: Ctx, name: string): boolean => {
  for (let scope: Scope | undefined = ctx.scope; scope !== undefined; scope = scope.parent) {
    if (scope.types.has(name)) return scope === ctx.analysis.module
  }
  return false
}

/**
 * The `_tag` a name stands for: a module-level `error`'s or tagged `schema`'s declared tag,
 * otherwise the name's last segment.
 *
 * @since 4.0.0
 * @category tags
 */
export const tagOf = (ctx: Ctx, name: Node): string => {
  if (name.type === "Identifier" && boundAtModule(ctx, name.name)) {
    const tag = ctx.analysis.localTags.get(name.name)
    if (tag !== undefined) return tag
  }
  return lastSegment(name)
}

/**
 * A name, `this`, or property reads without calls: safe to read once per tag (EFX7002).
 *
 * @since 4.0.0
 * @category tags
 */
export const isPlainReference = (node: Node): boolean =>
  node.type === "Identifier" || node.type === "ThisExpression" ||
  (node.type === "MemberExpression" && node.optional !== true &&
    (!node.computed || node.property.type === "Literal") && isPlainReference(node.object))
```

In `try.ts`, delete `lastSegment` and `boundAtModule` (lines 124–132), import `tagOf` from
`./tags.ts`, and make `tagsOf` end with `return types.map((t) => tagOf(ctx, t.typeName))`. Remove
the `Scope` import if nothing else in `try.ts` uses it.

Run: `pnpm test --run packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/reverse-try.test.ts`
Expected: PASS (`catch` unchanged).

- [ ] **Step 4: Write `transform/is.ts` and register it**

```ts
/**
 * `is` tag tests (ADR-0087): `s is A` → `s._tag === "A"`, `s is A or B` →
 * `s._tag === "A" || s._tag === "B"`, `s is not A` → `s._tag !== "A"`, and `is A` alone →
 * `(e) => e._tag === "A"`. The comparison is what Effect code writes by hand, so TypeScript rejects
 * a tag the value can't have (TS2367) and narrows on it.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk } from "../walk.ts"
import { isParenthesized } from "./await.ts"
import type { HandlerGroup } from "./registry.ts"
import { isPlainReference, tagOf } from "./tags.ts"

/** Binary operator precedences, as acorn numbers them. */
const precedence: Readonly<Record<string, number>> = {
  "??": 1, "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5,
  "==": 6, "!=": 6, "===": 6, "!==": 6,
  "<": 7, ">": 7, "<=": 7, ">=": 7, instanceof: 7, in: 7,
  "<<": 8, ">>": 8, ">>>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10, "**": 11
}

/** Subjects that take `._tag` as written. */
const memberReady = new Set([
  "Identifier", "ThisExpression", "MemberExpression", "CallExpression", "TSNonNullExpression", "ChainExpression"
])

/** Whether a comparison whose loosest operator has precedence `own` needs parentheses in `parent`. */
const comparisonNeedsParens = (node: Node, parent: Node | undefined, own: number): boolean => {
  if (parent === undefined) return false
  switch (parent.type) {
    case "BinaryExpression":
    case "LogicalExpression": {
      // `??` never mixes with `||` or `&&` without parentheses
      if (parent.operator === "??" && own <= 2) return true
      const outer = precedence[parent.operator]!
      return outer > own || (outer === own && parent.right === node)
    }
    case "UnaryExpression":
    case "AwaitExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      return true
    case "MemberExpression":
      return parent.object === node
    case "CallExpression":
    case "NewExpression":
      return parent.callee === node
    case "TaggedTemplateExpression":
      return parent.tag === node
    case "IsExpression":
      return parent.subject === node
    default:
      return false
  }
}

/** Whether an arrow needs parentheses in `parent` (an operand would become part of its body). */
const arrowNeedsParens = (node: Node, parent: Node | undefined): boolean => {
  if (parent === undefined) return false
  switch (parent.type) {
    case "CallExpression":
    case "NewExpression":
      return parent.callee === node
    case "ConditionalExpression":
      return parent.test === node
    case "Property":
    case "ArrayExpression":
    case "VariableDeclarator":
    case "AssignmentExpression":
    case "AssignmentPattern":
    case "ReturnStatement":
    case "ArrowFunctionExpression":
    case "PropertyDefinition":
    case "ExportDefaultDeclaration":
    case "TemplateLiteral":
    case "SequenceExpression":
    case "SpreadElement":
    case "YieldExpression":
    case "PipelineExpression":
    case "JSXExpressionContainer":
      return false
    default:
      return true
  }
}

const wrap = (ctx: Ctx, node: Node): void => {
  ctx.s.prependRight(node.start, "(")
  ctx.s.appendLeft(node.end, ")")
}

const report = (ctx: Ctx, code: string, message: string, at: Node, hint: string): true => {
  ctx.diagnostics.push(diagnosticError(code, message, at.start, at.end, hint))
  return true
}

const isExpression: Handler = (node, parent, ctx) => {
  const subject: Node | null = node.subject
  const pattern: Node = node.pattern
  const tags: Array<Node> = pattern.tags
  const invalid = tags.find((t) => t.type !== "Identifier" && t.type !== "MemberExpression")
  if (invalid !== undefined) {
    return report(ctx, "EFX7004", "`is` takes tag names: other patterns aren't supported yet", invalid, "Compare the value directly, as in `x === 404`")
  }
  if (pattern.negated && !pattern.parenthesized && tags.length > 1) {
    return report(ctx, "EFX7003", "`not` with `or` needs parentheses", pattern, "Write `not (A or B)`")
  }
  if (subject === null && parent?.type === "ExpressionStatement") {
    return report(ctx, "EFX7005", "This predicate does nothing on its own", node, "Keep `is` on the line of the value it tests")
  }
  if (subject !== null && tags.length > 1 && !isPlainReference(subject)) {
    return report(ctx, "EFX7002", "The subject of `or` is read once per tag, so it can't contain a call", subject, "Bind it to a `const` first")
  }
  const operator = pattern.negated ? "!==" : "==="
  const join = pattern.negated ? " && " : " || "
  let target = "e"
  if (subject === null) {
    ctx.s.update(node.start, tags[0]!.start, `(e) => e._tag ${operator} `)
  } else {
    walk(subject, node, ctx)
    if (!memberReady.has(subject.type) && !isParenthesized(ctx.source, subject)) wrap(ctx, subject)
    target = ctx.s.slice(subject.start, subject.end)
    ctx.s.update(subject.end, tags[0]!.start, `._tag ${operator} `)
  }
  tags.forEach((tag, i) => {
    if (i > 0) ctx.s.update(tags[i - 1]!.end, tag.start, `${join}${target}._tag ${operator} `)
    // the last tag's edit also covers a group's `)`, so a closing parenthesis appended at the
    // node's end lands on a live chunk
    const end = i === tags.length - 1 && pattern.parenthesized ? pattern.end : tag.end
    ctx.s.update(tag.start, end, JSON.stringify(tagOf(ctx, tag)))
  })
  const needed = subject === null
    ? arrowNeedsParens(node, parent)
    : comparisonNeedsParens(node, parent, tags.length === 1 ? 6 : pattern.negated ? 2 : 1)
  if (needed && !isParenthesized(ctx.source, node)) wrap(ctx, node)
  // the pattern's names are tags, not references: they are never walked (no prelude import)
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const isHandlers: HandlerGroup = {
  IsExpression: isExpression
}
```

In `registry.ts`, import `isHandlers` from `./is.ts` and list it right after `matchHandlers` in
`handlers`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test --run packages/effectscript/core/test/is.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/typecheck.test.ts packages/effectscript/core/test/reverse-golden.test.ts`
Expected: PASS. If "doesn't import the module a tag name is qualified by" fails, the scope
analysis also reads the pattern's names: make `analyze/scope.ts` skip an `IsPattern`'s tags, as
`patternNames` already skips a `TagPattern`'s tag (line 72), and rerun. The golden tests write `test/fixtures/match/is.ts` and `is.reverse.efx`. Read
`is.ts`: its exports must read

```ts
export const user = (id: string) =>
  pipe(fetchUser(id), Effect.timeout("2 seconds"), Effect.retry({ times: 2, while: (e) => e._tag === "TimeoutError" || e._tag === "RateLimited" }))

export const transient = failure._tag === "TimeoutError" || failure._tag === "RateLimited"
export const permanent = failure._tag !== "TimeoutError" && failure._tag !== "RateLimited"
export const limited: Array<RateLimited> = failures.filter((e) => e._tag === "RateLimited")
export const waitFor = failure._tag === "RateLimited" ? failure.retryAfter : 0
```

(`is.reverse.efx` still shows the comparisons; Task 4 brings `is` back.)

Run: `pnpm test --run packages/effectscript/language/test/efxTsc.test.ts`
Expected: PASS (`src/tag.efx(2,21): error TS2367`).

- [ ] **Step 6: Regenerate the skill reference and run the checks**

Run (in `packages/effectscript/core`): `pnpm codegen`
Expected: `skills/effectscript/references/syntax.md` gains an `### Is` section under `match`.
Run: `pnpm test --run packages/effectscript/core/test/skill.test.ts packages/effectscript/core/test/superset.test.ts packages/effectscript/core/test/hygiene.test.ts packages/effectscript/tree-sitter/test/grammar.test.ts`
Expected: PASS.
Run: `pnpm lint-fix` then `pnpm check`
Expected: no errors. `lint-fix` must change only this task's files; restore anything else it
touches with `git checkout -- <path>`.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core/src/compiler/transform/tags.ts packages/effectscript/core/src/compiler/transform/is.ts packages/effectscript/core/src/compiler/transform/try.ts packages/effectscript/core/src/compiler/transform/registry.ts packages/effectscript/core/test/is.test.ts packages/effectscript/core/test/fixtures/match/is.efx packages/effectscript/core/test/fixtures/match/is.ts packages/effectscript/core/test/fixtures/match/is.reverse.efx packages/effectscript/core/skills/effectscript/references/syntax.md packages/effectscript/language/test/fixtures/check-is packages/effectscript/language/test/efxTsc.test.ts
git commit -m "feat(effectscript): is compiles to the hand-written _tag comparison, with EFX7002-EFX7005 (Plan 29 Task 3, ADR-0087)"
```

---

### Task 4: Give `is` back from TypeScript

**Files:**
- Create: `packages/effectscript/core/src/compiler/reverse/tags.ts`
- Modify: `packages/effectscript/core/src/compiler/reverse/effects.ts` (`visitNode`, after the
  `Property` line at 553)
- Create: `packages/effectscript/core/test/reverse-is.test.ts`
- Update: `packages/effectscript/core/test/fixtures/match/is.reverse.efx`
- Regenerate: `packages/effectscript/effect-docs/content/`

**Interfaces:**
- Consumes: `isPlainReference` from `transform/tags.ts` (Task 3); `Visit` from `reverse/body.ts`;
  `isParenthesized` from `transform/await.ts`; `ReverseCtx` from `reverse/context.ts`.
- Produces: `export const convertTagTest: (ctx: ReverseCtx, node: Node, visit: Visit, generator: boolean) => boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { toEffectScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

const head = `declare const failure: Cause.TimeoutError | Cause.NoSuchElementError
declare const failures: Array<Cause.TimeoutError | Cause.NoSuchElementError>
declare const ok: boolean
`
const tsHead = `import { Schema } from "effect"
declare const node: { readonly _tag: "Leaf" } | { readonly _tag: "Branch" } | { readonly _tag: "String" }
declare const nodes: Array<typeof node>
`
/** Converts TypeScript, checks ADR-0030, and returns the EffectScript. */
const back = (ts: string) => expectSafe(`${tsHead}${ts}`).code

describe("reverse: is (ADR-0087)", () => {
  it.each([
    ["a test", "export const a = failure is TimeoutError\n"],
    ["or", "export const a = failure is TimeoutError or NoSuchElementError\n"],
    ["not", "export const a = failure is not TimeoutError\n"],
    ["not with or", "export const a = failure is not (TimeoutError or NoSuchElementError)\n"],
    ["a predicate", "export const a = failures.filter(is TimeoutError)\n"],
    ["a test inside a wider condition", "export const a = ok && failure is TimeoutError\n"]
  ])("gives back %s", (_, efx) => {
    expect(roundTrip(`${head}${efx}`)).toContain(efx)
  })

  it("keeps the parentheses around or inside a wider condition", () => {
    expect(roundTrip(`${head}export const a = ok && failure is TimeoutError or NoSuchElementError\n`)).toContain(
      "export const a = ok && (failure is TimeoutError or NoSuchElementError)\n"
    )
  })

  it("converts hand-written comparisons", () => {
    const efx = back(`export const a = node._tag === "Leaf"
export const b = node._tag !== "Leaf"
export const c = node._tag === "Leaf" || node._tag === "Branch"
export const d = nodes.filter((e) => e._tag === "Leaf")
export const f = nodes.filter((n) => n._tag === "Leaf")
export const g = (node._tag === "Leaf") || node._tag === "Branch"
export const h = node._tag === "Leaf" || nodes[0]!._tag === "Branch"
`)
    expect(efx).toContain("export const a = node is Leaf\n")
    expect(efx).toContain("export const b = node is not Leaf\n")
    expect(efx).toContain("export const c = node is Leaf or Branch\n")
    expect(efx).toContain("export const d = nodes.filter(is Leaf)\n")
    expect(efx).toContain("export const f = nodes.filter((n) => n is Leaf)\n")
    // not chains (a parenthesized operand, two subjects): each test converts on its own
    expect(efx).toContain("export const g = (node is Leaf) || node is Branch\n")
    expect(efx).toContain("export const h = node is Leaf || nodes[0]! is Branch\n")
  })

  it("names a tag after the one class that has it", () => {
    const efx = back(`export class Late extends Schema.TaggedError<Late>()("Timeout", {}) {}
declare const late: Late | { readonly _tag: "Late" }
export const a = late._tag === "Timeout"
export const b = late._tag === "Late"
`)
    expect(efx).toContain("export const a = late is Late\n")
    expect(efx).toContain(`export const b = late._tag === "Late"\n`)
  })

  it.each([
    ["a primitive's name", `export const a = node._tag === "String"\n`],
    ["a reserved word", `export const a = node._tag === "default"\n`],
    ["a tag that isn't a name", `export const a = node._tag === "not-found"\n`],
    ["a reversed comparison", `export const a = "Leaf" === node._tag\n`]
  ])("leaves %s as TypeScript", (_, ts) => {
    expect(back(ts)).toContain(ts)
  })

  it("is a no-op without an effect import", () => {
    const ts = `declare const n: { readonly _tag: "Leaf" }\nexport const a = n._tag === "Leaf"\n`
    expect(toEffectScript(ts).code).toBe(ts)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test --run packages/effectscript/core/test/reverse-is.test.ts`
Expected: FAIL. The comparisons stay TypeScript, so the "gives back" and "converts" cases fail;
the "leaves" cases and the no-op already pass.

- [ ] **Step 3: Write `reverse/tags.ts`**

```ts
/**
 * `s._tag === "A"` → `s is A`, its `||` and `&&` chains → `or`, and `(e) => e._tag === "A"` →
 * `is A` (ADR-0087). Each rewrite compiles back to its input (ADR-0030).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { isParenthesized } from "../transform/await.ts"
import { isPlainReference } from "../transform/tags.ts"
import type { Visit } from "./body.ts"
import type { ReverseCtx } from "./context.ts"

const identifierName = /^[A-Za-z_$][\w$]*$/

/** Names that can't follow `is` as a tag, or that read as TC39's primitive checks (ADR-0087 Amendment 1). */
const refused = new Set([
  "as", "satisfies", "of", "or", "not", "String", "Number", "Boolean", "BigInt", "Symbol",
  "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
  "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "implements",
  "import", "in", "instanceof", "interface", "let", "new", "null", "package", "private", "protected",
  "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "var",
  "void", "while", "with", "yield"
])

interface Test {
  readonly node: Node
  readonly subject: Node
  readonly tag: string
  readonly negated: boolean
}

/** `s._tag === "A"` or `s._tag !== "A"`. */
const tagTest = (node: Node): Test | undefined => {
  if (node.type !== "BinaryExpression" || (node.operator !== "===" && node.operator !== "!==")) return undefined
  const left: Node = node.left
  const right: Node = node.right
  if (left.type !== "MemberExpression" || left.computed || left.optional || left.property.name !== "_tag") return undefined
  if (right.type !== "Literal" || typeof right.value !== "string") return undefined
  return { node, subject: left.object, tag: right.value, negated: node.operator === "!==" }
}

/** One test, or a chain on one plain subject: `||` of `===`, or `&&` of `!==`. */
const chainOf = (ctx: ReverseCtx, node: Node): ReadonlyArray<Test> | undefined => {
  const single = tagTest(node)
  if (single !== undefined) return [single]
  if (node.type !== "LogicalExpression" || (node.operator !== "||" && node.operator !== "&&")) return undefined
  const operands: Array<Node> = []
  const flatten = (n: Node): void => {
    if (n.type === "LogicalExpression" && n.operator === node.operator && (n === node || !isParenthesized(ctx.source, n))) {
      flatten(n.left)
      flatten(n.right)
    } else {
      operands.push(n)
    }
  }
  flatten(node)
  if (operands.some((n) => isParenthesized(ctx.source, n))) return undefined
  const tests = operands.map(tagTest)
  const negated = node.operator === "&&"
  if (tests.some((t) => t === undefined || t.negated !== negated)) return undefined
  const text = (t: Test) => ctx.source.slice(t.subject.start, t.subject.end)
  const first = tests[0]!
  if (!isPlainReference(first.subject) || tests.some((t) => text(t!) !== text(first))) return undefined
  return tests as ReadonlyArray<Test>
}

/** The name `is` writes for a tag: the one module class that has it, or the tag itself when the forward compiler reads it back. */
const nameFor = (ctx: ReverseCtx, tag: string): string | undefined => {
  if (!identifierName.test(tag) || refused.has(tag)) return undefined
  const owners = [...ctx.analysis.localTags].filter(([, t]) => t === tag).map(([name]) => name)
  if (owners.length === 1) return owners[0]
  const own = ctx.analysis.localTags.get(tag)
  return own === undefined || own === tag ? tag : undefined
}

const patternText = (tests: ReadonlyArray<Test>, names: ReadonlyArray<string>): string => {
  const negated = tests[0]!.negated
  const list = names.join(" or ")
  return negated ? (names.length > 1 ? `not (${list})` : `not ${list}`) : list
}

/** The `.` of `s._tag`: everything from it to the test's end is replaced. */
const dotOf = (ctx: ReverseCtx, test: Test): number => ctx.source.lastIndexOf(".", test.node.left.property.start)

const convertPredicate = (ctx: ReverseCtx, node: Node): boolean => {
  if (node.async === true || node.params.length !== 1 || node.returnType || node.typeParameters) return false
  const param: Node = node.params[0]
  if (param.type !== "Identifier" || param.name !== "e" || param.typeAnnotation) return false
  if (ctx.source[node.start] !== "(" || node.body.type === "BlockStatement" || isParenthesized(ctx.source, node.body)) {
    return false
  }
  const tests = chainOf(ctx, node.body)
  if (tests === undefined || tests.some((t) => t.subject.type !== "Identifier" || t.subject.name !== "e")) return false
  const names = tests.map((t) => nameFor(ctx, t.tag))
  if (names.some((n) => n === undefined)) return false
  ctx.s.update(node.start, node.end, `is ${patternText(tests, names as Array<string>)}`)
  return true
}

/**
 * @since 4.0.0
 * @category reverse
 */
export const convertTagTest = (ctx: ReverseCtx, node: Node, visit: Visit, generator: boolean): boolean => {
  if (node.type === "ArrowFunctionExpression") return convertPredicate(ctx, node)
  const tests = chainOf(ctx, node)
  if (tests === undefined) return false
  const names = tests.map((t) => nameFor(ctx, t.tag))
  if (names.some((n) => n === undefined)) return false
  visit(tests[0]!.subject, tests[0]!.node.left, generator)
  ctx.s.update(dotOf(ctx, tests[0]!), node.end, ` is ${patternText(tests, names as Array<string>)}`)
  return true
}
```

In `effects.ts`, import `convertTagTest` from `./tags.ts`, and add after the `Property` line in
`visitNode`:

```ts
    if (
      (node.type === "BinaryExpression" || node.type === "LogicalExpression" ||
        node.type === "ArrowFunctionExpression") && convertTagTest(ctx, node, visit, generator)
    ) {
      return
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --run packages/effectscript/core/test/reverse-is.test.ts`
Expected: PASS.
Run: `pnpm test --run packages/effectscript/core/test/reverse-golden.test.ts -u`, then
`git diff packages/effectscript/core/test/fixtures/match/is.reverse.efx`
Expected: the snapshot now equals `is.efx`, apart from the declarations' normalized spelling.
Run: `pnpm test --run packages/effectscript/core/test/reverse-golden.test.ts packages/effectscript/core/test/reverse-corpus.test.ts packages/effectscript/core/test/reverse-match.test.ts packages/effectscript/core/test/reverse-try.test.ts packages/effectscript/core/test/convert.test.ts`
Expected: PASS. A corpus failure names the shape that didn't compile back: fix `chainOf` or
`nameFor` for it and add the shape to `reverse-is.test.ts`.

- [ ] **Step 5: Regenerate the translated Effect docs**

Run (in `packages/effectscript/effect-docs`): `pnpm codegen`
Expected: `wrote N files to content/`; `git diff --stat packages/effectscript/effect-docs/content`
shows the `_tag` comparisons becoming `is` (about 38 of them).
Run: `pnpm test --run packages/effectscript/effect-docs/test/generate.test.ts packages/effectscript/core/test/skill.test.ts packages/effectscript/tree-sitter/test/grammar.test.ts`
Expected: PASS.
Run: `pnpm lint-fix` then `pnpm check`
Expected: no errors; restore any file outside this task that `lint-fix` touched.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core/src/compiler/reverse/tags.ts packages/effectscript/core/src/compiler/reverse/effects.ts packages/effectscript/core/test/reverse-is.test.ts packages/effectscript/core/test/fixtures/match/is.reverse.efx packages/effectscript/effect-docs/content
git commit -m "feat(effectscript): the reverse compiler gives is back from _tag comparisons (Plan 29 Task 4, ADR-0087)"
```

---

### Task 5: Teach `is`: the site sample and the hand-written skill

**Files:**
- Modify: `packages/effectscript/site/src/samples/errors/app.efx`
- Modify: `packages/effectscript/core/skills/effectscript/references/patterns.md` (section
  "Retries, timeouts and schedules", line 488)
- Modify: `packages/effectscript/core/skills/effectscript/references/pitfalls.md` (new section
  before "Free names become Effect builtins", line 194)
- Modify: `docs/superpowers/plans/2026-10-05-effectscript-29-is-tag-tests.md` (execution record)

**Interfaces:**
- Consumes: the compiler of Tasks 3 and 4.

- [ ] **Step 1: Update the sample**

In `site/src/samples/errors/app.efx`, replace the retry and catch lines:

```ts
      |> retry({ times: 2, while: is TimeoutError })
  } catch (e: TimeoutError) {
```

Run: `pnpm test --run packages/effectscript/site/test/gallery.test.ts`
Expected: PASS ("compiles every EffectScript sample without errors", "type-checks every sample's
Effect TypeScript", and "tell the same story" still finds `times: 2`).

- [ ] **Step 2: Add the pattern and the pitfall**

After the code block in "Retries, timeouts and schedules" in `patterns.md`:

````md
Retry only some errors by naming them with `is`, which compiles to the `_tag` comparison:

```efx
error RateLimited { retryAfter: number }

declare const fetchUser: (id: string) => Effect<string, RateLimited>

export effect loadUser(id: string): string throws RateLimited | Cause.TimeoutError {
  return await fetchUser(id)
    |> timeout("2 seconds")
    |> retry({ times: 2, while: is TimeoutError or RateLimited })
}
```
````

New section in `pitfalls.md`, before "Free names become Effect builtins":

````md
## `is` stays on the line of the value it tests

`error is RateLimited` tests a tag, and `is RateLimited` alone is a predicate. A line that starts
with `is` is a predicate, so `const ok = error` followed by `is RateLimited` on the next line is
two statements; the compiler reports it (EFX7005). Wrap after `or` instead:

```efx
error RateLimited { retryAfter: number }

declare const error: RateLimited | Cause.TimeoutError

export const transient = error is RateLimited or
  TimeoutError
```

The value must have a `_tag`: test `x !== null && x is A` for a value that may be `null`.
````

Run: `pnpm test --run packages/effectscript/core/test/skill.test.ts packages/effectscript/tree-sitter/test/grammar.test.ts`
Expected: PASS (both examples compile clean in strict mode and type-check).

- [ ] **Step 3: Record the execution**

Append an `## Execution record` to this plan: the rulings made while implementing, the TDD gaps
(tests written after code, if any), and anything deferred.

- [ ] **Step 4: Commit**

```bash
git add packages/effectscript/site/src/samples/errors/app.efx packages/effectscript/core/skills/effectscript/references/patterns.md packages/effectscript/core/skills/effectscript/references/pitfalls.md docs/superpowers/plans/2026-10-05-effectscript-29-is-tag-tests.md
git commit -m "docs(effectscript): the errors sample and the skill retry with is (Plan 29 Task 5, ADR-0087)"
```
