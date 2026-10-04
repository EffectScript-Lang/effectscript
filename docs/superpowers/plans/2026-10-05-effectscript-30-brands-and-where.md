# EffectScript Plan 30: `brand` declarations and `where` checks (ADR-0077)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans. Steps use `- [ ]`. Execute task by task with TDD. Decisions are
> recorded in `docs/adr/`. Commit with explicit, gated paths (other sessions share the branch):
> `pnpm check && pnpm lint && git commit <paths>`.

**Goal:** `brand UserId = string` declares a schema branded with its own name, and `where` attaches
Schema checks to a declaration's or a field's type, through the whole toolchain: parser, compiler,
reverse compiler, tree-sitter, TextMate, `efx docs`, the skill, the site and the docs corpus.

**Architecture:** the usual path for a construct (fixture, parser, scope, transform, reverse,
editors, docs), in four layers:

- **Parser** (`core/src/compiler/parser/plugin.ts`): a `BrandDeclaration` node, and a `WhereClause`
  node (`{ keyword, checks }`) stored as `efxWhere` on the field or declaration it ends. Misplaced
  checks are parse errors with their own codes, carried through `parse.ts`.
- **Lowering** (`core/src/compiler/schema/mapping.ts`): `checkedParts` builds the text around the
  checks (`open` ends with `.check(`, `close` closes it and any `NullOr`/`optionalKey` wrapper).
  Class fields, aliases and brands lower in place with `lowerChecks`, so the editor still maps the
  check expressions. Fields written out whole (type-literal members, ADT variants, signature lines,
  endpoint sections) use `fieldSchema`, which reads each check's text back with `ctx.s.slice` after
  walking it once.
- **Reverse** (`core/src/compiler/reverse/`): `checkedOf` recognizes `S.check(…)`, `typeParts` reads
  a field's or a declaration's type and checks, and a `Where` renderer turns check arguments back
  into a `where` list with `Schema.` dropped where the forward compiler would add it.
- **Editors:** a tree-sitter grammar change, already prototyped and verified (generates with tree-sitter
  0.27, the existing corpus passes 32/32, plain TypeScript members named `where` parse unchanged),
  and TextMate scopes.

**Tech stack:** acorn + `@sveltejs/acorn-typescript` plugin, MagicString 1.4, TypeScript 6,
tree-sitter CLI 0.27 (ABI 14), shiki (TextMate tests), Effect v4 Schema (`check`, `brand`,
`toJsonSchemaDocument`), `effect/ai` `Tool.getJsonSchema`.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` §4.6 (brands and `where`), §4.7,
§4.14 (signature lines, endpoint sections, tools, `config`), §4.19 (triggers), §6.2 and §6.4
(reverse); ADR-0077. Read both first.

## Global Constraints

- **Plain output.** Every construct compiles to idiomatic Effect TypeScript, with no runtime of
  EffectScript's own.
- **Superset.** Every `.ts` file stays valid `.efx`:
  - `brand` is a keyword only in statement position (optionally after `export`), followed on the
    same line by an identifier and `=` (or `<`, to refuse type parameters).
  - `where` is a keyword only on the same line as the end of a schema field's type or a
    `brand`/`schema` alias's type.
  - `core/test/superset.test.ts` and tree-sitter's superset test (`tree-sitter/test/grammar.test.ts`)
    stay green.
- **Lowering** (ADR-0077):
  - `brand X = T where c` → `const X = <T>.check(c).pipe(Schema.brand("X"))` and
    `type X = typeof X.Type`. Checks come before the brand; the key is the declared name.
  - `null` and `undefined` stay outside the checks (`Schema.NullOr(T.check(c))`), and an optional
    field's `optionalKey`/`optional` wraps them.
  - A `where` list compiles to one `.check(a, b)` on one line, whatever its source layout.
- **Diagnostics** (exact texts):
  - **EFX3002** (parser): "A brand can't have type parameters"
  - **EFX3005** (parser):
    - "`where` checks a field or a declaration, not a nested type", hint "write the field as `name = <Schema expression>`"
    - "`where` comes after the whole type", hint "write `T | null where …`"
    - "`where` isn't available on `config` fields", hint "give the field a `brand` or alias type that carries the checks"
    - "`where` isn't available on `command` parameters", hint "check the value in the command's body"
    - "A field with `where` checks can't also have `= <schema>`", hint "put the checks in the expression: `name = T.check(…)`"
  - **EFX3005** (compiler): "`where` needs a type to check besides `null` and `undefined`"
  - **EFX3006** (compiler): "A brand can't include `null` or `undefined`", hint "brand the value, and write `<Name> | null` where it's used" (with the brand's name)
- **Hygiene** (ADR-0009): `Schema` is always reached through `schemaRef`/`ref`.
- **Left alone:** `examples/src/bank.efx`, `core/test/docs/fixtures/bank/accounts.efx` and Plans
  24–27 keep `schema Money = Int & Brand<"Money">` (ADR-0077: their laws need a `Money` that can be
  negative, and the long form still compiles).
- **Shared files.** Other sessions edit `site/src/playground/*`, `site/test/playground.test.ts`,
  `docs/adr/README.md`, and (Plan 29, ADR-0087) the parser, scope analysis and grammars. Find code by
  method name, not line number. Before committing a shared file, run `git diff <file>`; if it holds
  hunks that aren't yours, commit only yours (`git diff <file> > /tmp/mine.patch`, delete the other
  hunks, `git apply --cached /tmp/mine.patch`, then `git commit` without paths).
- Nothing is published. Brand files (`packages/effectscript/brand/`) are never edited.

## Review Focus

1. **Names that stay TypeScript.** These must keep their TypeScript meaning:
   - a schema field named `where`, and a method `where(…)` on the line after a typed field;
   - `const brand = …` with `brand(…)`, and `brand as Foo`;
   - an interface or type literal with a member named `where` on its own line;
   - a parameter `(where: any) =>`.

   *(Task 1 and Task 2 parser tests; Task 5 tree-sitter corpus.)*
2. **`null`, `undefined` and `?` around checks.** All six combinations land inside the right wrapper:
   - `?`
   - `?` with `| undefined`
   - `| null`
   - `| undefined`
   - `| null | undefined`
   - `?` with `| null | undefined`

   `string where c | null` is EFX3005 with its hint, never a confusing type error. *(Task 2.)*
3. **Commas inside and between checks.**
   - `isBetween({ minimum: 1, maximum: 2 })` doesn't split at its inner commas.
   - `a: T where c1, c2, b: U` splits at `b:`, including after a quoted key or `readonly`.
   - A list written over several lines compiles to one line.

   *(Task 1 and Task 3 parser tests; Task 2 compile test.)*
4. **Names inside checks.**
   - A module binding named like a Schema builtin stays bare.
   - An arrow parameter named like a builtin (`(check: string) => …`) isn't qualified.
   - A builtin is qualified exactly once, even when a commented struct alias is rendered twice.

   *(Task 2, Task 3.)*
5. **Round trips that must not sugar.**
   - A brand whose key isn't its name stays `T & Brand<"K">`.
   - A check on a nullable union, or two chained `.check`s, stays an `=` field.
   - A local binding that shadows a builtin keeps `Schema.` in the `where` list.

   *(Task 4.)*

## File map

| File | Responsibility | Task |
| ---- | -------------- | ---- |
| `core/src/compiler/parser/plugin.ts` | `brand`, `where`, coded parse errors | 1–3 |
| `core/src/compiler/parser/parse.ts` | a parse error's own code and hint | 1 |
| `core/src/compiler/analyze/scope.ts` | brands declare a value and a type; checks are visited | 1, 3 |
| `core/src/compiler/schema/mapping.ts` | `checksText`, `checkedParts`, `lowerChecks`, `fieldSchema`; struct members | 1–3 |
| `core/src/compiler/transform/schema.ts` | `brand`, alias `where`, ADT variant fields | 1–3 |
| `core/src/compiler/transform/classLike.ts` | class fields with `where` | 2 |
| `core/src/compiler/transform/library.ts`, `httpApi.ts` | signature fields, endpoint section fields | 3 |
| `core/src/compiler/reverse/checks.ts` (new) | check arguments back to `where` text | 4 |
| `core/src/compiler/reverse/types.ts`, `classes.ts`, `library.ts`, `httpApi.ts` | reverse `brand` and `where` | 4 |
| `tree-sitter/grammar.js`, `queries/src/highlights.scm`, `test/corpus/data.txt`; `zed/languages/effectscript/outline.scm` | editors | 5 |
| `core/grammars/effectscript.injection.tmLanguage.json` (+ copy in `vscode/syntaxes/`) | TextMate | 5 |
| `core/src/doc/model.ts` | a `brand` kind in `efx docs` | 5 |
| `core/test/brand-where.test.ts` (new) | parser, compiler, runtime and reverse tests | 1–4 |
| `core/test/fixtures/schema/brand.efx`, `where.efx`, `where-members.efx`; `ai/checked.efx`; `rpc/checked.efx`; `http/checked.efx` (each with `.ts` and, from the tests, `.reverse.efx`) | goldens | 1–4 |
| skill, site sample, playground preset, docs corpus, spec | docs | 2, 6 |

All paths below are relative to the repository root unless they start with `core/`, `tree-sitter/`,
`site/`, `zed/`, `vscode/` or `effect-docs/`, which live under `packages/effectscript/`.

---

### Task 1: `brand` end to end

**Files:**
- Modify: `core/src/compiler/parser/plugin.ts`:
  - `interface EfxState` and `efxState()` (top of the file);
  - `parseStatement` and `shouldParseExportStatement`;
  - new methods after `efxParseSchemaAlias`.
- Modify: `core/src/compiler/parser/parse.ts` (`ParseError`, `toParseError`, the failure diagnostic in `parse`).
- Modify: `core/src/compiler/analyze/scope.ts` (a `visitChecks` helper next to `visitChildren`; the
  `"SchemaAliasDeclaration"` case).
- Modify: `core/src/compiler/schema/mapping.ts` (`checksText`, `checkedParts`, `lowerChecks`).
- Modify: `core/src/compiler/transform/schema.ts` (`writeDeclaration`, `brandDeclaration`,
  `schemaAlias`, `schemaHandlers`).
- Create: `core/test/brand-where.test.ts`; `core/test/fixtures/schema/brand.efx` and `brand.ts`.

**Interfaces:**
- Produces:
  - **`WhereClause` node:** `{ type: "WhereClause", start, end, keyword: { start: number; end: number }, checks: Array<Node> }`.
    `end` is the last check's end. Each check is a conditional-level expression (no assignment, no
    comma operator).
  - **`BrandDeclaration` node:** `{ keyword, id: Identifier, typeAnnotation: <TS type node>, efxWhere: WhereClause | null }`,
    inside `ExportNamedDeclaration.declaration` when exported.
  - **`SchemaAliasDeclaration.efxWhere`:** `WhereClause | null`.
  - **Parser methods:** `efxParseWhere(): WhereClause | null` (only when `where` is on the type's
    line), `efxInSchemaType<A>(f: () => A): A`, and `efxRaise(pos, code, message, hint?): never`.
  - **Parse errors:** a thrown error may carry `efxCode` and `efxHint`; `parse()` reports them with
    that code (EFX1001 otherwise).
  - **`mapping.ts`:**
    - `checksText(ctx: Ctx, clause: Node): string` walks the checks once in place, then reads them back as `a, b`.
    - `checkedParts(ctx: Ctx, type: Node, optional: boolean, clause: Node): { readonly open: string; readonly close: string }`.
    - `lowerChecks(ctx: Ctx, from: number, clause: Node, open: string, close: string): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/effectscript/core/test/brand-where.test.ts
import { parse, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const program = (source: string): any => {
  const result = parse(source)
  if (result._tag !== "Success") throw new Error(`parse failed: ${JSON.stringify(result.diagnostics)}`)
  return result.program
}

const failure = (source: string) => {
  const result = parse(source)
  if (result._tag === "Success") throw new Error(`expected a parse error: ${source}`)
  return result.diagnostics[0]!
}

/** A clause's checks as written. */
const checks = (source: string, clause: any): Array<string> | null =>
  clause?.checks.map((c: any) => source.slice(c.start, c.end)) ?? null

