# EffectScript Plan 2: Semantic Hardening Implementation Plan

> **For agentic workers:** execute task by task (TDD: write the failing test, watch it fail,
> implement, watch it pass, commit). Steps use checkbox (`- [ ]`) syntax. Every decision this plan
> implements is recorded in `docs/adr/`; rulings made while executing that change a decision get a
> new ADR (see `.agents/AGENTS.md`).

**Goal:** Make the constructs delivered in Plan 1 semantically correct and tested by observed
behavior, per ADRs 0009–0014 and 0017, before any new language surface is added (ADR-0016).

**Architecture:** Same compiler (acorn + efxPlugin → scope analysis → magic-string edits). This
plan adds a per-file name service (`names.ts`) for hygienic references and temporaries. It
rewrites the `try`, resource, pipeline, schema-optional and service-key lowerings to their ADR
contracts, makes the parser's lookahead token-based, and makes editor mappings role-aware.

**Tech Stack:** TypeScript 6 (core devDependency), acorn 8, @sveltejs/acorn-typescript,
magic-string, vitest, the workspace `effect` v4.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` (§4.3, §4.4, §4.6, §4.8, §4.9,
§12). **Decisions:** `docs/adr/0009`–`0014`, `0017`. **Review:**
`docs/reviews/2026-10-02-effectscript-plan-review.md` (R01–R06, R13, R14, D02, D04, D06, D10).

## Global Constraints

- The compiler stays browser-safe: no Node APIs in `src/compiler/**`.
- Output is idiomatic Effect v4. Readable local temporaries are allowed when correctness needs
  them (ADR-0003).
- Every golden output type-checks with `strict` + `exactOptionalPropertyTypes` against the
  workspace `effect` (`test/typecheck.test.ts`).
- The superset identity test (`test/superset.test.ts`) stays green: valid TS compiles to itself
  byte for byte.
- magic-string ordering: openers `appendRight` and closers `prependLeft` before walking children,
  `appendLeft` after walking; never `update` a range that contains other edit points.
- Package commands run from `packages/effectscript/core`: `pnpm vitest run --project effectscript
  <files>`, `pnpm check` (root), `pnpm lint-fix` before each commit.
- Commit after each task, with a `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.

## Review Focus

1. **Capture through the prelude path:** a free user `Effect` at module level, plus an inner
   `Effect` binding elsewhere. The user reference keeps the real import, compiler references use
   the alias, and the two imports coexist.
2. **`try` inside a `match` arm or `do` expression in `effect` code:** every `try` is now effectful,
   so the enclosing arm or `do` must become a generator (`isEffectful` must count `try`).
3. **Interruption through `try`:** an untyped `catch` must not catch `Effect.interrupt`, and
   `finally` must still run.
4. **Pipelines inside `effect` code with `await` in a non-inlinable Hack step:** EFX5002, never
   invalid `yield*` inside an arrow.
5. **Service-key derivation with Windows separators, `index.efx`, and no `packageRoot`:** never an
   absolute path in a key.

---

### Task 1: Visit every child once (D02)

**Files:**
- Modify: `src/compiler/ast.ts` (`children`)
- Test: `test/review.test.ts` (new `describe("D02")`)

**Interfaces:** `children(node)` returns each distinct child node once, in source order.

- [ ] **Step 1: Failing test**

```ts
describe("D02: catch clauses are visited once", () => {
  it("builtins inside a single catch are qualified once (effect code)", () => {
    const code = compile("effect f() {\n  try { return await succeed(1) } catch { return await succeed(2) }\n}\n")
    expect(code).not.toContain("Effect.Effect.")
  })
  it("builtins inside a plain top-level catch are qualified once", () => {
    const code = compile("try { x() } catch { log(\"x\") }\n")
    expect(code).toContain("Effect.log(\"x\")")
    expect(code).not.toContain("Effect.Effect.")
  })
})
```

- [ ] **Step 2: Run** `pnpm vitest run --project effectscript test/review.test.ts`. Expected:
  FAIL (`Effect.Effect.log`).
- [ ] **Step 3: Implement.** In `children`, keep a `Set<Node>` of the children already added and
  skip repeats (the parser stores the first catch clause in both `handler` and `handlers[0]`).
- [ ] **Step 4: Run** the file again (PASS), then the whole project
  (`pnpm vitest run --project effectscript`).
- [ ] **Step 5: Commit** `fix(effectscript): visit each AST child once`.

### Task 2: Hygienic references and temporaries (ADR-0009)

**Files:**
- Create: `src/compiler/names.ts`
- Modify: `src/compiler/analyze/scope.ts` (collect `identifierNames`, `boundNames`, `innerBound`),
  `src/compiler/imports.ts` (aliases), `src/compiler/context.ts` (`refs` memo), `compile.ts`,
  every transform that emits a namespace (`effect.ts`, `await.ts`, `returnType.ts`, `try.ts`,
  `resources.ts`, `proposals.ts`, `pipeline.ts`, `prelude.ts`, `match.ts`, `main.ts`,
  `service.ts`, `schema.ts`, `classLike.ts`), `src/compiler/schema/mapping.ts`
- Test: `test/hygiene.test.ts` (new), fixture `test/fixtures/hygiene/shadowing.efx` (+ golden)

**Interfaces:**
- `ref(ctx: Ctx, module: string, name: string): string`: the local name to emit for a
  compiler-owned reference (per-file memo).
- `fresh(ctx: Ctx, base: string): string`: a name that occurs nowhere in the file and was not
  handed out before.
- `ImportSet.need(module, imported, local = imported)`.
- `ScopeAnalysis` gains `identifierNames: ReadonlySet<string>` (every `Identifier`/`JSXIdentifier`
  name in the file) and `innerBound: ReadonlySet<string>` (names bound in any non-module scope,
  either namespace). `boundNames` is `innerBound` ∪ module values ∪ module types.

- [ ] **Step 1: Failing tests** (`test/hygiene.test.ts`)

```ts
import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const compile = (source: string) => {
  const result = toTypeScript(source)
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  if (errors.length > 0) throw new Error(errors.map((d) => `${d.code} ${d.message}`).join("\n"))
  return result.code
}

describe("ADR-0009: generated references are hygienic", () => {
  it("a module binding named Effect does not capture Effect.fn", async () => {
    const mod = await runCompiled(`
      import { Effect as Fx } from "effect"
      const Effect = { fn: () => () => "wrong" }
      export effect f() { return 1 }
      export const value = Fx.runSync(f())
      export const user = Effect.fn()()
    `)
    expect(mod.value).toBe(1)
    expect(mod.user).toBe("wrong")
  })

  it("reuses an aliased verified import", () => {
    const code = compile("import { Effect as E } from \"effect\"\nexport effect f() { return 1 }\n")
    expect(code).toContain("const f = E.fn(\"f\")")
    expect(code).not.toContain("import { Effect }")
  })

  it("a parameter named Effect does not capture the inner Effect.gen", async () => {
    const mod = await runCompiled(`
      import { Effect as Fx } from "effect"
      export effect f(Effect: unknown) {
        return await effect { return 1 }
      }
      export const value = Fx.runSync(f("shadow"))
    `)
    expect(mod.value).toBe(1)
  })

  it("aliases Schema, Match, Context and pipe when shadowed", () => {
    const code = compile(
      "const Schema = 1\nconst Match = 2\nconst Context = 3\nconst pipe = 4\n" +
        "schema P { x: number }\nservice S { effect m(): void }\n" +
        "export const m = (v: \"a\" | \"b\") => match (v) { when \"a\": 1; default: 2 }\n" +
        "export const p = 1 |> String\n"
    )
    expect(code).toMatch(/import \{ Context as Context\$, Match as Match\$, Schema as Schema\$, pipe as pipe\$ \} from "effect"/)
    expect(code).toContain("extends Schema$.Class<P>")
    expect(code).toContain("extends Context$.Service<S,")
    expect(code).toContain("Match$.value(v)")
    expect(code).toContain("pipe$(1, String)")
  })

  it("a free user reference and a shadowed compiler reference coexist", () => {
    const code = compile(
      "export const a = Effect.succeed(1)\nexport const g = (Effect: number) => effect { return Effect }\n"
    )
    expect(code).toContain("import { Effect, Effect as Effect$ } from \"effect\"")
    expect(code).toContain("export const a = Effect.succeed(1)")
    expect(code).toContain("Effect$.gen(function*() { return Effect })")
  })

  it("pipeline topic parameters never capture user names", () => {
    const code = compile("declare const obj: { m(a: number, b: unknown): number }\nexport const v = 1 |> obj.m(%, $)\n")
    expect(code).not.toContain("($) =>")
    expect(code).toMatch(/\((\$\$|\$\$\$|\$\d+)\) => obj\.m\(\1, \$\)/)
  })

  it("the runtime import is aliased when a NodeRuntime binding exists", () => {
    const code = compile("const NodeRuntime = 1\nmain {\n  await log(\"hi\")\n}\n")
    expect(code).toContain("NodeRuntime as NodeRuntime$")
    expect(code).toContain("NodeRuntime$.runMain(")
  })
})
```

Also add `test/fixtures/hygiene/shadowing.efx`:

```ts
import { Effect as Fx } from "effect"

const Schema = { note: "user value named Schema" }

export schema Point { x: number; y?: number }

export effect area(Effect: number) {
  const inner = effect { return Effect * 2 }
  return await inner
}

export const run = Fx.runSync(area(2))
export const note = Schema.note
```

- [ ] **Step 2: Run** `pnpm vitest run --project effectscript test/hygiene.test.ts`. Expected: FAIL
  (output uses the user's `Effect`; no aliases).
- [ ] **Step 3: Implement.**
  - `scope.ts`: during `analyze`, record every `Identifier`/`JSXIdentifier` name (walk all nodes),
    and after the walk compute `innerBound` from every non-module `Scope`'s `values ∪ types`.
  - `names.ts`:

```ts
/**
 * Per-file names for compiler-owned references and temporaries (ADR-0009).
 *
 * @since 0.1.0
 */
