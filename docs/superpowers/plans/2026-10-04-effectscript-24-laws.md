# EffectScript Plan 24: `law` declarations, run as property tests (phase 18)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans. Steps use `- [ ]`. Execute task by task with TDD. Decisions are
> recorded in `docs/adr/`. Commit with explicit, gated paths (another session shares the branch):
> `pnpm check && pnpm lint && git commit <paths>`.

**Goal:** people state rules about their program as `law` declarations in any `.efx` module. A
`laws "path"` line in a test file runs them as property tests that shrink their counterexamples.
The reverse compiler and every editor understand them. No Bend is involved yet.

**Architecture:** the usual path for a construct: fixture, parser, scope, transform, reverse,
tree-sitter. Specifically:

- **Parser:** a `LawDeclaration` node (`law name(params) [requires e] [with e] { … }`) and a
  `LawsStatement` (`laws "path" [with e]`).
- **`transform/law.ts`:** lowers a law to a pure constant, a property function carrying
  `{ law, inputs, requires? }` (ADR-0075).
- **`src/laws.ts`:** the test-time helpers, exported as `effectscript/laws`.
- **`src/doc/laws.ts`:** builds the `?laws` virtual module. The Vite plugin and the Node register
  hooks serve it, the way `?doctest` is served.

**Tech stack:** acorn plugin, MagicString, `effect/Arbitrary` (`schema`, `all`, `filter`,
`checkEffect`, `formatCheckFailure`), `@effect/vitest`, tree-sitter.

**Spec:** `docs/superpowers/specs/2026-10-04-effectscript-proofs-design.md` §2 (laws), §9
(diagnostics); ADR-0075. Read both first.

## Global Constraints

- **Nothing runs in production.**
  - A private law compiles to an unexported `/*#__PURE__*/` constant followed by `void <name>`.
  - An exported law compiles to `export const …` with no `void`.
  - The compiled module never imports `effectscript/laws`.
- **Contextual keywords.** `law`, `laws`, and `requires` and `with` inside a law header, are
  keywords only at the positions the spec gives. Valid TypeScript keeps its meaning, and the
  superset identity test stays green.
- **Diagnostics** (exact texts):
  - **EFX9401:** "A law's parameter needs a type with a schema: its inputs are generated from
    it"
  - **EFX9402:** "Every path of a law must end in `return <boolean>`"
  - **EFX9403:** "`law` belongs at the top level of a module"
  - **EFX9404:** "`laws` needs a relative path to a .efx file"
  - **EFX9405** (warning): "<file> has no laws"
  - **EFX9406:** "A `laws` target can't have a `main` block: importing it would run the program"
- **Generated names** are hygienic (ADR-0009): `$efxIt`, `$efxLaws`, `$efxRunLaws`, and the
  fresh local for each `laws` import.
- Nothing is published, and brand files are never edited.

## Review Focus

1. **A law whose `await` fails.** The law is falsified, the failure appears in the report, and the
   input is shrunk. No defect, no crash. *(Task 3: runtime test; Task 4: Vitest output)*
2. **A `requires` that never holds.** The check is *exhausted* and the law fails, saying so. It
   never passes silently. *(Task 3)*
3. **Names that collide.**
   - A law parameter named `it`, `Effect` or `law` keeps working.
   - A user binding named `$efxIt` doesn't break `?laws`.
   - Two laws with the same name give TypeScript's duplicate-identifier error at the second one.
   - *(Tasks 2, 4)*
4. **`law`, `laws` and `requires` as plain identifiers** keep their meaning: `const law = 1`,
   `law(x)`, `laws.push(x)`, `const requires = …`, `function law() {}`. *(Tasks 1, 4)*
5. **A target without laws, with `main`, or with a parse error.** These give EFX9405, EFX9406 and
   EFX1001 respectively, pointing into the target file. A type error inside a law body shows in the
   editor at the law's line. *(Tasks 4, 6)*

---

### Task 1: Parse `law` and `laws`

**Files:**
- Modify: `packages/effectscript/core/src/compiler/parser/plugin.ts`:
  - `parseStatement` at about line 210;
  - `shouldParseExportStatement` at about line 236;
  - new methods next to `efxIsWorkflowStart`/`efxParseWorkflow` (about line 716) and
    `efxIsDoctestStart` (about line 851).
- Modify: `packages/effectscript/core/src/compiler/analyze/scope.ts` (a case next to
  `"WorkflowDeclaration"`, about line 275).
- Test: `packages/effectscript/core/test/law.test.ts` (new).

**Interfaces:**
- Produces two AST nodes.
- **`LawDeclaration`:**
  - `keyword: { start: number; end: number }`;
  - `id: Identifier`;
  - `params: Array<Node>`, each an `Identifier` with an optional `typeAnnotation`, as acorn parses
    function parameters;
  - `requiresKeyword: { start; end } | null` and `requires: Node | null`;
  - `withKeyword: { start; end } | null` and `layer: Node | null`;
  - `body: BlockStatement` (parsed with `efxParseAsyncBlock`, so `await` parses).
  - When exported, it sits inside `ExportNamedDeclaration.declaration`.
- **`LawsStatement`:** `keyword`, `path: Literal` (a string), `layer: Node | null`.
- **Scope:**
  - The law's name is a module value.
  - Its parameters live in a function scope that covers `requires`, `with` and the body.
  - `scopeOf.set(node.body, fn)`.

- [ ] **Step 1: Write the failing parser tests**