const compile = (source: string) => toTypeScript(source, { filename: "t.efx", packageName: "t" })

const code = (source: string): string => {
  const result = compile(source)
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}

describe("brand: parsing (ADR-0077)", () => {
  it("reads `brand Name = Type [where …]`, exported or not", () => {
    const source = "brand UserId = string\nexport brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })\n"
    const [plain, exported] = program(source).body
    expect([plain.type, plain.id.name, plain.efxWhere]).toEqual(["BrandDeclaration", "UserId", null])
    expect(exported.declaration.type).toBe("BrandDeclaration")
    expect(checks(source, exported.declaration.efxWhere)).toEqual(["isBetween({ minimum: 1, maximum: 65535 })"])
  })

  it("reads a list, on one line or continued after `where` and after a comma", () => {
    const one = "brand Pair = Int where isGreaterThan(0), isLessThan(10)\nconst x = 1\n"
    expect(checks(one, program(one).body[0].efxWhere)).toEqual(["isGreaterThan(0)", "isLessThan(10)"])
    expect(program(one).body[1].type).toBe("VariableDeclaration")
    const many = "brand P = Int where\n  isGreaterThan(0),\n  isLessThan(10)\nconst x = 1\n"
    expect(checks(many, program(many).body[0].efxWhere)).toEqual(["isGreaterThan(0)", "isLessThan(10)"])
    expect(program(many).body[1].type).toBe("VariableDeclaration")
  })

  it("refuses type parameters, and a union after the checks", () => {
    expect(failure("brand Box<T> = string\n")).toMatchObject({
      code: "EFX3002",
      message: "A brand can't have type parameters"
    })
    expect(failure("brand B = string where isMaxLength(5) | null\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` comes after the whole type",
      hint: "write `T | null where …`"
    })
  })

  it("keeps `brand` and `where` as names everywhere else", () => {
    const source = [
      "const brand = (x: number) => x",
      "brand(1)",
      "brand as unknown",
      "const where = 2",
      "export const f = (where: number) => where",
      ""
    ].join("\n")
    expect(toTypeScript(source).code).toBe(source)
  })
})

describe("brand: compiling (ADR-0077)", () => {
  it("brands with the declared name, checks first", () => {
    expect(code("brand Port = Int where isGreaterThan(0), isLessThan(65536)\n")).toBe(
      "import { Schema } from \"effect\"\n" +
        "const Port = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThan(65536)).pipe(Schema.brand(\"Port\"))\n" +
        "type Port = typeof Port.Type\n"
    )
  })

  it("refuses a brand that includes null or undefined", () => {
    const result = compile("brand MaybeId = string | null\n")
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "EFX3006",
      message: "A brand can't include `null` or `undefined`",
      hint: "brand the value, and write `MaybeId | null` where it's used"
    }))
  })

  it("compiles the long form exactly as before", () => {
    expect(code("schema UserId = string & Brand<\"UserId\">\n")).toBe(code("brand UserId = string\n"))
  })

  it("maps a brand's name to its const, so hover and go to definition work", () => {
    const source = "brand UserId = string where isNonEmpty()\n"
    const result = compile(source)
    const name = source.indexOf("UserId")
    const mapping = result.mappings.find((m) =>
      m.sourceOffsets[0]! <= name && name < m.sourceOffsets[0]! + m.lengths[0]!
    )!
    expect(mapping.data.navigation).toBe(true)
    const generated = mapping.generatedOffsets[0]! + (name - mapping.sourceOffsets[0]!)
    expect(result.code.slice(generated)).toMatch(/^UserId = Schema\.String\.check\(/)
  })

  it("checks in `make`", async () => {
    const mod = await runCompiled(`
      export brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })
      export const ok = Port.make(8080)
      export const refused = (() => {
        try {
          Port.make(70000)
          return false
        } catch {
          return true
        }
      })()
    `)
    expect(mod.ok).toBe(8080)
    expect(mod.refused).toBe(true)
  })
})
```

Golden fixture `core/test/fixtures/schema/brand.efx`:

```efx
/** A user's id. */
export brand UserId = string

/** A TCP port. */
export brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })

/** An administrator's id: a user id, branded again. */
export brand AdminId = UserId

brand Plan = "free" | "pro"
```

and its expected output `core/test/fixtures/schema/brand.ts` (this text was type-checked against the
workspace `effect` while writing the plan; a brand of a brand is assignable to the inner brand):

```ts
import { Schema } from "effect"
/** A user's id. */
export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

/** A TCP port. */
export const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).pipe(Schema.brand("Port"))
export type Port = typeof Port.Type

/** An administrator's id: a user id, branded again. */
export const AdminId = UserId.pipe(Schema.brand("AdminId"))
export type AdminId = typeof AdminId.Type

const Plan = Schema.Literals(["free", "pro"]).pipe(Schema.brand("Plan"))
type Plan = typeof Plan.Type
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts`

Expected:
- The parsing tests fail: `brand UserId = string` is EFX1001, since acorn reads two identifiers.
- The names test passes.
- The compile tests and the `schema/brand.efx` golden fail.

- [ ] **Step 3: Implement the parser**

In `plugin.ts`:

- **`EfxState`:** add two members, and initialize them in `efxState()`:

  ```ts
  /** Above 0 while parsing a field's or a declaration's type, where `where` may follow (ADR-0077). */
  schemaTypes: number
  /** The type members being parsed, innermost last: a member's `where` attaches to it. */
  readonly members: Array<any>
  ```

  ```ts
  return (this.efx ??= {
    pipeDepth: 0,
    arrowStarts: new Set<number>(),
    classKinds: [],
    classNodes: [],
    schemaTypes: 0,
    members: []
  })
  ```

- **`parseStatement`:** add `if (this.efxIsBrandStart()) return this.efxParseBrand()` before the
  `schema` line. **`shouldParseExportStatement`:** add `this.efxIsBrandStart() ||` to the chain.
- **New methods**, after `efxParseSchemaAlias` (the parse probe for this plan ran this exact code):

  ```ts
  /** A parse error with its own code (ADR-0077); other parse errors are EFX1001. */
  efxRaise(pos: number, code: string, message: string, hint?: string): never {
    try {
      super.raise(pos, message)
    } catch (error) {
      Object.assign(error as object, { efxCode: code, efxHint: hint })
      throw error
    }
    throw new Error("unreachable")
  }

  // `Array<string where c>`: checks belong to a field or a declaration (ADR-0077)
  raise(pos: number, message: string): never {
    if (this.efxState().schemaTypes > 0 && pos === this.start && this.efxIsWord("where")) {
      return this.efxRaise(
        pos,
        "EFX3005",
        "`where` checks a field or a declaration, not a nested type",
        "write the field as `name = <Schema expression>`"
      )
    }
    return super.raise(pos, message)
  }

  /** Parses `f()` as a field's or a declaration's type, which `where` may follow (ADR-0077). */
  efxInSchemaType<A>(f: () => A): A {
    const state = this.efxState()
    state.schemaTypes++
    try {
      return f()
    } finally {
      state.schemaTypes--
    }
  }

  /** After a `,`: the next member or parameter (`name:`, `name?:`, `"name":`, `readonly name:`). */
  efxMemberAfterComma(): boolean {
    return /^\s*(?:readonly\s+)?(?:[A-Za-z_$][\w$]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')\s*\??\s*:/.test(
      this.input.slice(this.end)
    )
  }

  /**
   * `where check, …` after a field's or a declaration's type, on the type's line (ADR-0077), or
   * `null`. A comma that starts the next member or parameter ends the list.
   */
  efxParseWhere(): any {
    if (!this.efxIsWord("where") || this.hasPrecedingLineBreak()) return null
    const state = this.efxState()
    const outer = state.schemaTypes
    // the checks are expressions: a `where` inside one is a name
    state.schemaTypes = 0
    try {
      const clause = this.startNode()
      clause.keyword = { start: this.start, end: this.end }
      this.next()
      clause.checks = []
      for (;;) {
        const check = this.parseMaybeConditional(false, null)
        // `string where c | null`: the `| null` was meant for the type
        if (check.type === "BinaryExpression" && check.operator === "|") {
          this.efxRaise(check.start, "EFX3005", "`where` comes after the whole type", "write `T | null where …`")
        }
        clause.checks.push(check)
        if (this.type !== tt.comma || this.efxMemberAfterComma()) break
        this.next()
      }
      return this.finishNode(clause, "WhereClause")
    } finally {
      state.schemaTypes = outer
    }
  }

  /** `brand Name = Type [where …]` (ADR-0077), and `brand Name<…>` so its type parameters are refused. */
  efxIsBrandStart(): boolean {
    if (!this.efxIsWord("brand") || !this.efxNextIsNameSameLine()) return false
    const name = this.lookahead()
    const after = skipSpace(this.input, name.end)
    return (this.input[after] === "=" && this.input[after + 1] !== "=" && this.input[after + 1] !== ">") ||
      this.input[after] === "<"
  }

  efxParseBrand(): any {
    const node = this.startNode()
    node.keyword = { start: this.start, end: this.end }
    this.next()
    node.id = this.parseIdent()
    if (this.input[this.start] === "<") this.efxRaise(this.start, "EFX3002", "A brand can't have type parameters")
    this.expect(tt.eq)
    node.typeAnnotation = this.efxInSchemaType(() => this.tsInType(() => this.tsParseType()))
    node.efxWhere = this.efxParseWhere()
    this.semicolon()
    return this.finishNode(node, "BrandDeclaration")
  }
  ```

In `parse.ts`, carry the code and hint:

```ts
interface ParseError {
  readonly pos: number
  readonly message: string
  /** A parse error's own code (ADR-0077), EFX1001 otherwise. */
  readonly code: string
  readonly hint: string | undefined
}