import type { Node } from "./ast.ts"
import type { Ctx } from "./context.ts"

const importedName = (specifier: Node): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)

/**
 * A name that occurs nowhere in the file and was not handed out before.
 *
 * @since 0.1.0
 * @category names
 */
export const fresh = (ctx: Ctx, base: string): string => {
  const taken = (name: string) => ctx.analysis.identifierNames.has(name) || ctx.generatedNames.has(name)
  let name = base
  for (let i = 2; taken(name); i++) name = `${base}${i}`
  ctx.generatedNames.add(name)
  return name
}

/**
 * The local name to emit for `module`'s export `name`, decided once per file.
 *
 * @since 0.1.0
 * @category names
 */
export const ref = (ctx: Ctx, module: string, name: string): string => {
  const key = `${module}\u0000${name}`
  const cached = ctx.refs.get(key)
  if (cached !== undefined) return cached
  let local: string | undefined
  for (const statement of ctx.analysis.program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== module) continue
    for (const specifier of statement.specifiers as Array<Node>) {
      if (specifier.type !== "ImportSpecifier" || importedName(specifier) !== name) continue
      if (!ctx.analysis.innerBound.has(specifier.local.name)) {
        local = specifier.local.name
        ctx.imports.upgrade(statement, specifier)
      }
    }
  }
  if (local === undefined) {
    const bound = ctx.analysis.innerBound.has(name) || ctx.analysis.module.values.has(name) ||
      ctx.analysis.module.types.has(name)
    local = bound ? fresh(ctx, `${name}$`) : name
    ctx.imports.need(module, name, local)
  }
  ctx.refs.set(key, local)
  return local
}
```

  - `imports.ts`: `entries: Map<module, Map<local, imported>>`. `need(module, imported, local =
    imported)`. `upgrade(statement, specifier)` records a type-only import that must become a
    value import, using the existing `upgradeTypeOnly` edit (keyed by the specifier node instead
    of a name). `emitImports` prints `imported` or `imported as local`, merges into an existing
    named import from the same module, and skips a local the module scope already binds (a user
    import of the same name).
  - `context.ts`: add `refs: Map<string, string>` and `generatedNames: Set<string>`, initialized in
    `compile.ts`.
  - Replace every literal namespace in the transforms with `ref`. For example, in `effect.ts`:
    `const E = ref(ctx, "effect", "Effect")`, then use
    `` `const ${name} = ${E}.fn(${…})(function*` ``. `rewriteReturnType(ctx, annotation, wrapper)`
    takes the wrapper *member path* (`"fn.Return"` / `"Effect"`) and prefixes `ref(ctx, "effect",
    "Effect")`. In `schema/mapping.ts`, the tables hold member names (`"String"`) and every emitted
    schema uses `` `${S}.${member}` `` with `S = ref(ctx, "effect", "Schema")`. In `prelude.ts`, a
    builtin's qualifier is `ref(ctx, resolution.module, resolution.importName)`. User-written free
    identifiers (a bare `Schema`, a bare type `Effect<…>`) keep `ctx.imports.need(module, name)`
    under their own name.
  - `pipeline.ts`: delete `pipeName`; use `ref(ctx, "effect", "pipe")`. `freshName` becomes
    `fresh(ctx, "$")`, which yields `$`, `$2`, `$3`, … (adjust the test regex to `\$\d*` if needed;
    `$` itself is taken in the test).
  - `main.ts`: `ref(ctx, target.module, target.runtime)` and `ref(ctx, target.module,
    target.services)`.
- [ ] **Step 4: Run** `test/hygiene.test.ts` (PASS), then the whole project. The golden for the
  new fixture is created by the first run; review it by eye. Expected: no other golden changes.
- [ ] **Step 5: Commit** `feat(effectscript): hygienic generated references and temporaries`.

### Task 3: The `try` contract (ADR-0010)

**Files:**
- Modify: `src/compiler/transform/try.ts` (rewrite the effect path), `src/compiler/analyze/scope.ts`
  (`localTags`), `src/compiler/transform/match.ts` + `proposals.ts` (via `isEffectful`)
- Test: `test/try.test.ts` (new runtime matrix), `test/diagnostics.test.ts`, fixture
  `test/fixtures/try/catch.efx` (golden changes), `test/runtime.test.ts` (update the try case)

**Interfaces:**
- `ScopeAnalysis.localTags: ReadonlyMap<string, string>`: module-level class name → `_tag`. It
  covers `error` (custom `_tag` or the name), `schema` classes with `_tag`, ADT variants, and plain
  classes whose superclass is a call with a string-literal first argument on a member named
  `TaggedError`/`TaggedClass` (`Data.TaggedError("T")`, `Schema.TaggedError<X>()("T", …)`).
- `isEffectful(node)` also returns true for a `TryStatement`.

- [ ] **Step 1: Failing tests** (`test/try.test.ts`)

```ts
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const prelude = `
  import { Cause, Data, Effect, Exit } from "effect"
  class A extends Data.TaggedError("A")<{}> {}
  class B extends Data.TaggedError("B")<{}> {}
  class Renamed extends Data.TaggedError("CustomTag")<{}> {}
`

describe("ADR-0010: try/catch contract", () => {
  it("an untyped catch catches a synchronous exception with or without an await", async () => {
    const mod = await runCompiled(`${prelude}
      effect noAwait() {
        try { return JSON.parse("{") as string } catch (e) { return Cause.isUnknownError(e) ? "unknown" : "other" }
      }
      effect withAwait() {
        try {
          JSON.parse("{")
          return await Effect.succeed("unreachable")
        } catch (e) {
          return Cause.isUnknownError(e) && e.cause instanceof SyntaxError ? "unknown" : "other"
        }
      }
      export const results = [Effect.runSync(noAwait()), Effect.runSync(withAwait())]
    `)
    expect(mod.results).toEqual(["unknown", "unknown"])
  })

  it("an untyped catch catches typed failures and Effect.die defects", async () => {
    const mod = await runCompiled(`${prelude}
      effect run(kind: "fail" | "die") {
        try {
          if (kind === "fail") throw new A()
          return await Effect.die("boom")
        } catch (e) {
          return Cause.isUnknownError(e) ? \`die:\${String(e.cause)}\` : e._tag
        }
      }
      export const results = [Effect.runSync(run("fail")), Effect.runSync(run("die"))]
    `)
    expect(mod.results).toEqual(["A", "die:boom"])
  })

  it("interruption is never caught, and finally still runs", async () => {
    const mod = await runCompiled(`${prelude}
      export const log: Array<string> = []
      effect run() {
        try {
          return await Effect.interrupt
        } catch {
          log.push("caught")
          return "caught"
        } finally {
          log.push("finally")
        }
      }
      export const exit = Effect.runSyncExit(run())
      export const interrupted = Exit.hasInterrupts(exit)
    `)
    expect(mod.interrupted).toBe(true)
    expect(mod.log).toEqual(["finally"])
  })

  it("clauses are alternatives: a failure raised in a handler is not caught by a sibling", async () => {
    const mod = await runCompiled(`${prelude}
      effect single() {
        try { throw new A() } catch (e: A) { throw new B() } catch (e: B) { return "B caught" }
      }
      effect withUnion() {
        try { throw new A() } catch (e: A | Renamed) { throw new B() } catch (e: B) { return "B caught" } catch { return "fallback" }
      }
      export const results = [single, withUnion].map((f) => {
        const exit = Effect.runSyncExit(f())
        return Exit.isFailure(exit) ? "propagated" : exit.value
      })
    `)
    expect(mod.results).toEqual(["propagated", "propagated"])
  })

  it("a custom _tag is resolved from the declaration", async () => {
    const mod = await runCompiled(`${prelude}
      error Missing { _tag: "NotThere"; id: string }
      effect run() {
        try { throw new Missing({ id: "x" }) } catch (e: Missing) { return e._tag } catch (e: Renamed) { return "renamed" }
      }
      effect run2() {
        try { throw new Renamed() } catch (e: Renamed) { return e._tag }
      }
      export const results = [Effect.runSync(run()), Effect.runSync(run2())]
    `)
    expect(mod.results).toEqual(["NotThere", "CustomTag"])
  })

  it("catch (e: UnknownError) catches only thrown exceptions", async () => {
    const mod = await runCompiled(`${prelude}
      effect run(kind: "throw" | "fail") {
        try {
          if (kind === "fail") throw new A()
          return JSON.parse("{") as string
        } catch (e: Cause.UnknownError) {
          return "thrown"
        }
      }
      export const thrown = Effect.runSync(run("throw"))
      export const failed = Exit.isFailure(Effect.runSyncExit(run("fail")))
    `)
    expect(mod.thrown).toBe("thrown")
    expect(mod.failed).toBe(true)
  })

  it("a try inside a match arm makes the arm a generator", async () => {
    const mod = await runCompiled(`${prelude}
      effect run(v: "a" | "b") {
        return match (v) {
          when "a": do { try { JSON.parse("{") } catch { "recovered" } }
          default: "b"
        }
      }
      export const results = [Effect.runSync(run("a")), Effect.runSync(run("b"))]
    `)
    expect(mod.results).toEqual(["recovered", "b"])
  })
})
```

In `test/diagnostics.test.ts`, add:

```ts
it("EFX2025: a tag caught by an earlier clause", () => {
  expect(codes("effect f(x: Effect.Effect<number, A>) {\n  try { return await x } catch (e: A) { return 1 } catch (e: A | B) { return 2 }\n}\n"))
    .toEqual(["EFX2025"])
})
```

Remove the EFX2022 test, because the rule is gone.

- [ ] **Step 2: Run** `test/try.test.ts` and `test/diagnostics.test.ts`. Expected: FAIL (a native
  `try` in `noAwait`, chained clauses, no EFX2025).
- [ ] **Step 3: Implement** the lowering table of ADR-0010 in `try.ts`. Outline:
  - Native path (`ctx.effect === undefined`): unchanged (EFX2024 for several clauses).
  - Effect path: the validations EFX2023, EFX2021, EFX2020 stay; EFX2022 is deleted. Add EFX2025
    for a tag already caught by an earlier typed clause.
  - `tagsOf(ctx, clause)`: for each union member that is a `TSTypeReference`, use
    `ctx.analysis.localTags.get(name)` when the type name is an `Identifier` whose nearest binding
    is the module scope; otherwise use the last segment.
  - Names: `E = ref(ctx, "effect", "Effect")`. `C = ref(ctx, "effect", "Cause")` only when defects
    are caught. `fresh(ctx, "defect")` and `fresh(ctx, "error")` for generated parameters.
  - Text: the head replaces `try ` with `[return ]yield* ${E}.gen(…) `. After the try block, `).pipe(`
    plus the optional defect step
    ``${E}.catchDefect((${d}) => ${E}.fail(new ${C}.UnknownError(${d}))), ``, then the dispatch.
    Each clause's `catch (…) ` text (from the previous body's end to this clause's body start) is
    replaced by the opener for that clause, and the closers go after the bodies, following the
    table: `catch` / `catchTag` with `orElse` / `catchTags({ … }, orElse)` / nested `orElse`
    `(${err}) => ${E}.catchTag(${E}.fail(${err}), K, …)`. Typed parameters drop their annotation;
    untyped parameters keep their text. `finally` → `, ${E}.ensuring(${gen}` … `))`.
  - `isEffectful` counts `TryStatement`, so `match` arms and `do` expressions that contain a `try`
    in `effect` code become generators.
  - Update the runtime test "effectful try/catch …" so that `parse` still expects `"bad json"`
    (now through the Effect path).
- [ ] **Step 4: Run** the two test files (PASS), then the whole project. The golden
  `fixtures/try/catch.ts` changes: `plain` becomes an Effect `try` with the `catchDefect` step, and
  `withFallback` gains the `catchDefect` step. Review the diff, then accept it by running vitest
  with `-u` on `test/compile.test.ts` only. `test/typecheck.test.ts` must pass.
- [ ] **Step 5: Commit** `feat(effectscript): stable try/catch contract (ADR-0010)`.

### Task 4: Resource lifetimes (ADR-0011)

**Files:** Modify `src/compiler/transform/resources.ts`. Tests: `test/diagnostics.test.ts`,
`test/runtime.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
// diagnostics.test.ts
it("EFX2013: using … await outside the top level of an effect", () => {
  expect(codes("effect f(r: Effect.Effect<Disposable>) {\n  for (const x of [1]) {\n    using a = await r\n  }\n}\n"))
    .toEqual(["EFX2013"])
  expect(codes("effect f(r: Effect.Effect<Disposable>) {\n  using a = await r\n  return 1\n}\n")).toEqual([])
})
```

```ts
// runtime.test.ts
it("defer with await runs an effectful finalizer; using releases at function exit in reverse order", async () => {
  const mod = await runCompiled(`
    import { Effect } from "effect"
    export const log: Array<string> = []
    const resource = (name: string) =>
      Effect.acquireRelease(Effect.sync(() => { log.push(\`open \${name}\`); return name }), () => Effect.sync(() => { log.push(\`close \${name}\`) }))
    effect run() {
      using a = await resource("a")
      using b = await resource("b")
      defer {
        await Effect.sync(() => log.push("deferred"))
      }
      log.push(\`body \${a}\${b}\`)
      return 1
    }
    export const result = Effect.runSync(run())
  `)
  expect(mod.result).toBe(1)
  expect(mod.log).toEqual(["open a", "open b", "body ab", "deferred", "close b", "close a"])
})
```

- [ ] **Step 2: Run.** Expected: FAIL (no EFX2013; `defer` with `await` emits `yield*` inside
  `Effect.sync`).
- [ ] **Step 3: Implement.**
  - `usingDeclaration`: when `ctx.effect` is set and every declarator is `await`-initialized,
    require `parent === bodyOf(ctx.effect.node)`. Otherwise push EFX2013 ("`using … await` must be
    at the top level of an `effect`", with the ADR-0011 hint). `bodyOf` returns `node.body` for
    `EffectBlock`/`MainStatement`/functions.
  - `deferStatement`: a block argument with `isEffectful(argument)` →
    `` `yield* ${E}.addFinalizer(() => ${E}.gen(function*() ` `` … `}))`, walked with
    `withEffect(ctx, makeFrame(argument, "block"), …)`. Without `await`, keep `Effect.sync`.
- [ ] **Step 4: Run** the files (PASS), then the whole project.
- [ ] **Step 5: Commit** `feat(effectscript): resource lifetimes (ADR-0011)`.

### Task 5: Pipeline evaluation order (ADR-0012)

**Files:** Modify `src/compiler/transform/pipeline.ts`, `src/compiler/analyze/scope.ts`
(`localEffects` only without declaration pipes). Tests: `test/pipeline.test.ts` (new),
`test/review.test.ts` (the C2 expectations that depended on old inlining), and
`test/diagnostics.test.ts`.

- [ ] **Step 1: Failing tests** (`test/pipeline.test.ts`)

```ts
import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("ADR-0012: pipelines evaluate the head first", () => {
  it("a getter on the step runs after the head", async () => {
    const mod = await runCompiled(`
      export const trace: Array<string> = []
      const obj = { get method() { trace.push("getter"); return (x: number) => x + 1 } }
      const makeValue = () => { trace.push("head"); return 1 }
      export const value = makeValue() |> obj.method(%)
    `)
    expect(mod.trace).toEqual(["head", "getter"])
    expect(mod.value).toBe(2)
  })

  it("imported namespace calls are still inlined", () => {
    const { code } = toTypeScript("import { Effect } from \"effect\"\nexport const v = x |> Effect.map(%, f)\n")
    expect(code).toContain("export const v = Effect.map(x, f)")
  })

  it("F# stages follow Effect pipe order: head, make1, make2, apply1, apply2", async () => {
    const mod = await runCompiled(`
      export const trace: Array<string> = []
      const stage = (n: number) => { trace.push(\`make\${n}\`); return (x: number) => { trace.push(\`apply\${n}\`); return x + n } }
      const head = () => { trace.push("head"); return 0 }
      export const value = head() |> stage(1) |> stage(2)
    `)
    expect(mod.trace).toEqual(["head", "make1", "make2", "apply1", "apply2"])
    expect(mod.value).toBe(3)
  })

  it("a call to a local effect declaration with declaration pipes is not assumed pipeable", () => {
    const { code } = toTypeScript("effect f() { return 1 } |> Effect.runSync\nexport const v = f() |> String\n")
    expect(code).toContain("pipe(f(), String)")
  })
})
```

```ts
// diagnostics.test.ts
it("EFX5002: await inside a pipeline step that becomes a function", () => {
  expect(codes("effect f(o: { m(n: number): number }, x: Effect.Effect<number>) {\n  return 1 |> o.m(% + await x)\n}\n"))
    .toEqual(["EFX5002"])
})
```

- [ ] **Step 2: Run.** Expected: FAIL (getter runs first; `.pipe` assumed; no EFX5002).
- [ ] **Step 3: Implement.**
  - Replace `unsafeBefore` with `pureBefore(ctx, rhs, topic)`. Along the path from `rhs` to the
    topic, every child of a path node that ends before the next path node starts must be *pure*: a
    `Literal`, a `TemplateLiteral` without expressions, an `Identifier`, an arrow/function
    expression, or a non-computed `MemberExpression` chain rooted at an `Identifier` that is either
    an import binding at module scope (not shadowed at this site) or a free prelude module name.
  - `inlinable(ctx, step)` = exactly one topic ∧ `pureBefore` ∧ `evaluatedOnce`.
  - Non-inlined Hack steps with an `AwaitExpression` (at that level, inside `effect`) → EFX5002 on
    the `await`.
  - `scope.ts`: add a declaration to `localEffects` only when `(node.efxPipes ?? []).length === 0`.
- [ ] **Step 4: Run** the files (PASS) and the whole project. Update the `review.test.ts` C2 cases
  whose expected text relied on inlining a non-import member call. Keep their syntax checks.
- [ ] **Step 5: Commit** `fix(effectscript): pipelines evaluate the head first (ADR-0012)`.

### Task 6: Exact optional schema fields (ADR-0013)

**Files:** Modify `src/compiler/schema/mapping.ts` (export `optionalField`),
`src/compiler/transform/classLike.ts` (`rewriteField`), `src/compiler/transform/schema.ts`
(ADT). Tests: `test/schema.test.ts` (new), goldens under `fixtures/schema`, `fixtures/error`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("ADR-0013: optional fields", () => {
  it("name?: T rejects an explicit undefined; name?: T | undefined accepts it", async () => {
    const mod = await runCompiled(`
      import { Schema } from "effect"
      schema Exact { email?: string }
      schema Loose { email?: string | undefined }
      const ok = (s: Schema.Top, v: unknown) => Schema.is(s as any)(v)
      export const results = [
        ok(Exact, {}), ok(Exact, { email: undefined }), ok(Exact, { email: "a" }),
        ok(Loose, {}), ok(Loose, { email: undefined })
      ]
    `)
    expect(mod.results).toEqual([true, false, true, true, true])
  })
})
```