```ts
// packages/effectscript/core/test/law.test.ts
import { parse, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const program = (source: string): any => {
  const result = parse(source)
  if (result._tag !== "Success") throw new Error(`parse failed: ${source}`)
  return result.program
}

const lawOf = (source: string): any => {
  const statement: any = program(source).body[0]
  return statement.type === "ExportNamedDeclaration" ? statement.declaration : statement
}

describe("law: parsing (ADR-0075)", () => {
  it("reads the name, typed parameters, requires, with and an async body", () => {
    const law = lawOf(
      "export law l(a: Money, b: Money)\n  requires b >= 0\n  with Accounts.model(a)\n{\n  return (await f(a)) === b\n}\n"
    )
    expect(law.type).toBe("LawDeclaration")
    expect(law.id.name).toBe("l")
    expect(law.params.map((p: any) => p.name)).toEqual(["a", "b"])
    expect(law.requires.type).toBe("BinaryExpression")
    expect(law.layer.type).toBe("CallExpression")
    expect(law.body.type).toBe("BlockStatement")
  })

  it("reads `laws \"path\" [with layer]`", () => {
    const statement: any = program("laws \"../src/bank.efx\" with Ledger.layerTest\n").body[0]
    expect(statement.type).toBe("LawsStatement")
    expect(statement.path.value).toBe("../src/bank.efx")
    expect(statement.layer.type).toBe("MemberExpression")
  })

  it("keeps law, laws and requires as names elsewhere", () => {
    const source = [
      "const law = (x: number) => x",
      "law(1)",
      "const laws: Array<number> = []",
      "laws.push(1)",
      "const requires = 2",
      "function lawful() { return law }",
      ""
    ].join("\n")
    expect(toTypeScript(source).code).toBe(source)
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts`

Expected: the first two tests fail. `parse` returns an `ExpressionStatement`, or EFX1001 for
`laws "…"`. The third passes.

- [ ] **Step 3: Implement the parser**

In `plugin.ts`:

- **`parseStatement`:** add, before the `describe` line:

  ```ts
  if (this.efxIsLawStart()) return this.efxParseLaw()
  if (this.efxIsLawsStart()) return this.efxParseLaws()
  ```

  Add `this.efxIsLawStart() ||` to `shouldParseExportStatement`.
- **New methods:**

  ```ts
  /** `law name(params) [requires e] [with e] { … }` (ADR-0075). */
  efxIsLawStart(): boolean {
    if (!this.efxIsWord("law") || !this.efxNextIsNameSameLine()) return false
    const name = this.lookahead()
    return this.input[skipSpace(this.input, name.end)] === "("
  }

  efxParseLaw(): any {
    const node = this.startNode()
    node.keyword = { start: this.start, end: this.end }
    this.next()
    node.id = this.parseIdent()
    this.expect(tt.parenL)
    node.params = this.parseBindingList(tt.parenR, false, false)
    node.requiresKeyword = null
    node.requires = null
    if (this.efxIsWord("requires")) {
      node.requiresKeyword = { start: this.start, end: this.end }
      this.next()
      node.requires = this.parseExprOps(false, null)
    }
    node.withKeyword = null
    node.layer = null
    if (this.type === tt._with) {
      node.withKeyword = { start: this.start, end: this.end }
      this.next()
      node.layer = this.parseExprSubscripts(null, false)
    }
    node.body = this.efxParseAsyncBlock()
    return this.finishNode(node, "LawDeclaration")
  }

  /** `laws "path" [with layer]` (ADR-0075), like `doctest`. */
  efxIsLawsStart(): boolean {
    if (!this.efxIsWord("laws")) return false
    const next = this.lookahead()
    return next.type === tt.string && this.efxSameLine(next)
  }

  efxParseLaws(): any {
    const node = this.startNode()
    node.keyword = { start: this.start, end: this.end }
    this.next()
    node.path = this.parseExprAtom(null, false, false)
    node.layer = null
    if (this.type === tt._with) {
      this.next()
      node.layer = this.parseExprSubscripts(null, false)
    }
    this.semicolon()
    return this.finishNode(node, "LawsStatement")
  }
  ```

  If acorn-typescript's `parseBindingList` signature differs, use the call that `efxParseActivity`'s
  neighbours use for parenthesized parameter lists. Keep type annotations on the identifiers.
- **Scope** (`scope.ts`):

  ```ts
  case "LawDeclaration": {
    scope.values.add(node.id.name)
    bindings.add(node.id)
    // the parameters are in scope for `requires`, `with` and the body (ADR-0075)
    const fn = makeScope(scope, "function")
    for (const param of node.params as Array<Node>) {
      if (param.type === "Identifier") {
        fn.values.add(param.name)
        bindings.add(param)
      }
    }
    scopeOf.set(node.body, fn)
    if (node.requires !== null) visit(node.requires, fn)
    if (node.layer !== null) visit(node.layer, fn)
    visitChildren(node.body, fn)
    return
  }
  ```

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts packages/effectscript/core/test/superset.test.ts`

Expected: PASS. The superset identity corpus is unchanged.

- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/parser/plugin.ts packages/effectscript/core/src/compiler/analyze/scope.ts packages/effectscript/core/test/law.test.ts -m "feat(effectscript): parse law declarations and laws statements (Plan 24 Task 1, ADR-0075)"
```

### Task 2: Lower `law` to a property constant

**Files:**
- Create: `packages/effectscript/core/src/compiler/transform/law.ts`.
- Modify: `packages/effectscript/core/src/compiler/transform/registry.ts`. Register `lawHandlers`
  before the test handlers, at about lines 56–79.
- Create: `packages/effectscript/core/test/fixtures/law/bank.efx`, `bank.ts` (snapshot) and
  `bank.reverse.efx` (snapshot; written by Task 5, its golden test skipped until then by listing it
  in the reverse test's pending set, or by doing Task 5 before running the reverse golden).
- Modify: `packages/effectscript/core/scripts/generate-skill.ts`. Add
  `["law", "`law` / `laws`: rules run as property tests"]` to the constructs list, after `test`.
  Codegen throws for a fixture folder without an entry.
- Test: `packages/effectscript/core/test/law.test.ts`.

**Interfaces:**
- Consumes the nodes from Task 1, and these existing helpers:
  - `typeToSchema(ctx, typeNode)` (`schema/mapping.ts`);
  - `alwaysExits(node)` (`transform/try.ts`);
  - `makeFrame`, `withEffect`, `withNamespace` (`context.ts`);
  - `ref(ctx, "effect", "Effect")`.
- **Produces the lowering** (ADR-0075):
  - `const <name> = /*#__PURE__*/ Object.assign(<E>.fnUntraced(function*({ <params> }: { readonly <p>: <T>; … }) { <body> }[, <E>.scoped][, (effect, { <used params> }) => <E>.provide(effect, <layer>)]), { law: "<name>", inputs: { <p>: <schema>, … }[, requires: ({ <used params> }) => <requires>] })`
  - then `void <name>` (private laws only);
  - every `return e` in the body becomes `return (e) satisfies boolean`.

- [ ] **Step 1: Write the fixture and the failing tests**

`test/fixtures/law/bank.efx`:

```efx
export schema Money = Int & Brand<"Money">
export error InsufficientFunds { needed: Money; available: Money }

export effect withdraw(balance: Money, amount: Money): Money throws InsufficientFunds {
  if (amount > balance) throw new InsufficientFunds({ needed: amount, available: balance })
  return Money.make(balance - amount)
}

/** Withdrawing never leaves a negative balance. */
law withdrawNeverNegative(balance: Money, amount: Money) {
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isFailure(exit) || exit.value >= 0
}

/** A withdrawal of a non-negative amount never adds money. */
export law withdrawNeverAdds(balance: Money, amount: Money) requires amount >= 0 {
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isFailure(exit) || exit.value <= balance
}
```

`test/fixtures/law/bank.ts` is the reviewed snapshot. The non-law part is today's exact output;
only whitespace inside the law lines may differ:

```ts
import { Effect, Exit, Schema } from "effect"
export const Money = Schema.Int.pipe(Schema.brand("Money"))
export type Money = typeof Money.Type
export class InsufficientFunds extends Schema.TaggedError<InsufficientFunds>()("InsufficientFunds", { needed: Money, available: Money }) {}

export const withdraw = Effect.fn("withdraw")(function*(balance: Money, amount: Money): Effect.fn.Return<Money, InsufficientFunds> {
  if (amount > balance) return yield* new InsufficientFunds({ needed: amount, available: balance })
  return Money.make(balance - amount)
})

/** Withdrawing never leaves a negative balance. */
const withdrawNeverNegative = /*#__PURE__*/ Object.assign(Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
  const exit = yield* Effect.exit(withdraw(balance, amount))
  return (Exit.isFailure(exit) || exit.value >= 0) satisfies boolean
}), { law: "withdrawNeverNegative", inputs: { balance: Money, amount: Money } })
void withdrawNeverNegative