const toParseError = (error: unknown): ParseError => {
  const e = error as { pos?: unknown; message?: unknown; efxCode?: unknown; efxHint?: unknown }
  const message = typeof e.message === "string" ? e.message.replace(/ \(\d+:\d+\)$/, "") : String(error)
  return {
    pos: typeof e.pos === "number" ? e.pos : 0,
    message,
    code: typeof e.efxCode === "string" ? e.efxCode : "EFX1001",
    hint: typeof e.efxHint === "string" ? e.efxHint : undefined
  }
}
```

and in `parse`, the failure becomes
`diagnosticError(furthest?.code ?? "EFX1001", furthest?.message ?? "Syntax error", pos, Math.min(pos + 1, source.length), furthest?.hint)`.

In `scope.ts`, next to `visitChildren`:

```ts
/** `where` checks under a declaration whose fields aren't visited otherwise (ADR-0077). */
const visitChecks = (node: Node, scope: Scope): void => {
  if (node.type === "WhereClause") return visitChildren(node, scope)
  for (const child of children(node)) visitChecks(child, scope)
}
```

and the alias case serves brands too:

```ts
case "BrandDeclaration":
case "SchemaAliasDeclaration": {
  scope.values.add(node.id.name)
  scope.types.add(node.id.name)
  bindings.add(node.id)
  return visitChecks(node, scope)
}
```

- [ ] **Step 4: Implement the lowering**

In `mapping.ts`, import `{ type Ctx, withNamespace } from "../context.ts"` and
`{ walk } from "../walk.ts"` (neither imports `mapping.ts`, so there's no cycle), then add:

```ts
const unparen = (type: Node): Node => (type.type === "TSParenthesizedType" ? unparen(type.typeAnnotation) : type)

const isNullish = (type: Node): boolean => type.type === "TSNullKeyword" || type.type === "TSUndefinedKeyword"

/**
 * A `where` clause's checks as text, `a, b` (ADR-0077). The first call walks them in place, which
 * qualifies their bare Schema builtins (`isNonEmpty` → `Schema.isNonEmpty`); later calls read the
 * same text back.
 *
 * @since 4.0.0
 * @category schema
 */
export const checksText = (ctx: Ctx, clause: Node): string => {
  if (clause.efxWalked !== true) {
    clause.efxWalked = true
    withNamespace(ctx, "Schema", () => {
      for (const check of clause.checks as Array<Node>) walk(check, clause, ctx)
    })
  }
  return (clause.checks as Array<Node>).map((check) => ctx.s.slice(check.start, check.end)).join(", ")
}

/**
 * The text around a checked type's checks (ADR-0077): `open` ends with `.check(` and `close`
 * closes it. The checks go on the type without its top-level `null` and `undefined`, which wrap the
 * checked schema; an optional field's `optionalKey`, or `optional` when it allows `undefined`
 * (ADR-0013), wraps that.
 *
 * @since 4.0.0
 * @category schema
 */
export const checkedParts = (
  ctx: Ctx,
  type: Node,
  optional: boolean,
  clause: Node
): { readonly open: string; readonly close: string } => {
  const inner = unparen(type)
  const all: Array<Node> = inner.type === "TSUnionType" ? inner.types : [inner]
  const hasNull = all.some((t) => t.type === "TSNullKeyword")
  const hasUndefined = all.some((t) => t.type === "TSUndefinedKeyword")
  const rest = all.filter((t) => !isNullish(t))
  const wrappers: Array<string> = []
  if (optional) wrappers.push(schemaRef(ctx, hasUndefined ? "optional" : "optionalKey"))
  // an optional field's `| undefined` belongs to `optional`; otherwise it wraps the checks
  const undefinedOr = hasUndefined && !optional
  if (hasNull && undefinedOr) wrappers.push(schemaRef(ctx, "NullishOr"))
  else if (hasNull) wrappers.push(schemaRef(ctx, "NullOr"))
  else if (undefinedOr) wrappers.push(schemaRef(ctx, "UndefinedOr"))
  if (rest.length === 0) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX3005",
        "`where` needs a type to check besides `null` and `undefined`",
        clause.start,
        clause.end
      )
    )
  }
  const base = rest.length === 0
    ? schemaRef(ctx, "Unknown")
    : typeToSchema(ctx, rest.length === 1 ? rest[0]! : { ...inner, types: rest })
  return {
    open: `${wrappers.map((wrapper) => `${wrapper}(`).join("")}${base}.check(`,
    close: `)${")".repeat(wrappers.length)}`
  }
}

/**
 * Lowers a `where` clause where it stands (ADR-0077): `open` replaces the text from `from` to the
 * first check, the checks are joined by `, ` on one line and walked in place (so the editor maps
 * them), and `close` follows the last one.
 *
 * @since 4.0.0
 * @category schema
 */
export const lowerChecks = (ctx: Ctx, from: number, clause: Node, open: string, close: string): void => {
  const checks: Array<Node> = clause.checks
  ctx.s.update(from, checks[0]!.start, open)
  for (let i = 1; i < checks.length; i++) ctx.s.update(checks[i - 1]!.end, checks[i]!.start, ", ")
  checksText(ctx, clause)
  ctx.s.appendLeft(clause.end, close)
}
```

In `transform/schema.ts`, import `type Ctx` alongside `Handler`, and `checkedParts, lowerChecks` from
the mapping. Replace `schemaAlias` and add the brand:

```ts
const typeLine = (prefix: string, name: string): string => `\n${prefix}type ${name} = typeof ${name}.Type`

/**
 * Writes `const Name = <schema>` and its type over an alias or a brand. The name stays in place, so
 * the editor maps it to the `const` (hover, go to definition). `open` and `close` go around the
 * `where` checks, which stay where they are too (ADR-0077); without checks they are joined.
 */
const writeDeclaration = (ctx: Ctx, node: Node, prefix: string, open: string, close: string): void => {
  const name: string = node.id.name
  const clause: Node | null = node.efxWhere ?? null
  ctx.s.update(node.start, node.id.start, "const ")
  if (clause === null) {
    ctx.s.update(node.id.end, node.end, ` = ${open}${close}${typeLine(prefix, name)}`)
    return
  }
  lowerChecks(ctx, node.id.end, clause, ` = ${open}`, close)
  // the type line follows the checks; a trailing `;` goes
  if (node.end > clause.end) ctx.s.update(clause.end, node.end, typeLine(prefix, name))
  else ctx.s.appendLeft(clause.end, typeLine(prefix, name))
}

const schemaAlias: Handler = (node, parent, ctx) => {
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const type: Node = node.typeAnnotation
  if (node.efxWhere === null || node.efxWhere === undefined) {
    writeDeclaration(ctx, node, prefix, aliasSchema(ctx, type), "")
  } else {
    const { close, open } = checkedParts(ctx, type, false, node.efxWhere)
    writeDeclaration(ctx, node, prefix, open, close)
  }
  return true
}

/** `brand Name = T [where …]` → `const Name = <T>[.check(…)].pipe(Schema.brand("Name"))` and its type (ADR-0077). */
const brandDeclaration: Handler = (node, parent, ctx) => {
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const name: string = node.id.name
  const type: Node = node.typeAnnotation
  const inner: Node = type.type === "TSParenthesizedType" ? type.typeAnnotation : type
  const nullish = (inner.type === "TSUnionType" ? inner.types as Array<Node> : [inner]).find((t) =>
    t.type === "TSNullKeyword" || t.type === "TSUndefinedKeyword"
  )
  if (nullish !== undefined) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX3006",
        "A brand can't include `null` or `undefined`",
        nullish.start,
        nullish.end,
        `brand the value, and write \`${name} | null\` where it's used`
      )
    )
  }
  const brand = `.pipe(${schemaRef(ctx, "brand")}(${JSON.stringify(name)}))`
  if (node.efxWhere === null) writeDeclaration(ctx, node, prefix, aliasSchema(ctx, type), brand)
  else {
    const { close, open } = checkedParts(ctx, type, false, node.efxWhere)
    writeDeclaration(ctx, node, prefix, open, `${close}${brand}`)
  }
  return true
}
```

and register it: `BrandDeclaration: brandDeclaration` in `schemaHandlers`.

- [ ] **Step 5: Run the tests and see them pass**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/typecheck.test.ts packages/effectscript/core/test/superset.test.ts packages/effectscript/core/test/parser.test.ts packages/effectscript/core/test/reverse-golden.test.ts`

Expected: PASS. The reverse-golden test writes `core/test/fixtures/schema/brand.reverse.efx` with
today's reverse output: `UserId` comes back as `schema UserId = string & Brand<"UserId">`, and
`Port` stays TypeScript. Task 4 changes that file.

The site's playground test still passes. The `brands` preset is still refused (EFX1001 at the
first field `where`), which is what its "proposed" test expects.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/fixtures/schema/brand.efx packages/effectscript/core/test/fixtures/schema/brand.ts packages/effectscript/core/test/fixtures/schema/brand.reverse.efx
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/parser/plugin.ts packages/effectscript/core/src/compiler/parser/parse.ts packages/effectscript/core/src/compiler/analyze/scope.ts packages/effectscript/core/src/compiler/schema/mapping.ts packages/effectscript/core/src/compiler/transform/schema.ts packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/fixtures/schema/brand.efx packages/effectscript/core/test/fixtures/schema/brand.ts packages/effectscript/core/test/fixtures/schema/brand.reverse.efx -m "feat(effectscript): brand declarations, keyed by their name (Plan 30 Task 1, ADR-0077)"
```

---

### Task 2: `where` on class fields and aliases, and the live `brands` preset

**Files:**
- Modify: `core/src/compiler/parser/plugin.ts`:
  - `efxParseSchemaAlias` (the type and `where`);
  - a new `parseClassPropertyAnnotation`;
  - `efxParseCommand` (refuse `where`).
- Modify: `core/src/compiler/transform/classLike.ts` (`rewriteField`).
- Create: `core/test/fixtures/schema/where.efx` and `where.ts`.
- Modify: `core/test/brand-where.test.ts`.
- Modify: `site/src/playground/presets.ts` (the `brands` preset) and `site/test/playground.test.ts`.

**Interfaces:**
- Consumes:
  - from Task 1: `efxParseWhere`, `efxInSchemaType`, `efxRaise`;
  - `checkedParts(ctx, type, optional, clause)` and `lowerChecks(ctx, from, clause, open, close)`.
- Produces: `efxWhere` on the class fields (`PropertyDefinition`) of `schema`, `error` and variant
  bodies (`undefined` without checks). The parser refuses `where` on `config` fields and `command`
  parameters.

- [ ] **Step 1: Write the failing tests.** Append to `brand-where.test.ts`:

```ts
describe("where: parsing class fields and aliases (ADR-0077)", () => {
  it("reads checks after a field's type, and leaves a member named `where` alone", () => {
    const source = [
      "schema Server {",
      "  host: string where isNonEmpty()",
      "  alias?: string where isTrimmed(), isMaxLength(20)",
      "  where: string",
      "  c: number",
      "  where(x: number) { return x }",
      "}",
      ""
    ].join("\n")
    const members = program(source).body[0].body.body
    expect(members.map((m: any) => [m.type, m.key.name, checks(source, m.efxWhere)])).toEqual([
      ["PropertyDefinition", "host", ["isNonEmpty()"]],
      ["PropertyDefinition", "alias", ["isTrimmed()", "isMaxLength(20)"]],
      ["PropertyDefinition", "where", null],
      ["PropertyDefinition", "c", null],
      ["MethodDefinition", "where", null]
    ])
  })

  it("reads an alias's checks", () => {
    const source = "schema Percent = number where isBetween({ minimum: 0, maximum: 100 })\n"
    expect(checks(source, program(source).body[0].efxWhere)).toEqual(["isBetween({ minimum: 0, maximum: 100 })"])
  })

  it("refuses checks where they can't go, each with its own message", () => {
    expect(failure("schema X { tags: Array<string where isNonEmpty()> }\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` checks a field or a declaration, not a nested type",
      hint: "write the field as `name = <Schema expression>`"
    })
    expect(failure("schema X { a: string where isMaxLength(5) | null }\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` comes after the whole type"
    })
    expect(failure("config C { port: Int where isGreaterThan(0) }\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` isn't available on `config` fields",
      hint: "give the field a `brand` or alias type that carries the checks"
    })
    expect(failure("schema X { a: Int where isGreaterThan(0) = Int }\n")).toMatchObject({
      code: "EFX3005",
      message: "A field with `where` checks can't also have `= <schema>`"
    })
    expect(failure("command go(--count: Int where isGreaterThan(0)) {}\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` isn't available on `command` parameters",
      hint: "check the value in the command's body"
    })
  })

  it("keeps a plain class's member named `where` and a type literal's `where` member", () => {
    const source = [
      "type Query = {",
      "  limit: number",
      "  where: string",
      "}",
      "class Repo {",
      "  table: string = \"\"",
      "  where(filter: string) { return filter }",
      "}",
      ""
    ].join("\n")
    expect(toTypeScript(source).code).toBe(source)
  })
})