(If `Schema.is` doesn't accept the class schema shape directly, use
`Schema.decodeUnknownExit(s)(v)` with `Exit.isSuccess`. Check the workspace `Schema.ts` before
choosing.)

- [ ] **Step 2: Run.** Expected: FAIL (`{ email: undefined }` accepted by `Exact`).
- [ ] **Step 3: Implement** `optionalField(ctx, type)`: for a `TSUnionType` containing
  `TSUndefinedKeyword`, return `${S}.optional(<schema of the remaining members>)`; otherwise
  `${S}.optionalKey(<schema>)`. Use it in `member` (alias type literals), `rewriteField` and ADT
  variant fields.
- [ ] **Step 4: Run**, then update the schema/error goldens (`-u` on `test/compile.test.ts` after
  reviewing the diff: `optional(` → `optionalKey(`). `test/typecheck.test.ts` must pass.
- [ ] **Step 5: Commit** `fix(effectscript): exact optional schema fields (ADR-0013)`.

### Task 7: Module-aware service keys (ADR-0014)

**Files:** Modify `src/compiler/serviceKey.ts`. Test: `test/serviceKey.test.ts` (new).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest"
import { serviceKey } from "effectscript/serviceKey"
import { resolveOptions } from "effectscript/options"

const key = (filename: string, name: string, extra: { packageRoot?: string } = {}) =>
  serviceKey(resolveOptions({ filename, packageName: "app", ...extra }), name)