/** A withdrawal of a non-negative amount never adds money. */
export const withdrawNeverAdds = /*#__PURE__*/ Object.assign(Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
  const exit = yield* Effect.exit(withdraw(balance, amount))
  return (Exit.isFailure(exit) || exit.value <= balance) satisfies boolean
}), { law: "withdrawNeverAdds", inputs: { balance: Money, amount: Money }, requires: ({ amount }) => amount >= 0 })
```

Append to `test/law.test.ts`:

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import { runCompiled } from "./utils/run.ts"

const bank = fs.readFileSync(path.join(import.meta.dirname, "fixtures/law/bank.efx"), "utf8")
const codes = (source: string) => toTypeScript(source, { filename: "laws.efx" }).diagnostics.map((d) => d.code)

describe("law: lowering (ADR-0075)", () => {
  it("is a property that answers the claim, with its inputs and precondition attached", async () => {
    const mod = await runCompiled(`${bank}
export const checks = await Effect.runPromise(effect {
  return [
    await withdrawNeverNegative({ balance: Money.make(10), amount: Money.make(3) }),
    await withdrawNeverNegative({ balance: Money.make(3), amount: Money.make(10) }),
    withdrawNeverAdds.law,
    Object.keys(withdrawNeverAdds.inputs),
    withdrawNeverAdds.requires?.({ balance: Money.make(1), amount: Money.make(-1) })
  ]
})
`)
    expect(mod.checks).toEqual([true, true, "withdrawNeverAdds", ["balance", "amount"], false])
  })

  it("provides `with` from the parameters, and scopes a body with defer", async () => {
    const mod = await runCompiled(`
service Counter { readonly start: number }
const layerFrom = (start: number) => Layer.succeed(Counter, Counter.of({ start }))
law startsWhereAsked(n: Int) with layerFrom(n) {
  defer Effect.void
  return (await Counter).start === n
}
export const ok = await Effect.runPromise(startsWhereAsked({ n: 7 }))
`)
    expect(mod.ok).toBe(true)
  })

  it("rejects untyped parameters, missing returns and nested laws", () => {
    expect(codes("law l(x) { return true }")).toContain("EFX9401")
    expect(codes("law l(x: (a: number) => number) { return true }")).toContain("EFX9401")
    expect(codes("law l(x: number) { if (x > 0) return true }")).toContain("EFX9402")
    expect(codes("function f() {\n  law l(x: number) { return true }\n}")).toContain("EFX9403")
  })

  it("lets parameters shadow prelude and test names", async () => {
    const mod = await runCompiled(`law named(it: Int, Effect: Int, law: Int) { return it + Effect + law === law + Effect + it }