describe("where: compiling class fields and aliases (ADR-0077)", () => {
  it("keeps null and undefined outside the checks, and `?` around them", () => {
    const out = code([
      "schema S {",
      "  a?: string where isMaxLength(2)",
      "  b?: string | undefined where isMaxLength(2)",
      "  c: string | null where isMaxLength(2)",
      "  d: string | undefined where isMaxLength(2)",
      "  e: string | null | undefined where isMaxLength(2)",
      "  f?: string | null | undefined where isMaxLength(2)",
      "}",
      ""
    ].join("\n"))
    expect(out).toContain("a: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("b: Schema.optional(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("c: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("d: Schema.UndefinedOr(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("e: Schema.NullishOr(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("f: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(2))))")
  })

  it("writes a list from several lines on one line, and splits nothing inside a check", () => {
    const out = code("schema S {\n  age: Int where\n    isBetween({ minimum: 0, maximum: 150 }),\n    isLessThan(9)\n}\n")
    expect(out).toContain("age: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 150 }), Schema.isLessThan(9))")
  })

  it("qualifies builtins only: a module binding and an arrow parameter stay as written", () => {
    const out = code([
      "const isUUID = Schema.isUUID(4)",
      "schema S {",
      "  id: string where isUUID, isNonEmpty()",
      "  email: string where makeFilter((check: string) => check.includes(\"@\"))",
      "}",
      ""
    ].join("\n"))
    expect(out).toContain("id: Schema.String.check(isUUID, Schema.isNonEmpty()),")
    expect(out).toContain("email: Schema.String.check(Schema.makeFilter((check: string) => check.includes(\"@\")))")
  })

  it("refuses checks on null alone", () => {
    expect(compile("schema S { a: null where isFinite() }\n").diagnostics).toContainEqual(expect.objectContaining({
      code: "EFX3005",
      message: "`where` needs a type to check besides `null` and `undefined`"
    }))
  })

  it("compiles `=` checks exactly as `where` checks", () => {
    expect(code("schema S { age = Int.check(isGreaterThan(0)) }\n")).toBe(code("schema S { age: Int where isGreaterThan(0) }\n"))
  })

  it("runs the checks when decoding", async () => {
    const { Exit } = await import("effect")
    const mod = await runCompiled(`
      import { Schema } from "effect"
      export schema Signup {
        name: string where isTrimmed(), isNonEmpty()
        nickname?: string where isMaxLength(3)
        manager: string | null where isMaxLength(2)
      }
      export const decode = (input: unknown) => Schema.decodeUnknownExit(Signup)(input)
    `)
    expect(Exit.isSuccess(mod.decode({ name: "Ada", manager: null }))).toBe(true)
    expect(Exit.isFailure(mod.decode({ name: " Ada", manager: null }))).toBe(true)
    expect(Exit.isFailure(mod.decode({ name: "Ada", nickname: "toolong", manager: null }))).toBe(true)
    expect(Exit.isFailure(mod.decode({ name: "Ada", manager: "abc" }))).toBe(true)
  })
})
```

Golden fixture `core/test/fixtures/schema/where.efx`:

```efx
export schema Signup {
  email: string where isPattern(/^[^@\s]+@[^@\s]+$/)
  name: string where isTrimmed(), isNonEmpty()
  nickname?: string where isMaxLength(20)
  referrer?: string | undefined where isNonEmpty()
  manager: string | null where isMaxLength(64)
  age: Int where
    isGreaterThan(17),
    isLessThan(150)
  joinedAt = DateTimeUtcFromString
}

export error TooYoung { age: Int where isLessThanOrEqualTo(17) }

export schema Percent = number where isBetween({ minimum: 0, maximum: 100 })

schema Note = string | null where isMaxLength(280)
```

and `core/test/fixtures/schema/where.ts` (type-checked while writing the plan):

```ts
import { Schema } from "effect"
export class Signup extends Schema.Class<Signup>("Signup")({
  email: Schema.String.check(Schema.isPattern(/^[^@\s]+@[^@\s]+$/)),
  name: Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty()),
  nickname: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(20))),
  referrer: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  manager: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
  age: Schema.Int.check(Schema.isGreaterThan(17), Schema.isLessThan(150)),
  joinedAt: Schema.DateTimeUtcFromString
}) {}

export class TooYoung extends Schema.TaggedError<TooYoung>()("TooYoung", { age: Schema.Int.check(Schema.isLessThanOrEqualTo(17)) }) {}

export const Percent = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
export type Percent = typeof Percent.Type

const Note = Schema.NullOr(Schema.String.check(Schema.isMaxLength(280)))
type Note = typeof Note.Type
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts`

Expected:
- The field and alias parsing tests fail with EFX1001 at `where`.
- The `config` and `command` cases give EFX1001 instead of EFX3005.
- The `where.efx` golden fails.

- [ ] **Step 3: Implement**

In `plugin.ts`:

- **`efxParseSchemaAlias`:** replace `node.typeAnnotation = this.tsInType(() => this.tsParseType())`
  with:

  ```ts
  node.typeAnnotation = this.efxInSchemaType(() => this.tsInType(() => this.tsParseType()))
  node.efxWhere = this.efxParseWhere()
  ```

- **New method**, next to `parseClassElement`:

  ```ts
  /** A field of a `schema`, `error` or variant body may end with `where` checks (ADR-0077). */
  parseClassPropertyAnnotation(node: any): any {
    const kinds = this.efxState().classKinds
    const kind = kinds[kinds.length - 1]
    if (kind !== "schema" && kind !== "error" && kind !== "variant" && kind !== "config") {
      return super.parseClassPropertyAnnotation(node)
    }
    this.efxInSchemaType(() => super.parseClassPropertyAnnotation(node))
    if (node.typeAnnotation === undefined || !this.efxIsWord("where") || this.hasPrecedingLineBreak()) return
    if (kind === "config") {
      this.efxRaise(
        this.start,
        "EFX3005",
        "`where` isn't available on `config` fields",
        "give the field a `brand` or alias type that carries the checks"
      )
    }
    node.efxWhere = this.efxParseWhere()
    if (this.type === tt.eq) {
      this.efxRaise(
        this.start,
        "EFX3005",
        "A field with `where` checks can't also have `= <schema>`",
        "put the checks in the expression: `name = T.check(…)`"
      )
    }
  }
  ```

- **`efxParseCommand`:** after `param.annotation = this.tsInType(() => this.tsParseType())`, add:

  ```ts
  if (this.efxIsWord("where") && !this.hasPrecedingLineBreak()) {
    this.efxRaise(
      this.start,
      "EFX3005",
      "`where` isn't available on `command` parameters",
      "check the value in the command's body"
    )
  }
  ```

In `classLike.ts`, import `checkedParts, lowerChecks` with `optionalField, typeToSchema`, and make the
typed branch of `rewriteField`:

```ts
} else if (field.typeAnnotation !== undefined && field.typeAnnotation !== null) {
  const type: Node = field.typeAnnotation.typeAnnotation
  const optional = field.optional === true
  if (optional) {
    const question = ctx.source.indexOf("?", field.key.end)
    ctx.s.remove(question, question + 1)
  }
  const clause: Node | null | undefined = field.efxWhere
  if (clause === null || clause === undefined) {
    ctx.s.update(type.start, type.end, optional ? optionalField(ctx, type) : typeToSchema(ctx, type))
  } else {
    // the checks stay in place, so the editor maps them (ADR-0077)
    const { close, open } = checkedParts(ctx, type, optional, clause)
    lowerChecks(ctx, type.start, clause, open, close)
  }
}
```

The comma handling after the branch is unchanged. Its `appendLeft(field.end, ",")` runs after
`lowerChecks`'s `appendLeft(clause.end, close)`, so the comma lands after the closing parentheses.

- [ ] **Step 4: Run the core tests and see them pass**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/typecheck.test.ts packages/effectscript/core/test/superset.test.ts packages/effectscript/core/test/parser.test.ts packages/effectscript/core/test/reverse-golden.test.ts packages/effectscript/core/test/config.test.ts packages/effectscript/core/test/command.test.ts`

Expected: PASS. The reverse-golden test writes `schema/where.reverse.efx`, with the checked fields
as `=` fields and `Percent`/`Note` as TypeScript; Task 4 changes it.

- [ ] **Step 5: Check the `brands` preset against the lowering it promised.** The playground's
  `brands` preset carries a hand-written `proposal.lowering`: the TypeScript that ADR-0077
  specifies, written by the session that made the preset. It's an independent acceptance test of
  Tasks 1–2.

  `presets.ts` uses Vite's `import.meta.glob`, so the check runs under Vitest. Write a temporary
  `site/test/brands-lowering.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest"

  describe("the brands preset (temporary, Plan 30 Task 2)", async () => {
    const { toTypeScript } = await import("effectscript/compiler")
    const { presets } = await import("@effectscript/site/playground/presets")

    it("compiles to the lowering ADR-0077 specified", () => {
      const brands = presets.find((p) => p.id === "brands")!
      const out = toTypeScript(brands.code, { filename: "playground.efx" })
      expect(out.diagnostics).toEqual([])
      expect(out.code).toBe(brands.proposal!.lowering)
    })
  })
  ```

  Run: `pnpm test --run --project @effectscript/site packages/effectscript/site/test/brands-lowering.test.ts`

  Expected: PASS. If the code differs, read the diff Vitest prints. A difference in the brand or
  field lines is a compiler bug: fix it and rerun Step 4. Then delete the file
  (`command rm packages/effectscript/site/test/brands-lowering.test.ts`); the next step removes the
  `proposal` it compares against.