describe("ADR-0014: service keys", () => {
  it.each([
    ["/w/app/src/a.efx", "Users", "app/a/Users"],
    ["/w/app/src/b.efx", "Users", "app/b/Users"],
    ["/w/app/src/users/Users.efx", "Users", "app/users/Users"],
    ["/w/app/src/users/users.efx", "Users", "app/users/Users"],
    ["/w/app/src/users/index.efx", "Users", "app/users/Users"],
    ["/w/app/src/users/live.efx", "Users", "app/users/live/Users"],
    ["C:\\w\\app\\src\\users\\live.efx", "Users", "app/users/live/Users"]
  ])("%s → %s", (filename, name, expected) => {
    const root = filename.startsWith("C:") ? "C:\\w\\app" : "/w/app"
    expect(key(filename, name, { packageRoot: root })).toBe(expected)
  })

  it("never leaks absolute directories without a packageRoot", () => {
    expect(key("/home/me/proj/src/users/live.efx", "Users")).toBe("app/live/Users")
  })

  it("keeps the bare name without package information", () => {
    expect(serviceKey(resolveOptions({ filename: "/x/a.efx" }), "Users")).toBe("Users")
  })
})
```

(Use the import specifiers that the package's `exports` map provides: `effectscript/*` maps to
`src/*.ts`, so the paths are `effectscript/compiler/serviceKey` and `effectscript/compiler/options`.
Adjust to whatever resolves.)

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per ADR-0014: normalize separators, strip the root (case-sensitive
  prefix), strip `./` and a leading `src/`. Without a root, keep only the base name. Drop the
  module segment when it equals the name (ignoring case) or is `index`.
- [ ] **Step 4: Run** the file and the whole project (service goldens may change; review, then
  update with `-u`).
- [ ] **Step 5: Commit** `fix(effectscript): module-aware service keys (ADR-0014)`.

### Task 8: Token-based lookahead (D06)

**Files:** Modify `src/compiler/parser/scan.ts` (new `skipBalancedTokens`),
`src/compiler/parser/plugin.ts` (use it in `efxIsParenArrowAhead` and `efxIsMatchAhead`). Test:
`test/parser.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
describe("D06: lookahead understands regexes and templates", () => {
  it.each([
    "export const m = (s: string) => match (s.replace(/\\)/g, \"\")) { when \"a\": 1; default: 2 }\n",
    "export const f = effect (s = /[)}]/) => s\n",
    "export const g = effect (s = `${\")\"}`) => s\n"
  ])("%s", (source) => {
    const result = toTypeScript(source)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toMatch(/Match\.value|Effect\.fnUntraced/)
  })
})
```

- [ ] **Step 2: Run.** Expected: FAIL for the regex cases.
- [ ] **Step 3: Implement** `skipBalancedTokens(input, open)`: tokenize `input.slice(open)` with
  `acorn.tokenizer(…, { ecmaVersion: "latest" })` (acorn decides regex versus division and
  handles templates). Track `(`/`[`/`{`/`${` against `)`/`]`/`}`, and return `open + token.end`
  when depth returns to zero. On a tokenizer exception (for example JSX text), fall back to
  `skipBalanced`.
- [ ] **Step 4: Run** the parser tests and the whole project (the superset test must stay green).
- [ ] **Step 5: Commit** `fix(effectscript): token-based lookahead for match and effect arrows`.

### Task 9: Role-aware editor mappings (D10)

**Files:** Modify `src/compiler/mappings.ts`. Test: `test/mappings.test.ts`.

**Interfaces:** export `generatedFeatures: CodeInformation` = verification only.

- [ ] **Step 1: Failing test**

```ts
it("D10: rewritten keywords get diagnostics only; user identifiers keep navigation", () => {
  const source = "export effect f(x: number) {\n  return await g(x)\n}\n"
  const { mappings } = toTypeScript(source)
  const covering = (offset: number) =>
    mappings.find((m) => m.sourceOffsets[0]! <= offset && offset < m.sourceOffsets[0]! + m.lengths[0]!)
  const keyword = covering(source.indexOf("effect"))!
  expect(keyword.data.navigation).toBe(false)
  expect(keyword.data.completion).toBe(false)
  expect(keyword.data.verification).toBe(true)
  const identifier = covering(source.indexOf("x: number"))!
  expect(identifier.data.navigation).toBe(true)
  expect(identifier.data.semantic).toBe(true)
})
```

- [ ] **Step 2: Run.** Expected: FAIL (full features everywhere).
- [ ] **Step 3: Implement.** In `toCodeMappings`, an isolated segment whose source slice equals its
  generated slice keeps `fullFeatures`. Any other isolated segment (edited or generated text) gets
  `generatedFeatures` (`verification: true`, everything else `false`). Runs stay `fullFeatures`.
- [ ] **Step 4: Run** the mappings tests and the whole project.
- [ ] **Step 5: Commit** `feat(effectscript): role-aware editor mappings`.

### Task 10: Diagnostics policy and version (ADR-0017, ADR-0015)

**Files:** Modify `src/compiler/options.ts` (the `CompileResult.diagnostics` doc comment),
`test/utils/run.ts` (fail only on errors), `test/transform.test.ts` (`ts()` helper: errors only),
`package.json` (`"version": "4.0.0-alpha.0"`), `README.md` (version and status wording, linking
`docs/adr`).

- [ ] **Step 1: Failing test** (`test/smoke.test.ts`)

```ts
it("is versioned in lockstep with Effect (ADR-0015)", async () => {
  const pkg = await import("../package.json", { with: { type: "json" } })
  expect(pkg.default.version).toMatch(/^4\.0\.0-alpha\.\d+$/)
})
```

- [ ] **Step 2: Run.** Expected: FAIL (`0.1.0`).
- [ ] **Step 3: Implement** the version bump, the doc comment ("success = no diagnostic with
  severity `error`"), the helper changes, and the README update.
- [ ] **Step 4: Run** the whole project, `pnpm check` and `pnpm lint` from the root.
- [ ] **Step 5: Commit** `chore(effectscript): diagnostics policy and 4.0.0-alpha.0 version`.

---

## Final review

After Task 10, run a whole-branch review from the Plan 2 base commit on the most capable model,
with this plan, the ADRs and the review document as context. Fix Critical/Important findings in
one pass (each with a failing test first). Record minors as deferred. Record any decision a fix
makes as an ADR.

## Final review outcome (2026-10-02)

A fresh reviewer (Opus) found five Important and four Minor issues. The fix pass covered:

- **F1:** EFX5002 now covers every step that lowers to `yield*` (`throw`, effectful `do`/`match`, …).
- **F2:** an inlined step that starts with the topic can be wrapped by a later group.
- **F3:** a parenthesized inner pipeline stays the head.
- **F4:** declaration names, match bindings and catch parameters stay user text. A user-text prefix
  of an edited chunk keeps full editor features.
- **F5:** multi-dot module names (`Users.live.efx`) keep their full stem in service keys.
- **F8:** a nested `try` that returns on every path is no longer EFX2020. The reviewer rated this
  Minor; it was raised to Important because it blocks valid code.

Each fix has a test in `test/review.test.ts` or `test/serviceKey.test.ts`.

Deferred minors:

- `packageRoot` set to `/`, `""` or a bare drive root, `file://` filenames, and drive-letter case
  mismatches can still leak or drop directories in service keys.
- An inlined Hack step reads identifiers before a head that assigns them
  (`(x = 5) |> x + %`). This is an ADR-0012 gap; a fix needs a follow-up ADR.
- Unsupported forms emit invalid TS without an EFX diagnostic: `var` inside a `try` in `effect` code
  (hoisting crosses the generated generator), `defer await e`, and `for await` with a non-block
  body. `tsc` still reports each of them.