export const ok = await named({ it: 1, Effect: 2, law: 3 }) |> Effect.runPromise`)
    expect(mod.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts packages/effectscript/core/test/compile.test.ts`

Expected: FAIL. There's no `LawDeclaration` handler, so the output still contains `law`, and the
golden fixture `law/bank.efx` has no snapshot.

- [ ] **Step 3: Implement `transform/law.ts`**

```ts
/**
 * `law name(params) [requires e] [with L] { … }` (ADR-0075) → a pure property constant:
 * `Object.assign(Effect.fnUntraced(function*({ params }) { … }), { law, inputs, requires? })`.
 * Its returns are checked as booleans with `satisfies`; nothing of it runs in production.
 *
 * @since 4.0.0
 */
```

Write `lawDeclaration: Handler` in that file:

- **Position.** If `parent` is neither `Program` nor an `ExportNamedDeclaration` whose parent is
  `Program`, push EFX9403 on the keyword and return `true`.
- **Parameters.** For each parameter, require `Identifier` + `typeAnnotation`; otherwise push
  EFX9401 at the parameter, with hint "for example `balance: Money`".
  - Get each schema with `typeToSchema(ctx, param.typeAnnotation.typeAnnotation)`.
  - If that pushed an EFX3001 for this node, replace it with EFX9401. Its hint: "use a type the
    schema table maps (spec §4.6) or a schema name".
- **Paths.** If `!alwaysExits(node.body)`, push EFX9402 on the keyword.
- **Header.** Replace the header (`[export ]law name(…) [requires …] [with …] `, up to the body's
  `{`) with:
  `const <name> = /*#__PURE__*/ Object.assign(<E>.fnUntraced(function*({ <names> }: { readonly <n>: <T text>; … }) `
  keeping `export ` when the law is exported. Take the type text from the source slice of each
  annotation.
- **Body.** Walk it inside `withEffect(ctx, makeFrame(node, "declaration"), () => withNamespace(ctx, "Effect", …))`.
  Before walking, wrap every `ReturnStatement` argument of the body (not of nested functions) as
  `(<arg>) satisfies boolean`.