- [ ] **Step 6: Make the preset live.** In `site/src/playground/presets.ts`, edit the preset whose
  `id` is `"brands"`:
  - Drop ` (next)` from its `title`.
  - Delete the comment line "Accepted in ADR-0077, not built yet: the TypeScript is the lowering it specifies."
  - Delete its `proposal` field.

  In `site/test/playground.test.ts`:
  - In "keeps a preset proposed only while the compiler refuses it", remove `"brands"` from the
    expected list, whatever else the list holds.
  - In "writes what today's syntax already says the way the compiler does", delete the
    `lowering("brands")` assertion and its mention in the comment: the compiler now writes all of it.

  Run: `pnpm test --run --project @effectscript/site packages/effectscript/site/test/playground.test.ts`

  Expected: PASS. "compiles every live preset without a problem" now includes `brands`.

- [ ] **Step 7: Commit** (check the shared files first, as Global Constraints says)

```bash
git add packages/effectscript/core/test/fixtures/schema/where.efx packages/effectscript/core/test/fixtures/schema/where.ts packages/effectscript/core/test/fixtures/schema/where.reverse.efx
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/parser/plugin.ts packages/effectscript/core/src/compiler/transform/classLike.ts packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/fixtures/schema/where.efx packages/effectscript/core/test/fixtures/schema/where.ts packages/effectscript/core/test/fixtures/schema/where.reverse.efx packages/effectscript/site/src/playground/presets.ts packages/effectscript/site/test/playground.test.ts -m "feat(effectscript): where checks on class fields and aliases; the brands preset is live (Plan 30 Task 2, ADR-0077)"
```

---

### Task 3: `where` on fields written out whole

**Files:**
- Modify: `core/src/compiler/parser/plugin.ts`:
  - new `tsParsePropertyOrMethodSignature` and `tsParseTypeMemberSemicolon`;
  - `efxParseSignatureLine`;
  - the section loop of `efxParseGroup`.
- Modify: `core/src/compiler/analyze/scope.ts`: `visitChecks` in the `"SchemaAdtDeclaration"`,
  `"GroupDeclaration"`/`"ApiDeclaration"`, `"RpcDeclaration"`…`"ToolkitDeclaration"` and
  `"WorkflowDeclaration"` cases.
- Modify: `core/src/compiler/schema/mapping.ts`: `fieldSchema`, and `member` uses it.
- Modify: `core/src/compiler/transform/schema.ts`: `schemaAdt` uses `fieldSchema`; EFX3003's hint.
- Modify: `core/src/compiler/transform/library.ts` (`signatureFields`) and `transform/httpApi.ts`
  (`sectionSchema`).
- Create fixtures, each with its `.ts`:
  - `core/test/fixtures/schema/where-members.efx`
  - `core/test/fixtures/ai/checked.efx`
  - `core/test/fixtures/rpc/checked.efx`
  - `core/test/fixtures/http/checked.efx`
- Modify: `core/test/brand-where.test.ts`.

**Interfaces:**
- Consumes: from Tasks 1–2, `efxParseWhere`, `efxInSchemaType`, `checkedParts` and `checksText`.
- Produces:
  - `efxWhere` on `TSPropertySignature` members of type literals in schema positions
    (`undefined` without checks), and on `SignatureField` (`null` without checks).
  - `fieldSchema(ctx: Ctx, type: Node, optional: boolean, clause: Node | null | undefined): string`.

- [ ] **Step 1: Write the failing tests.** Append to `brand-where.test.ts`:

```ts
describe("where: fields written out whole (ADR-0077)", () => {
  it("splits a type literal's members and a signature's fields at the next name", () => {
    const literal = "schema Mixed = { a: number where isFinite(); b: string; c?: Int where isGreaterThan(0), isLessThan(9), d: string; \"x-id\": string where isUUID(), readonly e: number }\n"
    expect(program(literal).body[0].typeAnnotation.members.map((m: any) => [literal.slice(m.key.start, m.key.end), checks(literal, m.efxWhere)]))
      .toEqual([["a", ["isFinite()"]], ["b", null], ["c", ["isGreaterThan(0)", "isLessThan(9)"]], ["d", null], ["\"x-id\"", ["isUUID()"]], ["e", null]])
    const rpc = "rpc Users {\n  get(id: string where isUUID(), limit?: Int where isGreaterThan(0), isLessThan(100), page: Int): User\n}\n"
    expect(program(rpc).body[0].lines[0].fields.map((f: any) => [f.key.name, checks(rpc, f.efxWhere)]))
      .toEqual([["id", ["isUUID()"]], ["limit", ["isGreaterThan(0)", "isLessThan(100)"]], ["page", null]])
  })

  it("qualifies a check once when a commented struct alias is rendered twice", () => {
    const out = code("schema Point = {\n  // across\n  x: number where isFinite()\n  y: number\n}\n")
    expect(out).toContain("x: Schema.Number.check(Schema.isFinite())")
    expect(out).not.toContain("Schema.Schema.")
  })

  it("puts a tool parameter's checks in the JSON Schema the model reads", async () => {
    const { Tool } = await import("effect/ai")
    const mod = await runCompiled(`
      /** Searches the catalog. */
      export tool Search(query: string where isNonEmpty(), limit?: Int where isBetween({ minimum: 1, maximum: 50 })): Array<string>
    `)
    expect(Tool.getJsonSchema(mod.Search)).toMatchObject({
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 50 }
      },
      required: ["query"]
    })
  })
})
```

Golden fixtures, each with its expected `.ts`. All four outputs were type-checked while writing the
plan.

`core/test/fixtures/schema/where-members.efx`:

```efx
export schema Point = { x: number where isFinite(); y: number where isFinite() }

export schema Address {
  geo: { lat: number where isBetween({ minimum: -90, maximum: 90 }); lng: number }
}

export schema Shape =
  | Circle { radius: number where isGreaterThan(0) }
  | Square { side?: number where isGreaterThan(0) }
```

`core/test/fixtures/schema/where-members.ts`:

```ts
import { Schema } from "effect"
export const Point = Schema.Struct({ x: Schema.Number.check(Schema.isFinite()), y: Schema.Number.check(Schema.isFinite()) })
export type Point = typeof Point.Type

export class Address extends Schema.Class<Address>("Address")({
  geo: Schema.Struct({ lat: Schema.Number.check(Schema.isBetween({ minimum: -90, maximum: 90 })), lng: Schema.Number })
}) {}

export class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number.check(Schema.isGreaterThan(0)) }) {}
export class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThan(0))) }) {}
export const Shape = Schema.Union([Circle, Square])
export type Shape = typeof Shape.Type
```

`core/test/fixtures/ai/checked.efx`:

```efx
/** Searches the catalog. */
export tool Search(query: string where isNonEmpty(), limit?: Int where isBetween({ minimum: 1, maximum: 50 })): Array<string>
```

`core/test/fixtures/ai/checked.ts`:

```ts
import { Schema } from "effect"
import { Tool } from "effect/ai"
/** Searches the catalog. */
export const Search = Tool.make("Search", { description: "Searches the catalog.", parameters: Schema.Struct({ query: Schema.String.check(Schema.isNonEmpty()), limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))) }), success: Schema.Array(Schema.String) })
```

`core/test/fixtures/rpc/checked.efx`:

```efx
export rpc PagesRpc {
  page(id: string where isUUID(), size: Int where isGreaterThan(0), isLessThanOrEqualTo(100), after?: string): Array<string>
}
```

`core/test/fixtures/rpc/checked.ts`:

```ts
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
export const PagesRpc = RpcGroup.make(
  Rpc.make("page", { payload: { id: Schema.String.check(Schema.isUUID()), size: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)), after: Schema.optionalKey(Schema.String) }, success: Schema.Array(Schema.String) })
)
```

`core/test/fixtures/http/checked.efx`:

```efx
export group SearchApi {
  get find "/" (query: { q: string where isNonEmpty(); page?: string where isMaxLength(4) }): Array<string>
}
```

`core/test/fixtures/http/checked.ts`:

```ts
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
export class SearchApi extends HttpApiGroup.make("search").add(
  HttpApiEndpoint.get("find", "/", { query: { q: Schema.String.check(Schema.isNonEmpty()), page: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4))) }, success: Schema.Array(Schema.String) })
) {}
```

If a golden differs from the compiler's output only in whitespace layout, take the compiler's layout.
It follows the existing goldens in the same directory. The tokens must be the same.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts`

Expected:
- The member and signature cases fail: a member's `where` is EFX3005 ("not a nested type"), and a
  signature field's `where` is EFX1001.
- The four goldens fail.

- [ ] **Step 3: Implement**

In `plugin.ts`:

```ts
tsParsePropertyOrMethodSignature(node: any, readonly: boolean): any {
  const members = this.efxState().members
  members.push(node)
  try {
    return super.tsParsePropertyOrMethodSignature(node, readonly)
  } finally {
    members.pop()
  }
}

/** A type literal's member in a schema position is a field: `where` may follow its type (ADR-0077). */
tsParseTypeMemberSemicolon(): any {
  const state = this.efxState()
  const member = state.members.at(-1)
  if (
    state.schemaTypes > 0 && member?.typeAnnotation !== undefined && member.parameters === undefined &&
    member.efxWhere === undefined
  ) {
    const clause = this.efxParseWhere()
    if (clause !== null) member.efxWhere = clause
  }
  return super.tsParseTypeMemberSemicolon()
}
```

In `efxParseSignatureLine`, the field loop parses its type in a schema position and then its checks:

```ts
field.annotation = this.efxInSchemaType(() => this.tsInType(() => this.tsParseType()))
field.efxWhere = this.efxParseWhere()
```

and in `efxParseGroup`, a section's type is a schema position:
`section.annotation = this.efxInSchemaType(() => this.tsInType(() => this.tsParseType()))`.

In `scope.ts`, call `visitChecks(node, scope)` in the `"SchemaAdtDeclaration"`, `"GroupDeclaration"`/`"ApiDeclaration"` and
`"RpcDeclaration"`…`"ToolkitDeclaration"` cases (before their `return`), and
`visitChecks(node.line, scope)` at the start of `"WorkflowDeclaration"`. A check runs at module level,
not inside the workflow's scope.

In `mapping.ts`, add `fieldSchema` and use it for struct members:

```ts
/**
 * The schema of a field `name[?]: T [where …]` as text (ADR-0013, ADR-0077), for fields that are
 * written out whole: type-literal members, ADT variants, signature lines and endpoint sections.
 *
 * @since 4.0.0
 * @category schema
 */