- **After the body's `}`,** append in order:
  - `, <E>.scoped` if the frame became scoped;
  - `, (effect, { <params the layer reads> }) => <E>.provide(effect, <layer text>)` if there is a
    `with` (walk the layer expression in the module's namespace);
  - `), { law: "<name>", inputs: { <n>: <schema>, … }`;
  - `, requires: ({ <params it reads> }) => <requires text>` if there is a `requires`;
  - ` })`;
  - and for private laws, `\nvoid <name>`.
  - "Params it reads" are the identifiers free in that expression that are parameters, in
    parameter order. Use the scope analysis' bindings.

Export `lawHandlers: HandlerGroup = { LawDeclaration: lawDeclaration }` and register it in
`registry.ts`.

- [ ] **Step 4: Write the snapshot, review it, and run the tests**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/compile.test.ts -u`, then
`git diff packages/effectscript/core/test/fixtures/law/bank.ts`. The law lines must match Step 1's
expected output. Then run:

`pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/typecheck.test.ts`

Expected: PASS. `typecheck.test.ts` type-checks the new output strictly, `satisfies boolean`
included.

- [ ] **Step 5: Commit**

```bash
pnpm codegen && pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/transform/law.ts packages/effectscript/core/src/compiler/transform/registry.ts packages/effectscript/core/test/fixtures/law packages/effectscript/core/test/law.test.ts packages/effectscript/core/scripts/generate-skill.ts packages/effectscript/core/skills -m "feat(effectscript): law lowers to a pure property constant (Plan 24 Task 2, ADR-0075)"
```

### Task 3: `effectscript/laws`, the test-time helpers

**Files:**
- Create: `packages/effectscript/core/src/laws.ts`. It is served as `effectscript/laws` by the
  existing `"./*"` export, so `package.json` needs no change.
- Test: `packages/effectscript/core/test/laws-runtime.test.ts`.

**Interfaces:**
- **Produces:**

  ```ts
  export interface Law<I, E = never, R = never> {
    (input: I): Effect.Effect<boolean, E, R>
    readonly law: string
    readonly inputs: { readonly [K in keyof I]: Schema.Top }  // the constraint `Arbitrary.schema` takes
    readonly requires?: ((input: I) => boolean) | undefined
  }
  export const arbitrary: <I>(law: Law<I, unknown, unknown>) => Arbitrary.Arbitrary<I>
  export const check: <I, E, R>(law: Law<I, E, R>, options?: Arbitrary.CheckOptions) =>
    Effect.Effect<Arbitrary.CheckResult<I, E | Cause.Cause<E>>, never, R>
  export const assertLaw: <I, E, R>(law: Law<I, E, R>, options?: Arbitrary.CheckOptions) =>
    Effect.Effect<void, never, R>
  ```

- `check` mirrors `@effect/vitest`'s `runCheck` (`packages/vitest/src/internal/internal.ts`
  lines 95–125):
  - a property's failure, defect or non-boolean answer falsifies it;
  - interruption propagates.
- `assertLaw` dies with `new Error(\`law ${law.law}: ${Arbitrary.formatCheckFailure(result)}\`)`
  unless the result passed.

- [ ] **Step 1: Write the failing test**

```ts
// packages/effectscript/core/test/laws-runtime.test.ts
import { Effect, Schema } from "effect"
import { assertLaw, check, type Law } from "effectscript/laws"
import { describe, expect, it } from "vitest"

const law = <I>(name: string, inputs: Law<I>["inputs"], f: (i: I) => Effect.Effect<boolean, any>, requires?: (i: I) => boolean): Law<I, any> =>
  Object.assign(f, { law: name, inputs, requires })

describe("effectscript/laws (ADR-0075)", () => {
  it("passes a law that holds", async () => {
    const result = await Effect.runPromise(check(law("zero", { x: Schema.Int }, ({ x }) => Effect.succeed(x * 0 === 0))))
    expect(result._tag).toBe("Passed")
  })

  it("shrinks a counterexample", async () => {
    const result: any = await Effect.runPromise(check(law("small", { x: Schema.Int }, ({ x }) => Effect.succeed(x < 10)), { seed: 1 }))
    expect(result._tag).toBe("Falsified")
    expect(result.shrunkInput).toEqual({ x: 10 })
  })

  it("falsifies a law whose effect fails, without dying", async () => {
    const result: any = await Effect.runPromise(check(law("boom", { x: Schema.Int }, () => Effect.fail("boom"))))
    expect(result._tag).toBe("Falsified")
  })

  it("discards inputs that miss `requires`, and is exhausted when none meet it", async () => {
    const nonNegative = law("nonNegative", { x: Schema.Int }, ({ x }) => Effect.succeed(x >= 0), ({ x }) => x >= 0)
    expect((await Effect.runPromise(check(nonNegative)))._tag).toBe("Passed")
    const never = law("never", { x: Schema.Int }, () => Effect.succeed(true), () => false)
    expect((await Effect.runPromise(check(never)))._tag).toBe("Exhausted")
  })

  it("assertLaw dies with the law's name and the formatted failure", async () => {
    const exit = await Effect.runPromiseExit(assertLaw(law("small", { x: Schema.Int }, ({ x }) => Effect.succeed(x < 10))))
    expect(String(exit)).toContain("law small:")
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/laws-runtime.test.ts`

Expected: FAIL with "Cannot find module 'effectscript/laws'".

- [ ] **Step 3: Implement `src/laws.ts`**

```ts
/**
 * Runs `law` declarations (ADR-0075): inputs from each parameter's schema, `requires` as a filter,
 * shrunk counterexamples. Imported by `?laws` modules and `efx verify`, never by compiled modules.
 *
 * @since 4.0.0
 */
import * as Arbitrary from "effect/Arbitrary"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import type * as Schema from "effect/Schema"

/** @since 4.0.0 @category models */
export interface Law<I, E = never, R = never> {
  (input: I): Effect.Effect<boolean, E, R>
  readonly law: string
  readonly inputs: { readonly [K in keyof I]: Schema.Top }
  readonly requires?: ((input: I) => boolean) | undefined
}

/** @since 4.0.0 @category arbitraries */
export const arbitrary = <I>(law: Law<I, unknown, unknown>): Arbitrary.Arbitrary<I> => {
  const fields = Object.fromEntries(
    Object.entries(law.inputs).map(([key, schema]) => [key, Arbitrary.schema(schema as any)])
  )
  const all = Arbitrary.all(fields) as unknown as Arbitrary.Arbitrary<I>
  return law.requires === undefined ? all : Arbitrary.filter(all, law.requires)
}

const property = <I, E, R>(law: Law<I, E, R>, input: I): Effect.Effect<boolean, E | Cause.Cause<E>, R> =>
  Effect.catchCause(
    Effect.suspend(() => law(input)),
    (cause): Effect.Effect<never, E | Cause.Cause<E>> =>
      Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.fail(cause)
  )

/** @since 4.0.0 @category checks */
export const check = <I, E, R>(law: Law<I, E, R>, options?: Arbitrary.CheckOptions) =>
  Arbitrary.checkEffect(arbitrary(law as Law<I, unknown, unknown>), (input) => property(law, input), options)

/** @since 4.0.0 @category checks */
export const assertLaw = <I, E, R>(law: Law<I, E, R>, options?: Arbitrary.CheckOptions): Effect.Effect<void, never, R> =>
  Effect.flatMap(check(law, options), (result) => {
    const failure = Arbitrary.formatCheckFailure(result)
    return failure === undefined ? Effect.void : Effect.die(new Error(`law ${law.law}: ${failure}`))
  })
```

Match the exact names of `Schema.Top` and `Arbitrary.schema`'s constraint to `effect` at execution
time. Keep the public shape above.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/laws-runtime.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/laws.ts packages/effectscript/core/test/laws-runtime.test.ts -m "feat(effectscript): effectscript/laws checks a law's property over its schemas (Plan 24 Task 3, ADR-0075)"
```

### Task 4: `laws "path"` and the `?laws` module

**Files:**
- Modify: `packages/effectscript/core/src/compiler/transform/test.ts`. Add a `lawsStatement`
  handler next to `doctestStatement`, registered in `testHandlers`.
- Create: `packages/effectscript/core/src/doc/laws.ts` (`lawsSource`).
- Modify: `packages/effectscript/core/src/vite.ts`:
  - `lawsTarget` next to `doctestTarget`;
  - `efxFile` and `diskFile` handle `?laws`;
  - `load` serves it;
  - the strip-types name is `.laws.<mode>`.
- Modify: `packages/effectscript/core/src/register.ts`. The `load` hook accepts `file:` URLs whose
  pathname ends in `.efx` and whose search is `?laws`.
- Create: `packages/effectscript/examples/test/laws.test.efx`.
- Create: `packages/effectscript/examples/test/laws-failure/` (a `vitest.config.ts` like
  `doctest-failure`'s, `wrong.efx`, `wrong.test.efx`), and
  `packages/effectscript/examples/test/laws-failure.test.ts`.
- Test: `packages/effectscript/core/test/law.test.ts` (diagnostics, lowering).

**Interfaces:**
- **Lowering.** `laws "<path>" [with L]` →

  ```ts
  import { $efxRunLaws as <fresh> } from "<path>?laws"
  ```

  plus `describe("laws <path>", () => <fresh>(<it>))`, or with `L`:
  `layer(L)("laws <path>", (<param>) => <fresh>(<param>))`. This is `doctestStatement`'s shape,
  importing a named export instead of the default.
- **`lawsSource(file: string, source: string): { code: string; diagnostics: ReadonlyArray<Diagnostic> }`**
  in `src/doc/laws.ts`:
  - returns the source unchanged, followed by:

    ```ts
    import * as $efxLaws from "effectscript/laws"
    export const $efxRunLaws = ($efxIt: any) => {
      $efxIt.effect("law <name>", () => $efxLaws.assertLaw(<name>))
    }
    ```

    with one line per top-level `LawDeclaration` (exported or not), in source order;
  - **EFX9406** if the module has a top-level `main` (code `""`);
  - **EFX9405** (warning) if it has no laws;
  - the parse diagnostics if it doesn't parse.

  Use the compiler's `parse`; never match text with regular expressions.

- [ ] **Step 1: Write the failing tests**

Append to `packages/effectscript/core/test/law.test.ts`:

```ts
import { lawsSource } from "../src/doc/laws.ts"

describe("laws statement and ?laws (ADR-0075)", () => {
  it("lowers like doctest, importing the runner", () => {
    const { code } = toTypeScript('laws "../src/bank.efx"\n', { filename: "test/bank.test.efx" })
    expect(code).toContain('from "../src/bank.efx?laws"')
    expect(code).toMatch(/describe\("laws \.\.\/src\/bank\.efx", \(\) => \w+\(it\)\)/)
    const withLayer = toTypeScript('laws "../src/bank.efx" with Ledger.layerTest\n', { filename: "t.efx" }).code
    expect(withLayer).toMatch(/layer\(Ledger\.layerTest\)\("laws \.\.\/src\/bank\.efx", \((\w+)\) => \w+\(\1\)\)/)
  })

  it("needs a relative .efx path", () => {
    expect(codes('laws "bank.efx"\n')).toContain("EFX9404")
    expect(codes('laws "../src/bank.ts"\n')).toContain("EFX9404")
  })

  it("appends one runner line per law, private ones included", () => {
    const { code, diagnostics } = lawsSource("bank.efx", bank)
    expect(diagnostics).toEqual([])
    expect(code.startsWith(bank)).toBe(true)
    expect(code).toContain('$efxIt.effect("law withdrawNeverNegative", () => $efxLaws.assertLaw(withdrawNeverNegative))')
    expect(code).toContain('$efxIt.effect("law withdrawNeverAdds", () => $efxLaws.assertLaw(withdrawNeverAdds))')
  })

  it("refuses a target with main, and warns about one without laws", () => {
    expect(lawsSource("app.efx", "main { }\nlaw l(x: Int) { return true }\n").diagnostics.map((d) => d.code)).toEqual(["EFX9406"])
    expect(lawsSource("none.efx", "export const x = 1\n").diagnostics.map((d) => d.code)).toEqual(["EFX9405"])
  })
})
```

`packages/effectscript/examples/test/laws.test.efx`:

```efx
laws "../src/bank.efx"
```

`packages/effectscript/examples/test/laws-failure/wrong.efx`:

```efx
/** On purpose: small numbers only. */
law staysSmall(x: Int) {
  return x < 10
}
```

`packages/effectscript/examples/test/laws-failure/wrong.test.efx`:

```efx
laws "./wrong.efx"
```

`packages/effectscript/examples/test/laws-failure.test.ts`:

```ts
import { spawnSync } from "node:child_process"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const dir = path.join(import.meta.dirname, "laws-failure")
const vitest = path.join(import.meta.dirname, "../node_modules/vitest/vitest.mjs")

describe("laws (Plan 24, ADR-0075)", () => {
  it("report a falsified law with its shrunk input", () => {
    const result = spawnSync(process.execPath, [vitest, "run", "--root", dir], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    })
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).toBe(1)
    expect(output).toContain("law staysSmall")
    expect(output).toMatch(/\{\s*"?x"?:\s*10\s*\}/)
  }, 60_000)
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts`, then
`pnpm test --run --project @effectscript/examples packages/effectscript/examples/test/laws.test.efx packages/effectscript/examples/test/laws-failure.test.ts`

Expected: FAIL. There's no `LawsStatement` handler, no `src/doc/laws.ts`, and `?laws` isn't served.
`bank.efx` in the examples has no laws until Task 7; until then `laws.test.efx` reports EFX9405 and
no tests.

- [ ] **Step 3: Implement**

- **`lawsStatement`** in `transform/test.ts`: copy `doctestStatement`, with these changes:
  - the path check is `/^\.\.?\//` and `/\.efx$/`, else EFX9404 with hint
    `for example laws "../src/bank.efx"`;
  - `ctx.imports.need(\`${target}?laws\`, "$efxRunLaws", local)`;
  - the description is `laws ${target}`.

  Register `LawsStatement: lawsStatement` in `testHandlers`.
- **`src/doc/laws.ts`:** `lawsSource` as in Interfaces. Walk the `program.body` of a successful
  `parse(source)`; a failed parse returns its diagnostic (EFX1001) and code `""`.
  - A law is a `LawDeclaration`, or an `ExportNamedDeclaration` whose `declaration` is one.
  - `main { … }` parses as a `MainStatement` (see `efxParseMain`).
  - Diagnostics point into the target file: for EFX9406, at the `main` keyword's offsets.
- **Vite:**

  ```ts
  const lawsQuery = /\?laws$/
  const lawsTarget = (id: string): string | undefined =>
    !id.startsWith("\0") && /\.efx\?laws$/.test(id) ? id.replace(lawsQuery, "") : undefined
  ```

  - `efxFile` returns `id` when `lawsTarget(id) !== undefined`.
  - `diskFile` strips `?laws` as well as `?doctest`.
  - `load` tries `lawsTarget` after `doctestTarget` and returns `lawsSource(target, source).code`,
    throwing formatted errors as the doctest branch does.
  - The strip-types file name is `${diskFile(file)}.laws.${mode}` for a laws id.
- **`register.ts`:**
  - Parse the URL with `new URL(url)`.
  - If `url.protocol === "file:"`, the pathname ends in `.efx` and `search === "?laws"`, then:
    - read the file at `fileURLToPath(new URL(url.pathname, "file://"))`;
    - compile `lawsSource(filename, source).code` with the same options and error handling as a
      plain `.efx`;
    - strip and return it as for a plain `.efx`.
  - EFX9406 errors throw like compile errors.

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts packages/effectscript/core/test/vite.test.ts`, then
`pnpm test --run --project @effectscript/examples packages/effectscript/examples/test/laws-failure.test.ts`

Expected: PASS. `laws.test.efx` passes after Task 7 gives `bank.efx` its laws.

- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/transform/test.ts packages/effectscript/core/src/doc/laws.ts packages/effectscript/core/src/vite.ts packages/effectscript/core/src/register.ts packages/effectscript/core/test/law.test.ts packages/effectscript/examples/test/laws.test.efx packages/effectscript/examples/test/laws-failure packages/effectscript/examples/test/laws-failure.test.ts -m "feat(effectscript): laws \"path\" runs a module's laws as property tests through ?laws (Plan 24 Task 4, ADR-0075)"
```

### Task 5: Reverse compiler

**Files:**
- Modify: `packages/effectscript/core/src/compiler/reverse/library.ts` (`convertLaw`, next to
  `convertWorkflow`).
- Modify: `packages/effectscript/core/src/compiler/reverse/effects.ts`. Add `convertLaw` to the
  `visitProgram` chain (about line 616).
- Modify: `packages/effectscript/core/src/compiler/reverse/test.ts`. Reverse the `laws` lowering
  where `doctest`'s is reversed (about line 137).
- Snapshot: `packages/effectscript/core/test/fixtures/law/bank.reverse.efx`.
- Test: `packages/effectscript/core/test/law.test.ts` (`roundTrip`, `expectSafe` from
  `test/utils/reverse.ts`).

**Interfaces:**
- `convertLaw(ctx, body, index, visit): number` returns how many statements it consumed:
  - 2 for a private law plus its `void`;
  - 1 for an exported law;
  - 0 for no match.
- It matches exactly Task 2's shape:
  - an optional `export`;
  - `const N = Object.assign(Effect.fnUntraced(function*({ … }: { readonly …: T; … }) { … }[, Effect.scoped][, (effect, { … }) => Effect.provide(effect, L)]), { law: "N", inputs: { … }[, requires: ({ … }) => P] })`;
  - the `/*#__PURE__*/` comment is part of the shape and isn't kept;
  - each `inputs` entry must equal `typeToSchema` of the parameter's annotation, or the shape doesn't
    match.
- On a match, it removes `satisfies boolean` from the body's returns and emits
  `[export ]law N(p: T, …)[ requires P][ with L] { … }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { expectSafe, roundTrip } from "./utils/reverse.ts"

describe("law: reverse (ADR-0075, ADR-0030)", () => {
  it("round-trips the fixture", () => {
    expect(roundTrip(bank)).toBe(bank)
  })

  it("leaves hand-written look-alikes as TypeScript", () => {
    expectSafe(`import { Effect, Schema } from "effect"
const x = Object.assign(Effect.fnUntraced(function*({ n }: { readonly n: number }) { return n > 0 }), { law: "y", inputs: { n: Schema.Number } })
`)
  })
})
```

`roundTrip` compiles to TypeScript, converts back, and checks ADR-0030 identity. A law whose `law`
string doesn't match its constant's name (`"y"` vs `x`) stays TypeScript.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts packages/effectscript/core/test/reverse-golden.test.ts`

Expected: FAIL. The round trip yields the TypeScript constant.

- [ ] **Step 3: Implement `convertLaw` and the `laws` reverse.** Model them on `convertWorkflow`.
  Use `importedLocal(ctx.analysis, "effect", "Effect")` to find `Effect`. The `laws` reverse
  matches `import { $efxRunLaws as X } from "P?laws"` plus the `describe`/`layer` call shape.

- [ ] **Step 4: Run them and see them pass, writing the `.reverse.efx` snapshot**

Run: `pnpm test --run --project effectscript packages/effectscript/core/test/law.test.ts packages/effectscript/core/test/reverse-golden.test.ts -u`

Then review `bank.reverse.efx`: it must equal `bank.efx`. Then run again without `-u`. Expected:
PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/core/src/compiler/reverse packages/effectscript/core/test/fixtures/law/bank.reverse.efx packages/effectscript/core/test/law.test.ts -m "feat(effectscript): the reverse compiler gives law and laws back (Plan 24 Task 5, ADR-0075)"
```

Then regenerate the Effect docs corpus if the reverse compiler changed what it converts (Plan 23
precedent, commit 81e71dc70):

```bash
pnpm --filter @effectscript/effect-docs run codegen && git status --short packages/effectscript/effect-docs
```

Commit the corpus only if it changed:
`docs(effectscript): regenerate the Effect docs corpus for law (Plan 24)`.

### Task 6: Tree-sitter and editors

**Files:**
- Modify: `packages/effectscript/tree-sitter/grammar.js`:
  - `keywords` gets `"law"`, `"laws"`, `"requires"`;
  - `law_declaration` goes in the declaration choice;
  - `laws_statement` goes in the statement choice;
  - add a conflict entry `[$.primary_expression, $.laws_statement]` if `tree-sitter generate` asks
    for one.
- Modify: `packages/effectscript/tree-sitter/queries/src/highlights.scm`. Add the three keywords.
  Then run `node scripts/queries.mjs` to regenerate the Helix and Zed copies.
- Create: `packages/effectscript/tree-sitter/test/corpus/laws.txt`.
- Modify: `packages/effectscript/tree-sitter/test/corpus/identifiers.txt`.
- Test: `packages/effectscript/tree-sitter/test/grammar.test.ts` (it parses every core fixture,
  `law/bank.efx` included). Also `packages/effectscript/language/test` with a type error in a law
  body.

**Interfaces:**

```js
// `law name(params) [requires e] [with e] { … }` (ADR-0075)
law_declaration: ($) =>
  seq(
    "law",
    field("name", $.identifier),
    field("parameters", $.formal_parameters),
    optional(seq("requires", field("requires", $.expression))),
    optional(seq("with", field("layer", $.expression))),
    field("body", $.statement_block)
  ),

// `laws "path" [with layer]` (ADR-0075)
laws_statement: ($) =>
  prec.right(
    seq("laws", field("module", $.string), optional(seq("with", field("layer", $.expression))), optional($._semicolon))
  ),
```

- [ ] **Step 1: Write the corpus entries (the failing test)**

`test/corpus/laws.txt`:

```
==================
law with requires and with
==================

law l(a: Money) requires a >= 0 with Accounts.model(a) {
  return true
}

---

(program
  (law_declaration
    name: (identifier)
    parameters: (formal_parameters (required_parameter pattern: (identifier) type: (type_annotation (type_identifier))))
    requires: (binary_expression left: (identifier) right: (number))
    layer: (call_expression function: (member_expression object: (identifier) property: (property_identifier)) arguments: (arguments (identifier)))
    body: (statement_block (return_statement (true)))))

==================
laws statement
==================

laws "../src/bank.efx" with Ledger.layerTest

---

(program
  (laws_statement
    module: (string (string_fragment))
    layer: (member_expression object: (identifier) property: (property_identifier))))
```

Append to `identifiers.txt` a case for `const law = 1; law(x); laws.push(requires)` parsing as plain
identifiers. Copy the format of the existing `workflow`/`activity` entries there.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test --run --project tree-sitter-effectscript packages/effectscript/tree-sitter/test/grammar.test.ts`

Expected: FAIL. There's no `law_declaration`, and `law/bank.efx` has parse errors.

- [ ] **Step 3: Implement the grammar** as in Interfaces. Run
  `cd packages/effectscript/tree-sitter && npx tree-sitter generate --abi 14` and add conflicts
  only when it asks. Update `queries/src/highlights.scm`, then run `node scripts/queries.mjs`.

- [ ] **Step 4: Add the editor test.** In `packages/effectscript/language/test/`, follow an existing
  diagnostics test. A law body with `return 1` reports TypeScript's
  "Type 'number' does not satisfy the expected type 'boolean'" at the law's `return` line in the
  `.efx`.

- [ ] **Step 5: Run everything and see it pass**

Run: `pnpm test --run --project tree-sitter-effectscript --project @effectscript/language`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/tree-sitter packages/effectscript/zed/languages packages/effectscript/language/test -m "feat(effectscript): tree-sitter and editors know law, laws and requires (Plan 24 Task 6, ADR-0075)"
```

### Task 7: Examples, documentation and the skill

**Files:**
- Modify: `packages/effectscript/examples/src/bank.efx`. Add the two laws from the fixture, with
  doc comments.
- Modify: `docs/superpowers/specs/2026-10-02-effectscript-design.md`:
  - a new §4.14 subsection, "#### `law` and `laws` (ADR-0075)", with the example and lowering from
    the proofs spec §2;
  - §4.19 rows: `law` ("statement position, optionally after `export`, followed on the same line by
    an identifier and `(`"), `laws` ("statement position, followed on the same line by a string
    literal"), and `requires`/`with` ("in a `law` header only");
  - EFX9401–EFX9406 in §12's table.
- Modify: `packages/effectscript/core/skills/effectscript/references/patterns.md` (a type-checked
  "Laws" pattern), then `pnpm codegen` for `references/syntax.md`.
- Modify: `packages/effectscript/site/src/pages/index.astro` line 137:
  "Proofs: laws run as property tests today, and Bend2 proves them from the same source."
  This is a factual roadmap correction (ADR-0074), not new marketing copy.

- [ ] **Step 1: Run the examples' laws** (their test exists since Task 4)

Run: `pnpm test --run --project @effectscript/examples packages/effectscript/examples/test/laws.test.efx`

Expected: FAIL (EFX9405) before `bank.efx` has laws, PASS after.

- [ ] **Step 2: Write the docs, the skill pattern and the site line.** Then run:

```bash
pnpm codegen && pnpm test --run --project effectscript packages/effectscript/core/test/skill.test.ts && pnpm lint
```

Expected: PASS. The skill's checker type-checks the new pattern.

- [ ] **Step 3: Commit**

```bash
pnpm check && pnpm lint && git commit packages/effectscript/examples/src/bank.efx docs/superpowers/specs/2026-10-02-effectscript-design.md packages/effectscript/core/skills packages/effectscript/site/src/pages/index.astro -m "docs(effectscript): law and laws in the spec, the skill and the examples (Plan 24 Task 7)"
```

- [ ] **Step 4: ADR status.** If the user approved the proofs spec, set ADR-0075's status to
  `Accepted` and update its index row. Then:

  ```bash
  git commit docs/adr/0075-law-declarations.md docs/adr/README.md -m "docs(adr): accept ADR-0075"
  ```