export const fieldSchema = (ctx: Ctx, type: Node, optional: boolean, clause: Node | null | undefined): string => {
  if (clause === null || clause === undefined) return optional ? optionalField(ctx, type) : typeToSchema(ctx, type)
  const { close, open } = checkedParts(ctx, type, optional, clause)
  return `${open}${checksText(ctx, clause)}${close}`
}
```

```ts
const member = (ctx: Ctx, node: Node): string => {
  if (node.type !== "TSPropertySignature" || node.typeAnnotation === undefined) return unsupported(ctx, node)
  const key = node.key.type === "Identifier" ? node.key.name : slice(ctx, node.key)
  return `${key}: ${fieldSchema(ctx, node.typeAnnotation.typeAnnotation, node.optional === true, node.efxWhere)}`
}
```

At the three other call sites, replace `x.optional === true ? optionalField(ctx, type) : typeToSchema(ctx, type)`
with `fieldSchema(ctx, type, x.optional === true, x.efxWhere)`:
- `schemaAdt` in `transform/schema.ts` (`f`);
- `signatureFields` in `transform/library.ts` (`field`, with `field.annotation`);
- `sectionSchema` in `transform/httpApi.ts` (`member`, with `fieldType`).

Drop `optionalField` from each file's import where it's no longer used.

EFX3003's hint becomes "write checks with `where`, or use a class-form schema with a `_tag` field".

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/typecheck.test.ts packages/effectscript/core/test/superset.test.ts packages/effectscript/core/test/reverse-golden.test.ts packages/effectscript/core/test/library-ai.test.ts packages/effectscript/core/test/library-rpc.test.ts packages/effectscript/core/test/library-workflow.test.ts packages/effectscript/core/test/httpApi.test.ts`

Expected: PASS. The reverse goldens write `.reverse.efx` files for the four new fixtures. Fields
with checks stay TypeScript there for now; Task 4 changes that.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core/test/fixtures/schema/where-members.* packages/effectscript/core/test/fixtures/ai/checked.* packages/effectscript/core/test/fixtures/rpc/checked.* packages/effectscript/core/test/fixtures/http/checked.*
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/parser/plugin.ts packages/effectscript/core/src/compiler/analyze/scope.ts packages/effectscript/core/src/compiler/schema/mapping.ts packages/effectscript/core/src/compiler/transform/schema.ts packages/effectscript/core/src/compiler/transform/library.ts packages/effectscript/core/src/compiler/transform/httpApi.ts packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/fixtures/schema packages/effectscript/core/test/fixtures/ai packages/effectscript/core/test/fixtures/rpc packages/effectscript/core/test/fixtures/http -m "feat(effectscript): where checks on struct members, ADT variants, signature lines and endpoint sections (Plan 30 Task 3, ADR-0077)"
```

---

### Task 4: The reverse compiler

**Files:**
- Create: `core/src/compiler/reverse/checks.ts`.
- Modify: `core/src/compiler/reverse/types.ts`:
  - `Where`, `checkedOf`, `typeParts` and `declarationType`;
  - `fieldType` and `schemaToType` take an optional `Where`.
- Modify: `core/src/compiler/reverse/classes.ts`:
  - `unqualifySchema` uses `isBareable`;
  - `entriesOf` passes the renderer;
  - `brandOf` and `aliasDeclaration`, used in `convertSchemaRun`'s alias branch.
- Modify: `core/src/compiler/reverse/library.ts` (`fieldsText`), `core/src/compiler/reverse/httpApi.ts` (`sectionType`).
- Modify: `core/test/brand-where.test.ts`; the `.reverse.efx` snapshots of `schema/basic` and the
  Tasks 1–3 fixtures.

**Interfaces:**
- Produces:
  - **`checks.ts`:**
    - `isBareable(ctx: ReverseCtx, node: Node): boolean`;
    - `bareText(ctx: ReverseCtx, node: Node): string`;
    - `renderChecks(ctx: ReverseCtx): Where`.
  - **`types.ts`:**
    - `type Where = (checks: ReadonlyArray<Node>) => string`;
    - `checkedOf(node: Node): { readonly base: Node; readonly checks: ReadonlyArray<Node> } | undefined`;
    - `declarationType(source: string, schema: string, node: Node, where?: Where): string | undefined`;
    - `fieldType(source, schema, property, where?)` and `schemaToType(source, schema, node, where?)`.
  - Callers that pass no `Where` get today's behavior: a checked schema has no type.

- [ ] **Step 1: Write the failing tests.** Append to `brand-where.test.ts`:

```ts
import { toEffectScript } from "effectscript/compiler"

const back = (ts: string): string => toEffectScript(ts, { filename: "t.ts", packageName: "t" }).code

describe("brand and where: the reverse compiler (ADR-0077)", () => {
  it("gives a brand back when its key is its name, and keeps any other key", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "export const UserId = Schema.String.pipe(Schema.brand(\"UserId\"))",
      "export type UserId = typeof UserId.Type",
      "const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).pipe(Schema.brand(\"Port\"))",
      "type Port = typeof Port.Type",
      "const Legacy = Schema.String.pipe(Schema.brand(\"billing/Legacy\"))",
      "type Legacy = typeof Legacy.Type",
      "const Plan = Schema.Literals([\"free\", \"pro\"]).pipe(Schema.brand(\"Plan\"))",
      "type Plan = typeof Plan.Type",
      ""
    ].join("\n"))
    expect(efx).toContain("export brand UserId = string")
    expect(efx).toContain("brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })")
    expect(efx).toContain("schema Legacy = string & Brand<\"billing/Legacy\">")
    expect(efx).toContain("brand Plan = \"free\" | \"pro\"")
  })

  it("gives checked fields back with the checks after the type, and leaves non-`where` shapes as `=` fields", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "export class S extends Schema.Class<S>(\"S\")({",
      "  a: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2))),",
      "  b: Schema.optional(Schema.String.check(Schema.isMaxLength(2))),",
      "  c: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2), Schema.isTrimmed())),",
      "  d: Schema.NullOr(Schema.String).check(Schema.isNonEmpty()),",
      "  e: Schema.String.check(Schema.isTrimmed()).check(Schema.isNonEmpty())",
      "}) {}",
      ""
    ].join("\n"))
    expect(efx).toContain("a?: string where isMaxLength(2)")
    expect(efx).toContain("b?: string | undefined where isMaxLength(2)")
    expect(efx).toContain("c: string | null where isMaxLength(2), isTrimmed()")
    // a check on the nullable union, and two chained checks, aren't what `where` writes
    expect(efx).toContain("d = NullOr(String).check(isNonEmpty())")
    expect(efx).toContain("e = String.check(isTrimmed()).check(isNonEmpty())")
  })

  it("keeps `Schema.` on a builtin whose name the module binds", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "const isTrimmed = (s: string) => s.trim() === s",
      "export class S extends Schema.Class<S>(\"S\")({",
      "  a: Schema.String.check(Schema.isTrimmed())",
      "}) {}",
      ""
    ].join("\n"))
    expect(efx).toContain("a: string where Schema.isTrimmed()")
  })
})
```

Move the new `import { toEffectScript }` into the file's existing import from `effectscript/compiler`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts`

Expected: the reverse tests fail. Today `UserId` comes back as `schema UserId = string & Brand<"UserId">`,
and checked fields come back as `=` fields.

- [ ] **Step 3: Implement**

`core/src/compiler/reverse/checks.ts`:

```ts
/**
 * `where` checks back from `.check(…)` arguments (ADR-0077).
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { excludedNames, namespaceExports } from "../prelude/tables.ts"
import type { ReverseCtx } from "./context.ts"
import { isMember } from "./origin.ts"
import type { Where } from "./types.ts"

/**
 * A `Schema.x` reference the forward compiler would write bare in a schema expression.
 *
 * @since 4.0.0
 * @category reverse
 */
export const isBareable = (ctx: ReverseCtx, node: Node): boolean => {
  if (!isMember(node, ctx.schema) || node.optional === true) return false
  const name: string = node.property.name
  const { innerBound, module } = ctx.analysis
  const free = !innerBound.has(name) && !module.values.has(name) && !module.types.has(name)
  return free && !excludedNames.has(name) && namespaceExports.get("Schema")!.has(name)
}

/**
 * `node`'s source text with the `Schema.` of each bare-able reference dropped.
 *
 * @since 4.0.0
 * @category reverse
 */
export const bareText = (ctx: ReverseCtx, node: Node): string => {
  const cuts: Array<readonly [number, number]> = []
  const visit = (n: Node): void => {
    if (isBareable(ctx, n)) cuts.push([n.start, n.property.start])
    for (const child of children(n)) visit(child)
  }
  visit(node)
  cuts.sort((a, b) => a[0] - b[0])
  let text = ""
  let at = node.start
  for (const [from, to] of cuts) {
    text += ctx.source.slice(at, from)
    at = to
  }
  return text + ctx.source.slice(at, node.end)
}

/**
 * Renders `.check(…)` arguments as a `where` list, `a(1), b(2)`, on one line as the forward compiler
 * writes them.
 *
 * @since 4.0.0
 * @category reverse
 */
export const renderChecks = (ctx: ReverseCtx): Where => (checks) => checks.map((check) => bareText(ctx, check)).join(", ")
```

In `types.ts`:
- `schemaToType` takes `where?: Where` as a fourth parameter, and its `Struct` case calls
  `fieldType(source, schema, property, where)`.
- Add:

```ts
/**
 * Renders `.check(…)` arguments as a `where` list (ADR-0077).
 *
 * @since 4.0.0
 * @category reverse
 */
export type Where = (checks: ReadonlyArray<Node>) => string

/** What a nullable schema adds to a field's type. */
const nullishSuffix: Record<string, string> = {
  NullOr: " | null",
  UndefinedOr: " | undefined",
  NullishOr: " | null | undefined"
}

/**
 * `S.check(a, b)`: the checked schema and its checks.
 *
 * @since 4.0.0
 * @category reverse
 */
export const checkedOf = (node: Node): { readonly base: Node; readonly checks: ReadonlyArray<Node> } | undefined =>
  node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed &&
    node.callee.optional !== true && node.callee.property.name === "check" && node.arguments.length > 0 &&
    (node.arguments as Array<Node>).every((a) => a.type !== "SpreadElement")
    ? { base: node.callee.object, checks: node.arguments }
    : undefined

/**
 * A field's or a declaration's type, and its checks as a `where` list: one `S.check(…)`, also under
 * a `NullOr`, which the forward compiler puts outside the checks (ADR-0077).
 */
const typeParts = (
  source: string,
  schema: string,
  node: Node,
  where: Where | undefined
): { readonly type: string; readonly checks: string | undefined } | undefined => {
  if (where !== undefined) {
    const suffix = node.type === "CallExpression" && node.arguments.length === 1 && isMember(node.callee, schema)
      ? nullishSuffix[node.callee.property.name]
      : undefined
    const checked = checkedOf(suffix === undefined ? node : node.arguments[0])
    const base: Node | undefined = checked?.base
    // a check on a nullable union isn't `where`: the forward compiler puts the checks inside it
    const nullableBase = base?.type === "CallExpression" && isMember(base.callee, schema) &&
      nullishSuffix[base.callee.property.name] !== undefined
    if (checked !== undefined && !nullableBase) {
      const type = schemaToType(source, schema, checked.base, where)
      return type === undefined ? undefined : { type: `${type}${suffix ?? ""}`, checks: where(checked.checks) }
    }
  }
  const type = schemaToType(source, schema, node, where)
  return type === undefined ? undefined : { type, checks: undefined }
}

/**
 * The type that ends a field or a declaration: `T`, or `T where c, …` when `where` renders checks
 * (ADR-0077).
 *
 * @since 4.0.0
 * @category reverse
 */
export const declarationType = (source: string, schema: string, node: Node, where?: Where): string | undefined => {
  const parts = typeParts(source, schema, node, where)
  if (parts === undefined) return undefined
  return parts.checks === undefined ? parts.type : `${parts.type} where ${parts.checks}`
}
```

and `fieldType` reads through `typeParts`:

```ts
export const fieldType = (
  source: string,
  schema: string,
  property: Node,
  where?: Where
): { readonly key: string; readonly optional: "" | "?"; readonly type: string } | undefined => {
  if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) return undefined
  const key = property.key.type === "Identifier"
    ? property.key.name
    : source.slice(property.key.start, property.key.end)
  const value: Node = property.value
  const render = (parts: { readonly type: string; readonly checks: string | undefined }, type = parts.type) =>
    parts.checks === undefined ? type : `${type} where ${parts.checks}`
  if (value.type === "CallExpression" && value.arguments.length === 1) {
    if (isMember(value.callee, schema, "optionalKey")) {
      const parts = typeParts(source, schema, value.arguments[0], where)
      return parts === undefined ? undefined : { key, optional: "?", type: render(parts) }
    }
    if (isMember(value.callee, schema, "optional")) {
      const parts = typeParts(source, schema, value.arguments[0], where)
      return parts === undefined ? undefined : { key, optional: "?", type: render(parts, `${parts.type} | undefined`) }
    }
  }
  const parts = typeParts(source, schema, value, where)
  return parts === undefined ? undefined : { key, optional: "", type: render(parts) }
}
```

In `classes.ts`:
- Import `renderChecks, isBareable` from `./checks.ts`, `checkedOf, declarationType, fieldType` from
  `./types.ts`, and `isCanonicalString` from `./context.ts`. Drop the imports that become unused.
- **`unqualifySchema`:** becomes:

  ```ts
  const unqualifySchema = (ctx: ReverseCtx, node: Node): void => {
    if (isBareable(ctx, node)) ctx.s.remove(node.start, node.property.start)
    for (const child of children(node)) unqualifySchema(ctx, child)
  }
  ```

- **`entriesOf`:** calls `fieldType(ctx.source, ctx.schema!, property, renderChecks(ctx))`.
- **New functions:**

  ```ts
  /** `S.pipe(Schema.brand("K"))`: the branded schema and its key. */
  const brandOf = (ctx: ReverseCtx, node: Node): { readonly schema: Node; readonly key: string } | undefined => {
    if (
      node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.computed ||
      node.callee.property.name !== "pipe" || node.arguments.length !== 1
    ) {
      return undefined
    }
    const step: Node = node.arguments[0]
    const key: Node | undefined = step.type === "CallExpression" && step.arguments.length === 1 ? step.arguments[0] : undefined
    return step.type === "CallExpression" && isMember(step.callee, ctx.schema, "brand") && key !== undefined &&
        isCanonicalString(ctx, key)
      ? { schema: node.callee.object, key: key.value as string }
      : undefined
  }

  /** A brand can't include `null` (EFX3006): a branded nullable union stays TypeScript. */
  const isNullable = (ctx: ReverseCtx, node: Node): boolean => {
    const base = checkedOf(node)?.base ?? node
    return base.type === "CallExpression" &&
      ["NullOr", "UndefinedOr", "NullishOr"].some((n) => isMember(base.callee, ctx.schema, n))
  }

  /**
   * `const X = <init>` as a declaration: `brand X = T [where …]` for `S[.check(…)].pipe(Schema.brand("X"))`
   * (ADR-0077), otherwise `schema X = T [where …]`.
   */
  const aliasDeclaration = (ctx: ReverseCtx, name: string, init: Node): string | undefined => {
    const where = renderChecks(ctx)
    const brand = brandOf(ctx, init)
    if (brand?.key === name) {
      if (isNullable(ctx, brand.schema)) return undefined
      const type = declarationType(ctx.source, ctx.schema!, brand.schema, where)
      return type === undefined ? undefined : `brand ${name} = ${type}`
    }
    const type = declarationType(ctx.source, ctx.schema!, init, where)
    return type === undefined ? undefined : `schema ${name} = ${type}`
  }
  ```

- **`convertSchemaRun`'s alias branch:** `schemaToType(…)` and `schema ${name} = ${type}` give way to:

  ```ts
  const text = aliasDeclaration(ctx, name, declarator.init)
  if (text === undefined || slice(ctx, declarator.init) === "") return 0
  ctx.s.update(tops[0]!.start, tops[1]!.end, `${first.exported ? "export " : ""}${text}`)
  return 2
  ```

In `library.ts` (`fieldsText`) and `httpApi.ts` (`sectionType`), call
`fieldType(ctx.source, ctx.schema, property, renderChecks(ctx))`. Import `renderChecks` from `./checks.ts`.

- [ ] **Step 4: Run the tests, and update the reverse snapshots**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/convert.test.ts packages/effectscript/core/test/reverse-corpus.test.ts packages/effectscript/core/test/roundtrip.test.ts`

Expected: PASS.

Then: `pnpm test --run --project effectscript packages/effectscript/core/test/reverse-golden.test.ts -u`

Expected: PASS, with these snapshot changes. Review each diff:
- `schema/basic.reverse.efx`: `brand UserId = string` and `age: Int where isGreaterThan(0)`.
- `schema/brand.reverse.efx`: now identical to `brand.efx`.
- `schema/where.reverse.efx`: identical to `where.efx`, except that `age`'s list is on one line.
- `schema/where-members.reverse.efx`, `ai/checked.reverse.efx`, `rpc/checked.reverse.efx` and
  `http/checked.reverse.efx`: identical to their `.efx`.

Any other change to a `.reverse.efx` file is a regression: stop and fix it. Then run the test again
without `-u`; it must pass.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core/src/compiler/reverse/checks.ts
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/reverse packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/fixtures -m "feat(effectscript): the reverse compiler writes brand and where (Plan 30 Task 4, ADR-0077)"
```

---

### Task 5: Editors and `efx docs`

**Files:**
- Modify: `tree-sitter/grammar.js`, `tree-sitter/queries/src/highlights.scm`, `tree-sitter/test/corpus/data.txt`.
- Regenerate with `node scripts/queries.mjs` (in `tree-sitter/`): `queries/highlights.scm`,
  `queries/helix/highlights.scm` and the Zed copies.
- Modify: `zed/languages/effectscript/outline.scm`.
- Modify: `core/grammars/effectscript.injection.tmLanguage.json`, then copy it over `vscode/syntaxes/effectscript.injection.tmLanguage.json`. The two must stay byte-identical.
- Modify: `core/test/blume-grammar.test.ts`.
- Modify: `core/src/doc/model.ts`; `core/test/docs-model.test.ts`.

The parser files (`tree-sitter/src/parser.c`, `grammar.json`, `node-types.json`) aren't tracked: the
tests generate them.

- [ ] **Step 1: Write the failing tests**

Append to `tree-sitter/test/corpus/data.txt`. The expected tree comes from the prototype grammar
below:

```
==================================
Brands and where checks (ADR-0077)
==================================

export brand UserId = string
brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })
schema Server {
  host: string where isNonEmpty(), isMaxLength(255)
  owner: string | null where isMaxLength(64)
  where: string
}
schema Point = { x: number where isFinite(), y: number }
tool Search(query: string where isNonEmpty(), limit: Int): Products

---

(program
  (export_statement
    (brand_declaration
      (identifier)
      (predefined_type)))
  (brand_declaration
    (identifier)
    (type_identifier)
    (where_clause
      (call_expression
        (identifier)
        (arguments
          (object
            (pair
              (property_identifier)
              (number))
            (pair
              (property_identifier)
              (number)))))))
  (schema_declaration
    (identifier)
    (schema_body
      (schema_field
        (property_identifier)
        (type_annotation
          (predefined_type))
        (where_clause
          (call_expression
            (identifier)
            (arguments))
          (call_expression
            (identifier)
            (arguments
              (number)))))
      (schema_field
        (property_identifier)
        (type_annotation
          (union_type
            (predefined_type)
            (literal_type
              (null))))
        (where_clause
          (call_expression
            (identifier)
            (arguments
              (number)))))
      (schema_field
        (property_identifier)
        (type_annotation
          (predefined_type)))))
  (schema_declaration
    (identifier)
    (object_type
      (property_signature
        (property_identifier)
        (type_annotation
          (predefined_type))
        (where_clause
          (call_expression
            (identifier)
            (arguments))))
      (property_signature
        (property_identifier)
        (type_annotation
          (predefined_type)))))
  (tool_declaration
    (signature
      (identifier)
      (formal_parameters
        (required_parameter
          (identifier)
          (type_annotation
            (predefined_type))
          (where_clause
            (call_expression
              (identifier)
              (arguments))))
        (required_parameter
          (identifier)
          (type_annotation
            (type_identifier))))
      (type_annotation
        (type_identifier)))))
```

Append to `core/test/blume-grammar.test.ts`:

```ts
describe("efx brand and where scopes (ADR-0077)", () => {
  it("scopes `brand` as a declaration and `where` as a keyword", async () => {
    const s = await scopesOf(
      "export brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })\nschema S {\n  name: string where isNonEmpty()\n}"
    )
    expect(s.get("brand")).toContain("storage.type.efx")
    expect(s.get("where")).toContain("keyword.other.where.efx")
  })

  it("leaves a variable named `where` alone", async () => {
    const s = await scopesOf("const where = 1\nconsole.log(where)\nexport const f = (where: number) => where")
    expect(s.get("where") ?? "").not.toContain("keyword.other.where.efx")
  })
})
```

Append to `core/test/docs-model.test.ts`:

```ts
describe("docModule: brands (ADR-0077)", () => {
  it("documents a brand with its type and checks", () => {
    const { diagnostics, module } = docModule(
      "/p/src/ids.efx",
      "ids",
      "/** A TCP port. */\nexport brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })\n"
    )
    expect(diagnostics).toEqual([])
    expect(module.declarations.map((d) => [d.kind, d.name, d.signature, d.doc?.summary])).toEqual([
      ["brand", "Port", "brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })", "A TCP port."]
    ])
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project tree-sitter-effectscript && pnpm test --run --project effectscript packages/effectscript/core/test/blume-grammar.test.ts packages/effectscript/core/test/docs-model.test.ts`

Expected:
- The corpus entry and "parses every .efx file the project ships without errors" fail: the new
  fixtures have `brand` and `where`.
- The TextMate test fails.
- The docs test fails: `brand` isn't a kind yet, and its declaration is skipped.

- [ ] **Step 3: Implement**

`tree-sitter/grammar.js`. This is the verified diff: it generated cleanly with tree-sitter 0.27, the
existing corpus passed 32/32, and the corpus entry above was produced from it.

```diff
@@ keywords
-  "key"
+  "key",
+  "brand",
+  "where"
 ]
@@ conflicts: ($, previous) =>
     previous.concat([
+      [$.update_expression, $.where_clause],
+      [$.call_expression, $.binary_expression, $.instantiation_expression, $.where_clause],
+      [$.binary_expression, $.where_clause],
+      [$.subscript_expression, $.where_clause],
+      [$.call_expression, $.where_clause],
+      [$.non_null_expression, $.where_clause],
+      [$.where_clause],
+      [$._keyword_identifier, $.impl_expression],
+      [$.primary_type, $.impl_expression],
       [$.primary_expression, $.effect_arrow_function],
@@ declaration: ($, previous) =>
         $.schema_declaration,
+        $.brand_declaration,
         $.service_declaration,
@@ schema_declaration
           choice(
             field("body", $.schema_body),
-            seq("=", field("value", choice($.schema_variants, $.type)))
+            seq(
+              "=",
+              choice(
+                field("value", $.schema_variants),
+                seq(field("value", $.type), optional(field("checks", $.where_clause)))
+              )
+            )
           ),
@@ schema_body
-        repeat(choice(seq($.schema_field, optional(choice(";", ","))), $.method_definition, ";")),
+        repeat(choice(seq($.schema_field, optional(choice($._semicolon, ","))), $.method_definition, ";")),
@@ schema_field
           optional("?"),
-          optional(field("type", $.type_annotation)),
+          optional(seq(field("type", $.type_annotation), optional(field("checks", $.where_clause)))),
           optional(seq("=", field("value", $.expression)))
         )
       ),

+    // `brand Name = Type [where …]`: a schema branded with its own name (ADR-0077)
+    brand_declaration: ($) =>
+      prec.right(
+        seq(
+          "brand",
+          field("name", $.identifier),
+          "=",
+          field("value", $.type),
+          optional(field("checks", $.where_clause)),
+          optional($._semicolon)
+        )
+      ),
+
+    // `where check, …` ends a field's or a declaration's type (ADR-0077)
+    where_clause: ($) =>
+      seq("where", field("check", $.expression), repeat(prec.right(seq(",", field("check", $.expression))))),
+
+    // a type literal's member in a schema position is a field, so it takes checks (ADR-0077)
+    property_signature: ($) =>
+      seq(
+        optional($.accessibility_modifier),
+        optional("static"),
+        optional($.override_modifier),
+        optional("readonly"),
+        field("name", $._property_name),
+        optional("?"),
+        optional(seq(field("type", $.type_annotation), optional(field("checks", $.where_clause))))
+      ),
+
+    // a signature line's or an endpoint section's parameters are fields (ADR-0077)
+    required_parameter: ($) =>
+      seq(
+        $._parameter_name,
+        optional(seq(field("type", $.type_annotation), optional(field("checks", $.where_clause)))),
+        optional($._initializer)
+      ),
+
+    optional_parameter: ($) =>
+      seq(
+        $._parameter_name,
+        "?",
+        optional(seq(field("type", $.type_annotation), optional(field("checks", $.where_clause)))),
+        optional($._initializer)
+      ),
+
     error_declaration: ($) =>
```

Why each part:
- **The `where_clause` self-conflict** lets tree-sitter try both readings of a `,` after a check:
  another check, or the next member or parameter. The branch that can't continue (`b: U` isn't an
  expression) dies. That is the compiler's comma rule.
- **The expression conflicts** let a check continue across `(`, `[`, `!` and the like.
- **The `impl` conflicts** come from `where` now being a keyword: `impl where { … }` could be an
  `impl` of a group named `where`.
- **`$._semicolon` in `schema_body`** lets the automatic-semicolon scanner end a field at a line
  break. Without it, a member named `where` on the next line would be read as checks.

Members named `where` in interfaces, type literals and parameters parse exactly as tree-sitter-typescript parses them. The prototype checked `packages/effect/src/sql/SqlModel.ts`, which has a parameter `(where: any) =>`: its tree is identical. `Schema.ts` and `Brand.ts` use `brand` as a type name, but tree-sitter-typescript already fails on both files, so the superset test skips them.

`tree-sitter/queries/src/highlights.scm`:
- Add `"brand"` and `"where"` to the keyword list.
- Add, after the `schema_variant` pattern:

  ```scheme
  (brand_declaration
    name: (identifier) @type)
  ```

Then run `node scripts/queries.mjs` in `tree-sitter/`.

`zed/languages/effectscript/outline.scm`: after the `schema_declaration` line, add
`(brand_declaration "brand" @context name: (_) @name) @item`.

`core/grammars/effectscript.injection.tmLanguage.json`:
- In `declaration`'s match, `(schema|error|…)` becomes `(schema|brand|error|…)`.
- Add a `where` rule to `repository`:

  ```json
  "where": {
    "match": "(?<=[\\w$>\\])\"'])\\s+(where)\\b(?=\\s+[A-Za-z_$])",
    "captures": {
      "1": {
        "name": "keyword.other.where.efx"
      }
    }
  }
  ```

- Add `{ "include": "#where" }` to `patterns`, after `#return-clauses`.

The lookbehind needs an identifier, `>`, `]`, `)` or a quote before the spaces, and the lookahead an
identifier after. That pairing never occurs in valid TypeScript (two identifiers side by side), so
`const where = 1` and `f(where)` stay names. A `where` at the end of a line isn't scoped: the
lookahead can't see the next line.

Then: `cp packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json`.

`core/src/doc/model.ts`:
- Add `| "brand"` to `DocKind`, after `"schema"`.
- Add the case:

  ```ts
  case "BrandDeclaration":
    return { ...leaf, kind: "brand", name: node.id.name, start, signature: whole(), doc }
  ```

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm test --run --project tree-sitter-effectscript && pnpm test --run --project @effectscript/zed && pnpm test --run --project effectscript packages/effectscript/core/test/blume-grammar.test.ts packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/docs-model.test.ts packages/effectscript/core/test/docs-render.test.ts && pnpm test --run --project @effectscript/language packages/effectscript/language/test/vscode.test.ts`

Expected: PASS. That includes tree-sitter's superset test over `packages/effect/src`, which can take
up to five minutes.

If it diffs on a file, compare the two trees for that file:

```bash
node_modules/.bin/tree-sitter parse <file>
node_modules/.bin/tree-sitter parse --lib-path .tree-sitter-cache/typescript-0.23.2.dylib --lang-name typescript <file>
```

Then adjust the grammar. The likely cause is a name `where` or `brand` that tree-sitter-typescript
reads as an identifier.

- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/tree-sitter/grammar.js packages/effectscript/tree-sitter/queries packages/effectscript/tree-sitter/test/corpus/data.txt packages/effectscript/zed/languages/effectscript packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json packages/effectscript/core/test/blume-grammar.test.ts packages/effectscript/core/src/doc/model.ts packages/effectscript/core/test/docs-model.test.ts -m "feat(effectscript): brand and where in tree-sitter, TextMate and efx docs (Plan 30 Task 5, ADR-0077)"
```

---

### Task 6: The skill, the site, the docs corpus and the spec

**Files:**
- Modify: `core/test/fixtures/schema/basic.efx`, to use the new forms. Its `.ts` and `.reverse.efx` don't change.
- Modify: `core/scripts/generate-skill.ts` (the `schema` section's title).
- Modify: `core/skills/effectscript/references/patterns.md` (the "Schemas" section).
- Regenerate: `core/skills/effectscript/references/syntax.md` and `effect-docs.md`.
- Modify: `site/src/samples/schemas/app.efx`.
- Regenerate: `effect-docs/content/`.
- Modify: `docs/superpowers/specs/2026-10-02-effectscript-design.md` (one sentence in §4.6).

- [ ] **Step 1: Write the docs.**
  - **`basic.efx`:** `schema UserId = string & Brand<"UserId">` becomes `brand UserId = string`, and
    `age = Int.check(isGreaterThan(0))` becomes `age: Int where isGreaterThan(0)`. The skill and the
    site's reference both show this fixture.
  - **`generate-skill.ts`:** the `schema` entry's title becomes "`schema` and `brand`: data types
    that are TypeScript types", as in the spec.
  - **`patterns.md`, "Schemas":** the intro becomes:

    > A `schema` is a data type and its runtime schema at once. A `brand` is a schema whose values
    > carry their type's name, so a `UserId` can't be passed where an `Email` is expected. `where`
    > adds checks to a type or a field; they run when decoding and in `make`, and they reach JSON
    > Schema. An `=` field takes any other schema expression.

    The example's first lines become:

    ```efx
    export brand Email = string where isPattern(/^[^@\s]+@[^@\s]+$/)

    export schema Signup {
      email: Email
      name: string where isTrimmed(), isNonEmpty()
      age: Int where isGreaterThan(17)
      plan: "free" | "pro"
      referrer?: string
    }
    ```

  - **`site/src/samples/schemas/app.efx`:** `export schema Email = string & Brand<"Email">` becomes
    `export brand Email = string`, and `age = Int.check(isGreaterThan(17))` becomes
    `age: Int where isGreaterThan(17)`. Keep `Email` unchecked: the gallery compares it with
    `plain.ts`, which doesn't check emails.
  - **Spec §4.6:** at the end of the "Layout" bullet, add "A list written over several lines
    compiles to one `.check(…)` on one line."

- [ ] **Step 2: Regenerate and run the doc tests**

```bash
pnpm --filter @effectscript/effect-docs codegen
node packages/effectscript/core/scripts/generate-skill.ts
pnpm test --run --project @effectscript/effect-docs
pnpm test --run --project effectscript packages/effectscript/core/test/skill.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/reverse-golden.test.ts packages/effectscript/core/test/reverse-corpus.test.ts
pnpm test --run --project @effectscript/site packages/effectscript/site/test/gallery.test.ts packages/effectscript/site/test/playground.test.ts
pnpm test --run --project tree-sitter-effectscript
```

Expected: PASS.
- The docs corpus now reads `GroupId` and the HTTP fixtures' `UserId` as `brand`. If it shows other
  changes, another session's compiler change wasn't regenerated: keep them, and say so in the
  commit message.
- The skill test type-checks the new pattern.
- tree-sitter parses the updated skill fences, fixtures and samples.

- [ ] **Step 3: Final checks across the plan**

```bash
pnpm check
pnpm lint
pnpm test --run --project effectscript packages/effectscript/core/test/brand-where.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/typecheck.test.ts packages/effectscript/core/test/runtime.test.ts packages/effectscript/core/test/superset.test.ts packages/effectscript/core/test/parser.test.ts packages/effectscript/core/test/roundtrip.test.ts packages/effectscript/core/test/convert.test.ts packages/effectscript/core/test/review.test.ts packages/effectscript/core/test/diagnostics.test.ts packages/effectscript/core/test/hygiene.test.ts packages/effectscript/core/test/mappings.test.ts packages/effectscript/core/test/lsp.test.ts
```

Expected: PASS. Report any command that couldn't be run.

- [ ] **Step 4: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/test/fixtures/schema/basic.efx packages/effectscript/core/scripts/generate-skill.ts packages/effectscript/core/skills packages/effectscript/site/src/samples/schemas/app.efx packages/effectscript/effect-docs/content docs/superpowers/specs/2026-10-02-effectscript-design.md -m "docs(effectscript): brand and where in the skill, the site, the docs corpus and the spec (Plan 30 Task 6, ADR-0077)"
```
