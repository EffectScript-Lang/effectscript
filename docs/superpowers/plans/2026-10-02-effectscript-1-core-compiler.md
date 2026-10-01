# EffectScript Plan 1: Core Compiler (Language Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `effectscript` package's compiler. It turns `.efx` source using the language-core
constructs (spec §3, §4.1–4.13) into idiomatic, type-checked Effect v4 TypeScript, with source maps
and Volar mappings.

**Architecture:** acorn + `@sveltejs/acorn-typescript` + our `efxPlugin` parse `.efx` into an
ESTree+TS AST, keeping original offsets. TS mode is tried first, with a JSX fallback. A scope
analysis pass records bindings. A single walker dispatches per-construct handlers. Each handler
edits the original text through `magic-string`, using only keyword replacements, boundary
insertions, and node moves, so formatting and comments survive. The output is `.ts`/`.tsx` text,
a SourceMap v3, Volar-compatible `CodeMapping[]`, and diagnostics.

**Tech Stack:** TypeScript 6 (erasable syntax only, `.ts` import extensions), acorn 8.18,
@sveltejs/acorn-typescript 1.0.13, magic-string 1.4.2, vitest 5 (monorepo root config), the
TypeScript compiler API (typecheck tests), and `effect` from the workspace (`packages/effect`).

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md`

**Plan series:** This is plan 1 of 7. The next plans are written after this one ships, so they
can build on its real APIs:

2. Libraries, magic, and strict mode (§4.14–4.17)
3. Reverse compiler (§6)
4. CLI and integrations
5. Language tooling and VS Code
6. AI skill
7. Site and release

## Global Constraints

- Work on branch `effectscript`. All new code lives in `packages/effectscript/core`. The npm name
  is `effectscript`.
- Source extension is `.efx` only. The parse mode is TS first, then JSX (JSX first if the source
  contains `</` or `/>`). Output flavor is `.ts` or `.tsx`, matching the mode.
- Superset: valid `.ts` and `.tsx` must compile to themselves byte-for-byte. The one exception is
  prelude imports for free identifiers.
- Output is idiomatic Effect v4 in the `LLMS.md` style, with no runtime helpers. Generated names
  are always qualified (`Effect.fn`, `Effect.fail`, …) and imported automatically.
- The compiler core (`src/compiler/**`) must not import `node:*` modules, so it stays
  browser-safe. Dependencies are limited to `acorn`, `@sveltejs/acorn-typescript`, and
  `magic-string`.
- Code style (monorepo):
  - `.ts` import extensions, `import { type X }` inline type imports.
  - `Array<T>`, not `T[]`. No `console` in `src`.
  - dprint formatting: 2 spaces, 120 columns, no semicolons, double quotes, no trailing commas,
    arrow parameters always parenthesized.
  - `erasableSyntaxOnly`: no enums, namespaces, or parameter properties.
- Validation commands, from the repo root (never bare `pnpm test`):
  - `pnpm vitest run --project effectscript <files>`
  - `pnpm check`
  - `pnpm lint`
- magic-string rules for every handler:
  - Replace keywords with `s.update(start, end, text)`, which is content-only.
  - Insert opening text at a node start with `s.appendRight(start, text)` *before* visiting
    children.
  - Insert closing text at a node end with `s.prependLeft(end, text)`. Closers may be added after
    the children are visited only if no inner node ends at the same offset.
  - Never `update` a range that contains another edit point.
- Diagnostic codes follow spec §12: EFX1xxx parse, EFX2xxx effect, EFX3xxx schema, EFX4xxx
  service, EFX5xxx pipe, EFX6xxx main, EFX7xxx proposals.

## Review Focus

These failure modes are likely to bite real users, and each line names the test that pins it:

1. **Contextual keywords used as identifiers.** `const effect = 1; effect + 1`, `function match(a)
   {}`, `schema.parse(x)`, and `main()` must stay plain TS. Pinned by
   `test/parser.test.ts` › "contextual words remain identifiers" (Task 4).
2. **`await` precedence.** `await a + b`, `!await x`, `await x as T`, and `(await x).y` must
   become `(yield* a) + b`, `!(yield* x)`, `(yield* x) as T`, and `(yield* x).y`, with no doubled
   parentheses. Pinned by fixture `effect/await-precedence.efx` (Task 5).
3. **Nested-function boundaries.** `await`/`throw` inside a plain callback inside `effect` keep
   their JS meaning, and an `effect` arrow inside a plain function is still an effect. Pinned by
   fixture `effect/boundaries.efx` (Task 5) and `test/transform.test.ts` › "effect arrows inside
   plain functions are still effects" (Task 6).
4. **Real-world TS that is not EffectScript.** Large `packages/effect/src` files must round-trip
   byte-for-byte. Pinned by `test/superset.test.ts` (Task 3).
5. **Multi-line constructs with comments.** Comments between `effect` and the name, before `|>`,
   and inside schema bodies must be preserved. Pinned by fixture `effect/comments.efx` (Task 5)
   and `schema/comments.efx` (Task 12).

---

## File Structure

```
packages/effectscript/core/
  package.json                     npm "effectscript"
  tsconfig.json                    extends tsconfig.base.json
  README.md                        (Task 17)
  scripts/generate-prelude.ts      builds src/compiler/prelude/tables.ts from packages/effect (Task 11)
  src/
    index.ts                       public entry: re-exports compiler API
    compiler/
      index.ts                     toTypeScript, parse, types
      ast.ts                       Node type, isNode, children(), helpers (skipSpace, containsThis…)
      diagnostics.ts               Diagnostic type, constructors, formatDiagnostic, lineColumn
      options.ts                   CompileOptions, ResolvedOptions, CompileResult, resolveOptions
      context.ts                   Ctx, EffectFrame, Handler types, makeContext, withEffect
      walk.ts                      walk / walkChildren with scope + effect-boundary tracking
      imports.ts                   ImportSet: need(module, name), emit()
      mappings.ts                  magic-string decoded map → Volar CodeMapping[]
      compile.ts                   toTypeScript pipeline
      parser/
        scan.ts                    skipBalanced / skipSpace (character scanners)
        plugin.ts                  efxPlugin (all syntax extensions)
        parse.ts                   mode selection + error → Diagnostic
      analyze/
        scope.ts                   scope tree, isValueFree, isTypeFree, constInits, localErrors
      prelude/
        tables.ts                  GENERATED: module/builtin/bare-type/service-tag/global tables
        resolve.ts                 builtin + prelude resolution helpers
      schema/
        mapping.ts                 TS type node → Schema expression text
      transform/
        index.ts                   handler registry
        returnType.ts              throws/needs → Effect.fn.Return / Effect.Effect
        effect.ts                  effect declarations, blocks, arrows, methods
        await.ts                   await / concurrency / throw statements & expressions
        try.ts                     effectful try/catch/finally
        resources.ts               defer, using, for await
        proposals.ts               throw expressions (outside effect), do expressions
        pipeline.ts                |> (F# + Hack)
        prelude.ts                 builtins, prelude identifiers, bare types
        schema.ts                  schema class / alias / ADT
        error.ts                   error declarations
        service.ts                 service + layer members + accessors
        main.ts                    main blocks
        match.ts                   match expressions
  test/
    utils/fixtures.ts              fixture discovery + compile helper
    utils/typecheck.ts             in-memory TS program against workspace effect
    utils/run.ts                   import compiled output at runtime (vitest)
    smoke.test.ts
    parser.test.ts
    compile.test.ts                golden fixtures (*.efx → *.ts/.tsx)
    typecheck.test.ts              all golden outputs type-check
    runtime.test.ts                behavior of compiled fixtures
    superset.test.ts               packages/effect/src identity
    mappings.test.ts
    diagnostics.test.ts
    fixtures/<area>/<case>.efx + <case>.ts
```

Root files modified: `pnpm-workspace.yaml`, `tsconfig.packages.json`, `tsconfig.tests.json`,
`vitest.config.ts`, `dprint.json`, `.oxlintrc.json`, `deno.json`, `pnpm-lock.yaml`.

---

### Task 1: Package scaffold and monorepo registration

**Files:**
- Create: `packages/effectscript/core/package.json`, `packages/effectscript/core/tsconfig.json`,
  `packages/effectscript/core/src/index.ts`, `packages/effectscript/core/src/compiler/index.ts`
- Modify: `pnpm-workspace.yaml`, `tsconfig.packages.json`, `tsconfig.tests.json`,
  `vitest.config.ts`, `dprint.json`, `.oxlintrc.json`, `deno.json`
- Test: `packages/effectscript/core/test/smoke.test.ts`

**Interfaces:**
- Produces: package `effectscript` with export `"."` → `src/index.ts` and `"./compiler"` →
  `src/compiler/index.ts`. A temporary `toTypeScript(source: string): { code: string }` (identity);
  Task 3 replaces it.

- [ ] **Step 1: Create the manifest**

`packages/effectscript/core/package.json`:

```json
{
  "name": "effectscript",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "description": "EffectScript: TypeScript with Effect as native syntax",
  "homepage": "https://github.com/gunta/effect-lang/tree/effectscript/packages/effectscript/core",
  "repository": {
    "type": "git",
    "url": "https://github.com/gunta/effect-lang.git",
    "directory": "packages/effectscript/core"
  },
  "sideEffects": [],
  "exports": {
    "./package.json": "./package.json",
    ".": "./src/index.ts",
    "./compiler": "./src/compiler/index.ts"
  },
  "files": [
    "src/**/*.ts",
    "dist/**/*.js",
    "dist/**/*.js.map",
    "dist/**/*.d.ts",
    "dist/**/*.d.ts.map"
  ],
  "publishConfig": {
    "access": "public",
    "exports": {
      "./package.json": "./package.json",
      ".": "./dist/index.js",
      "./compiler": "./dist/compiler/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b tsconfig.json",
    "check": "tsc -b tsconfig.json"
  },
  "dependencies": {
    "@sveltejs/acorn-typescript": "^1.0.13",
    "acorn": "^8.18.0",
    "magic-string": "^1.4.2"
  },
  "devDependencies": {
    "@effect/platform-node": "workspace:^",
    "@effect/vitest": "workspace:^",
    "@types/node": "^26.6.3",
    "effect": "workspace:^",
    "typescript": "^6.0.3",
    "vitest": "^5.0.2"
  }
}
```

`packages/effectscript/core/tsconfig.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../../tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": {
    "types": ["node"]
  }
}
```

- [ ] **Step 2: Write the failing smoke test**

`packages/effectscript/core/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { toTypeScript } from "../src/compiler/index.ts"

describe("smoke", () => {
  it("returns plain TypeScript unchanged", () => {
    const source = "const answer: number = 42\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
```

- [ ] **Step 3: Register the package in the monorepo**

`pnpm-workspace.yaml`: under `packages:`, add a line after `  - packages/atom/*`:

```yaml
  - packages/effectscript/*
```

`tsconfig.packages.json`: add `{ "path": "packages/effectscript/core" },` after the
`packages/atom/solid` entry.

`tsconfig.tests.json`: extend `exclude`:

```json
"exclude": ["**/node_modules/**", "**/dist/**", "./packages/platform/deno/**", "./packages/effectscript/**/fixtures/**"],
```

`vitest.config.ts`: add after the `@effect/atom-vue` project:

```ts
      ...project("effectscript", "packages/effectscript/core"),
```

`dprint.json`: add `"packages/effectscript/**/fixtures",` to `excludes` (after `"**/coverage",`).

`.oxlintrc.json`: add `"packages/effectscript/**/fixtures/**",` to `ignorePatterns` (after
`"**/docs",`).

`deno.json`: add `"packages/effectscript",` to `exclude` (after `"packages/atom",`).

- [ ] **Step 4: Write the minimal implementation**

`packages/effectscript/core/src/compiler/index.ts`:

```ts
/**
 * EffectScript compiler: `.efx` → idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 */

/**
 * @since 0.1.0
 * @category compiler
 */
export const toTypeScript = (source: string): { readonly code: string } => ({ code: source })
```

`packages/effectscript/core/src/index.ts`:

```ts
/**
 * @since 0.1.0
 */
export * from "./compiler/index.ts"
```

- [ ] **Step 5: Install and run the test**

Run: `pnpm install`
Expected: the lockfile gains an importer `packages/effectscript/core`, and there are no errors.

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/smoke.test.ts`
Expected: PASS (1 test).

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml tsconfig.packages.json tsconfig.tests.json vitest.config.ts dprint.json .oxlintrc.json deno.json packages/effectscript/core
git commit -m "feat(effectscript): scaffold effectscript package"
```

---

### Task 2: Diagnostics and the parser (mode selection, `|>` token)

**Files:**
- Create: `src/compiler/diagnostics.ts`, `src/compiler/ast.ts`, `src/compiler/parser/scan.ts`,
  `src/compiler/parser/plugin.ts`, `src/compiler/parser/parse.ts`
- Test: `test/parser.test.ts`

(All paths in this plan are relative to `packages/effectscript/core/` unless they start at the
repo root.)

**Interfaces:**
- Produces:
  - `interface Node { type: string; start: number; end: number; [key: string]: any }`
  - `isNode(value: unknown): value is Node`
  - `children(node: Node): Array<Node>`
  - `interface Diagnostic { code; message; start; end; severity: "error" | "warning"; hint?: string | undefined }`
  - `diagnosticError(code, message, start, end, hint?)` and `diagnosticWarning(...)`
  - `lineColumn(source, offset): { line: number; column: number }` (1-based line, 0-based column)
  - `formatDiagnostic(source, filename, d): string`
  - `type Mode = "ts" | "tsx"`
  - `parse(source, options?: { mode?: Mode }): ParseResult`, where `ParseResult` is either
    `{ _tag: "Success"; program: Node; mode: Mode }` or
    `{ _tag: "Failure"; diagnostics: ReadonlyArray<Diagnostic> }`
  - `efxPlugin` and `pipelineToken`, from `parser/plugin.ts`
  - `skipBalanced(input, openIndex): number` and `skipSpace(input, index): number`, from
    `parser/scan.ts`

- [ ] **Step 1: Write the failing parser tests**

`test/parser.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parse } from "../src/compiler/parser/parse.ts"

const ok = (source: string) => {
  const result = parse(source)
  if (result._tag === "Failure") throw new Error(result.diagnostics.map((d) => d.message).join("\n"))
  return result
}

describe("parse modes", () => {
  it("parses plain TypeScript in ts mode", () => {
    expect(ok("const id = <T>(x: T) => x\nconst n = <number>1\n").mode).toBe("ts")
  })

  it("parses JSX in tsx mode", () => {
    expect(ok("const el = <div className=\"a\">{1}</div>\n").mode).toBe("tsx")
  })

  it("falls back to ts when a JSX-looking file is TypeScript", () => {
    expect(ok("// closing tag text: </div>\nconst id = <T>(x: T) => x\n").mode).toBe("ts")
  })

  it("reports the furthest error as an EFX1001 diagnostic", () => {
    const result = parse("const a = 1\nconst = 2\n")
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.diagnostics[0]!.code).toBe("EFX1001")
      expect(result.diagnostics[0]!.start).toBe(18)
    }
  })
})

describe("pipeline token", () => {
  it("parses |> as a left-associative PipelineExpression", () => {
    const { program } = ok("const z = a |> f |> g(1)\n")
    const init = program.body[0].declarations[0].init
    expect(init.type).toBe("PipelineExpression")
    expect(init.left.type).toBe("PipelineExpression")
    expect(init.right.type).toBe("CallExpression")
  })

  it("binds looser than ?? and tighter than the conditional", () => {
    const { program } = ok("const z = a ?? b |> f\nconst y = c ? d : e |> f\n")
    expect(program.body[0].declarations[0].init.left.type).toBe("LogicalExpression")
    expect(program.body[1].declarations[0].init.type).toBe("ConditionalExpression")
  })

  it("does not tokenize |> inside types", () => {
    expect(ok("type A = Array<string | number>\n").mode).toBe("ts")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/parser.test.ts`
Expected: FAIL (`Cannot find module '../src/compiler/parser/parse.ts'`).

- [ ] **Step 3: Implement diagnostics and AST helpers**

`src/compiler/diagnostics.ts`:

```ts
/**
 * @since 0.1.0
 */

/**
 * @since 0.1.0
 * @category models
 */
export type Severity = "error" | "warning"

/**
 * @since 0.1.0
 * @category models
 */
export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly start: number
  readonly end: number
  readonly severity: Severity
  readonly hint?: string | undefined
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const diagnosticError = (
  code: string,
  message: string,
  start: number,
  end: number,
  hint?: string
): Diagnostic => ({ code, message, start, end, severity: "error", hint })

/**
 * @since 0.1.0
 * @category constructors
 */
export const diagnosticWarning = (
  code: string,
  message: string,
  start: number,
  end: number,
  hint?: string
): Diagnostic => ({ code, message, start, end, severity: "warning", hint })

/**
 * 1-based line, 0-based column.
 *
 * @since 0.1.0
 * @category utils
 */
export const lineColumn = (source: string, offset: number): { readonly line: number; readonly column: number } => {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: offset - lineStart }
}

/**
 * @since 0.1.0
 * @category utils
 */
export const formatDiagnostic = (source: string, filename: string, diagnostic: Diagnostic): string => {
  const { column, line } = lineColumn(source, diagnostic.start)
  const text = source.split("\n")[line - 1] ?? ""
  const width = Math.max(1, Math.min(diagnostic.end - diagnostic.start, text.length - column))
  const gutter = " ".repeat(String(line).length)
  const hint = diagnostic.hint === undefined ? "" : `\n\nhint: ${diagnostic.hint}`
  return `${filename}:${line}:${column + 1} - ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}\n\n` +
    `${line} | ${text}\n${gutter} | ${" ".repeat(column)}${"^".repeat(width)}${hint}`
}
```

`src/compiler/ast.ts`:

```ts
/**
 * @since 0.1.0
 */

/**
 * A loosely typed ESTree/TS-ESTree node as produced by acorn + acorn-typescript + efxPlugin.
 *
 * @since 0.1.0
 * @category models
 */
export interface Node {
  type: string
  start: number
  end: number
  [key: string]: any
}

/**
 * @since 0.1.0
 * @category guards
 */
export const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string" &&
  typeof (value as Node).start === "number"

const skipKeys = new Set(["type", "start", "end", "loc", "range", "raw", "efx"])

/**
 * Child nodes in source order.
 *
 * @since 0.1.0
 * @category utils
 */
export const children = (node: Node): Array<Node> => {
  const result: Array<Node> = []
  for (const key in node) {
    if (skipKeys.has(key)) continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) result.push(item)
    } else if (isNode(value)) {
      result.push(value)
    }
  }
  return result.sort((a, b) => a.start - b.start)
}

const functionBoundaries = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "ClassDeclaration",
  "ClassExpression"
])

/**
 * Whether `this` appears in `node`, looking through arrow functions but not through
 * `function`s or classes (which rebind `this`).
 *
 * @since 0.1.0
 * @category utils
 */
export const containsThis = (node: Node): boolean => {
  if (node.type === "ThisExpression") return true
  if (functionBoundaries.has(node.type)) return false
  return children(node).some(containsThis)
}
```

- [ ] **Step 4: Implement the character scanners**

`src/compiler/parser/scan.ts`:

```ts
/**
 * Character-level scanners used for parser lookahead decisions.
 *
 * @since 0.1.0
 */

const closer: Record<string, string> = { "(": ")", "[": "]", "{": "}" }

/**
 * Returns the index just past the bracket matching `input[open]`, or -1.
 * Skips strings, template literals (with nested `${}`), and comments.
 *
 * @since 0.1.0
 */
export const skipBalanced = (input: string, open: number): number => {
  const stack: Array<string> = []
  let i = open
  while (i < input.length) {
    const ch = input[i]!
    if (ch === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i)
      i = nl === -1 ? input.length : nl
      continue
    }
    if (ch === "/" && input[i + 1] === "*") {
      const close = input.indexOf("*/", i + 2)
      i = close === -1 ? input.length : close + 2
      continue
    }
    if (ch === "\"" || ch === "'") {
      i = skipString(input, i, ch)
      continue
    }
    if (ch === "`") {
      i = skipTemplate(input, i)
      continue
    }
    const close = closer[ch]
    if (close !== undefined) {
      stack.push(close)
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1
      if (stack.length === 0) return i + 1
    }
    i++
  }
  return -1
}

const skipString = (input: string, start: number, quote: string): number => {
  let i = start + 1
  while (i < input.length && input[i] !== quote) {
    if (input[i] === "\\") i++
    i++
  }
  return i + 1
}

const skipTemplate = (input: string, start: number): number => {
  let i = start + 1
  while (i < input.length && input[i] !== "`") {
    if (input[i] === "\\") {
      i += 2
      continue
    }
    if (input[i] === "$" && input[i + 1] === "{") {
      const end = skipBalanced(input, i + 1)
      if (end === -1) return input.length
      i = end
      continue
    }
    i++
  }
  return i + 1
}

/**
 * Returns the index of the next character that is not whitespace or part of a comment.
 *
 * @since 0.1.0
 */
export const skipSpace = (input: string, index: number): number => {
  let i = index
  while (i < input.length) {
    const ch = input[i]!
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++
    } else if (ch === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i)
      i = nl === -1 ? input.length : nl
    } else if (ch === "/" && input[i + 1] === "*") {
      const close = input.indexOf("*/", i + 2)
      i = close === -1 ? input.length : close + 2
    } else {
      break
    }
  }
  return i
}
```

- [ ] **Step 5: Implement the plugin skeleton (pipeline only) and `parse`**

`src/compiler/parser/plugin.ts`:

```ts
/**
 * The EffectScript acorn plugin. It extends `@sveltejs/acorn-typescript`'s parser.
 *
 * acorn's parser internals are untyped, so this module works with `any`-typed parser instances.
 *
 * @since 0.1.0
 */
import * as acorn from "acorn"

const tt = acorn.tokTypes

/**
 * The `|>` token. acorn treats `binop: 0` as "not an operator", so 0.5 sits below `??`/`||` (1).
 *
 * @since 0.1.0
 */
export const pipelineToken = new acorn.TokenType("|>", { beforeExpr: true, binop: 0.5 })

const lineBreak = /[\n\r\u2028\u2029]/

interface EfxState {
  pipeDepth: number
  readonly arrowStarts: Set<number>
}

/**
 * @since 0.1.0
 */
export const efxPlugin = (Base: any): any =>
  class EfxParser extends Base {
    efxState(): EfxState {
      return (this.efx ??= { pipeDepth: 0, arrowStarts: new Set<number>() })
    }

    // --- token helpers ---------------------------------------------------------------------------

    efxIsWord(word: string): boolean {
      return this.type === tt.name && this.value === word && !this.containsEsc
    }

    efxSameLine(next: { readonly start: number }): boolean {
      return !lineBreak.test(this.input.slice(this.end, next.start))
    }

    // --- tokenizer -------------------------------------------------------------------------------

    readToken_pipe_amp(code: number) {
      if (code === 124 && !this.inType && this.input.charCodeAt(this.pos + 1) === 62) {
        return this.finishOp(pipelineToken, 2)
      }
      return super.readToken_pipe_amp(code)
    }

    // --- pipeline --------------------------------------------------------------------------------

    parseExprOp(left: any, leftStartPos: number, leftStartLoc: any, minPrec: number, forInit: boolean) {
      if (this.type === pipelineToken && (pipelineToken.binop as number) > minPrec) {
        const op = { start: this.start, end: this.end }
        this.next()
        const state = this.efxState()
        state.pipeDepth++
        const rightStart = this.start
        const rightStartLoc = this.startLoc
        const right = this.parseExprOp(
          this.parseMaybeUnary(null, false, false, forInit),
          rightStart,
          rightStartLoc,
          pipelineToken.binop,
          forInit
        )
        state.pipeDepth--
        const node = this.startNodeAt(leftStartPos, leftStartLoc)
        node.left = left
        node.right = right
        node.op = op
        this.finishNode(node, "PipelineExpression")
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit)
      }
      return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit)
    }
  }
```

`src/compiler/parser/parse.ts`:

```ts
/**
 * @since 0.1.0
 */
import { tsPlugin } from "@sveltejs/acorn-typescript"
import * as acorn from "acorn"
import type { Node } from "../ast.ts"
import { type Diagnostic, diagnosticError } from "../diagnostics.ts"
import { efxPlugin } from "./plugin.ts"

/**
 * @since 0.1.0
 * @category models
 */
export type Mode = "ts" | "tsx"

/**
 * @since 0.1.0
 * @category models
 */
export type ParseResult =
  | { readonly _tag: "Success"; readonly program: Node; readonly mode: Mode }
  | { readonly _tag: "Failure"; readonly diagnostics: ReadonlyArray<Diagnostic> }

const parsers: Record<Mode, typeof acorn.Parser> = {
  ts: acorn.Parser.extend(tsPlugin() as any, efxPlugin),
  tsx: acorn.Parser.extend(tsPlugin({ jsx: true }) as any, efxPlugin)
}

const looksLikeJsx = (source: string): boolean => source.includes("</") || source.includes("/>")

const parseWith = (mode: Mode, source: string): Node =>
  parsers[mode].parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    allowHashBang: true
  }) as unknown as Node

interface ParseError {
  readonly pos: number
  readonly message: string
}

const toParseError = (error: unknown): ParseError => {
  const e = error as { pos?: unknown; message?: unknown }
  const message = typeof e.message === "string" ? e.message.replace(/ \(\d+:\d+\)$/, "") : String(error)
  return { pos: typeof e.pos === "number" ? e.pos : 0, message }
}

/**
 * Parses EffectScript in TS mode, then JSX mode (JSX first when the source looks like JSX).
 *
 * @since 0.1.0
 * @category parsing
 */
export const parse = (source: string, options: { readonly mode?: Mode | undefined } = {}): ParseResult => {
  const order: ReadonlyArray<Mode> = options.mode !== undefined
    ? [options.mode]
    : looksLikeJsx(source)
    ? ["tsx", "ts"]
    : ["ts", "tsx"]
  let furthest: ParseError | undefined
  for (const mode of order) {
    try {
      return { _tag: "Success", program: parseWith(mode, source), mode }
    } catch (error) {
      const parsed = toParseError(error)
      if (furthest === undefined || parsed.pos > furthest.pos) furthest = parsed
    }
  }
  const pos = furthest?.pos ?? 0
  return {
    _tag: "Failure",
    diagnostics: [diagnosticError("EFX1001", furthest?.message ?? "Syntax error", pos, Math.min(pos + 1, source.length))]
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/parser.test.ts`
Expected: PASS (7 tests). If "reports the furthest error" fails on the offset, print
`result.diagnostics[0]` and fix the expected offset to where acorn reports `const = 2`. That is the
`=` at offset 18 (`"const a = 1\n"` is 12 characters, `"const "` is 6 more). Do not change the
parser to satisfy this test.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): parser with TS/JSX mode selection and |> token"
```

---

### Task 3: Compiler pipeline (scope analysis, walker, imports, mappings, `toTypeScript`)

**Files:**
- Create: `src/compiler/options.ts`, `src/compiler/context.ts`, `src/compiler/walk.ts`,
  `src/compiler/imports.ts`, `src/compiler/mappings.ts`, `src/compiler/compile.ts`,
  `src/compiler/analyze/scope.ts`, `src/compiler/transform/index.ts`
- Modify: `src/compiler/index.ts` (replace stub), `src/compiler/parser/plugin.ts` (two
  acorn-typescript fixes)
- Test: `test/superset.test.ts`, `test/mappings.test.ts`, `test/imports.test.ts`;
  `test/smoke.test.ts` stays as is

**Interfaces:**
- Consumes: `parse`, `Node`, `children`, and `Diagnostic` from Task 2.
- Produces:
  - `type Runtime = "node" | "bun" | "deno" | "browser"`
  - `interface CompileOptions { filename?; packageName?; packageRoot?; runtime?; prelude?; rewriteImportExtensions?; sourceMap? }`
    (all fields `T | undefined`)
  - `interface ResolvedOptions` (the same fields, required)
  - `resolveOptions(options): ResolvedOptions`
  - `interface CodeMapping { sourceOffsets; generatedOffsets; lengths; generatedLengths?; data: CodeInformation }`
  - `interface CompileResult { code; mode; map: SourceMapV3 | undefined; mappings; diagnostics }`
  - `toTypeScript(source, options?): CompileResult`
  - `type Handler = (node: Node, parent: Node | undefined, ctx: Ctx) => boolean | void`, where
    returning `true` means the handler visited the children itself
  - `interface EffectFrame { node; kind: "declaration" | "arrow" | "method" | "block" | "main"; scoped: boolean; layerConstructor: boolean }`
  - `interface Ctx { source; s: MagicString; options; analysis; diagnostics; imports; handlers; scope: Scope; effect: EffectFrame | undefined; service: string | undefined; namespace: string }`
  - `makeFrame(node, kind, layerConstructor?)`, `withEffect(ctx, frame, f)`, and
    `withNamespace(ctx, namespace, f)`
  - `walk(node, parent, ctx)` and `walkChildren(node, ctx, skip?: ReadonlySet<Node>)`
  - `interface ImportSet { need(module: string, name: string): void; readonly entries: ReadonlyMap<string, ReadonlySet<string>> }`
    and `makeImportSet()`
  - `emitImports(ctx)`, which adds only names that were needed *and* are not already bound at
    module scope, merging into an existing named import from the same module
  - `interface Scope { parent; kind: "module" | "function" | "block"; values: Set<string>; types: Set<string> }`
  - `interface ScopeAnalysis { program: Node; module: Scope; scopeOf: Map<Node, Scope>; constInits: Map<string, Node>; localErrors: Set<string> }`
  - `analyze(program): ScopeAnalysis`, `isValueFree(scope, name)`, `isTypeFree(scope, name)`, and
    `patternNames(pattern): Array<string>`
  - `toCodeMappings(s, source, code): Array<CodeMapping>`
  - `handlers: ReadonlyMap<string, ReadonlyArray<Handler>>` and `registry(...groups)`, from
    `transform/index.ts`

- [ ] **Step 1: Write the failing tests**

`test/superset.test.ts`:

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { toTypeScript } from "../src/compiler/index.ts"

const root = path.resolve(import.meta.dirname, "../../../..")
const sources = ["packages/effect/src", "packages/platform/node/src", "packages/vitest/src", "packages/atom/react/src"]

describe("superset", () => {
  it("compiles real TypeScript to itself byte-for-byte", () => {
    const failures: Array<string> = []
    let count = 0
    for (const dir of sources) {
      const absolute = path.join(root, dir)
      for (const file of fs.readdirSync(absolute, { recursive: true, encoding: "utf8" })) {
        if (!/\.tsx?$/.test(file)) continue
        count++
        const source = fs.readFileSync(path.join(absolute, file), "utf8")
        const result = toTypeScript(source, { filename: file })
        if (result.diagnostics.length > 0) failures.push(`${dir}/${file}: ${result.diagnostics[0]!.message}`)
        else if (result.code !== source) failures.push(`${dir}/${file}: output differs`)
      }
    }
    expect(count).toBeGreaterThan(500)
    expect(failures).toEqual([])
  }, 120_000)
})
```

`test/mappings.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { toTypeScript } from "../src/compiler/index.ts"

describe("mappings", () => {
  it("maps an unchanged file with a single identity mapping", () => {
    const source = "export const a = 1\n"
    const result = toTypeScript(source)
    expect(result.mappings).toEqual([{
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [source.length],
      data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: false }
    }])
    expect(result.map?.sources).toEqual(["input.efx"])
  })
})
```

`test/imports.test.ts`:

```ts
import MagicString from "magic-string"
import { describe, expect, it } from "vitest"
import { analyze } from "../src/compiler/analyze/scope.ts"
import { emitImports, makeImportSet } from "../src/compiler/imports.ts"
import { parse } from "../src/compiler/parser/parse.ts"

const run = (source: string, needs: ReadonlyArray<readonly [string, string]>): string => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") throw new Error("parse failed")
  const s = new MagicString(source)
  const imports = makeImportSet()
  for (const [module, name] of needs) imports.need(module, name)
  emitImports({ source, s, imports, analysis: analyze(parsed.program) })
  return s.toString()
}

describe("imports", () => {
  it("adds nothing when nothing is needed", () => {
    expect(run("const a = 1\n", [])).toBe("const a = 1\n")
  })

  it("merges, dedupes and sorts needed names per module", () => {
    expect(run("x\n", [["effect", "Schema"], ["effect", "Effect"], ["effect", "Effect"], ["effect/http", "HttpClient"]]))
      .toBe("import { Effect, Schema } from \"effect\"\nimport { HttpClient } from \"effect/http\"\nx\n")
  })

  it("skips names the file already binds and merges into an existing import", () => {
    expect(run("import { Effect } from \"effect\"\nx\n", [["effect", "Effect"], ["effect", "Layer"]]))
      .toBe("import { Effect, Layer } from \"effect\"\nx\n")
  })

  it("never merges into type-only or namespace imports", () => {
    expect(run("import type { Option } from \"effect\"\nimport * as E from \"effect\"\nx\n", [["effect", "Effect"]]))
      .toBe("import { Effect } from \"effect\"\nimport type { Option } from \"effect\"\nimport * as E from \"effect\"\nx\n")
  })

  it("keeps a hashbang first", () => {
    expect(run("#!/usr/bin/env node\nx\n", [["effect", "Effect"]]))
      .toBe("#!/usr/bin/env node\nimport { Effect } from \"effect\"\nx\n")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/superset.test.ts packages/effectscript/core/test/mappings.test.ts packages/effectscript/core/test/imports.test.ts`
Expected: FAIL. The modules don't exist yet, and the superset test would fail on 44
`packages/effect/src` files with "Unexpected keyword 'const'" / "Identifier 'Stream' has already
been declared".

- [ ] **Step 3: Add the acorn-typescript fixes to the plugin**

In `src/compiler/parser/plugin.ts`, add these two methods inside `class EfxParser` (after
`readToken_pipe_amp`):

```ts
    // --- acorn-typescript gaps (found by test/superset.test.ts) ----------------------------------

    // `const` type parameters in signatures and function types: `<const A>(a: A) => A`
    tsTryParseTypeParameters(parseModifiers: unknown) {
      return super.tsTryParseTypeParameters(parseModifiers ?? this.tsParseConstModifier)
    }

    // `import type { X }` must not bind a value, so `const X = …` in the same module is legal.
    declareName(name: string, bindingType: number, pos: number) {
      if (this.importOrExportOuterKind === "type") return
      return super.declareName(name, bindingType, pos)
    }
```

- [ ] **Step 4: Implement options, context, walker, imports, scope analysis**

`src/compiler/options.ts`:

```ts
/**
 * @since 0.1.0
 */
import type { Diagnostic } from "./diagnostics.ts"
import type { Mode } from "./parser/parse.ts"

/**
 * @since 0.1.0
 * @category models
 */
export type Runtime = "node" | "bun" | "deno" | "browser"

/**
 * @since 0.1.0
 * @category models
 */
export interface CompileOptions {
  readonly filename?: string | undefined
  readonly packageName?: string | undefined
  readonly packageRoot?: string | undefined
  readonly runtime?: Runtime | undefined
  readonly prelude?: boolean | undefined
  readonly rewriteImportExtensions?: "ts" | "js" | false | undefined
  readonly sourceMap?: boolean | undefined
}

/**
 * @since 0.1.0
 * @category models
 */
export interface ResolvedOptions {
  readonly filename: string
  readonly packageName: string | undefined
  readonly packageRoot: string | undefined
  readonly runtime: Runtime
  readonly prelude: boolean
  readonly rewriteImportExtensions: "ts" | "js" | false
  readonly sourceMap: boolean
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const resolveOptions = (options: CompileOptions): ResolvedOptions => ({
  filename: options.filename ?? "input.efx",
  packageName: options.packageName,
  packageRoot: options.packageRoot,
  runtime: options.runtime ?? "node",
  prelude: options.prelude ?? true,
  rewriteImportExtensions: options.rewriteImportExtensions ?? false,
  sourceMap: options.sourceMap ?? true
})

/**
 * Volar-compatible code information.
 *
 * @since 0.1.0
 * @category models
 */
export interface CodeInformation {
  readonly verification: boolean
  readonly completion: boolean
  readonly semantic: boolean
  readonly navigation: boolean
  readonly structure: boolean
  readonly format: boolean
}

/**
 * Volar-compatible mapping (`@volar/language-core` `CodeMapping`).
 *
 * @since 0.1.0
 * @category models
 */
export interface CodeMapping {
  readonly sourceOffsets: Array<number>
  readonly generatedOffsets: Array<number>
  readonly lengths: Array<number>
  readonly generatedLengths?: Array<number>
  readonly data: CodeInformation
}

/**
 * @since 0.1.0
 * @category models
 */
export interface SourceMapV3 {
  readonly version: number
  readonly file?: string
  readonly sources: Array<string>
  readonly sourcesContent?: Array<string | null>
  readonly names: Array<string>
  readonly mappings: string
}

/**
 * @since 0.1.0
 * @category models
 */
export interface CompileResult {
  readonly code: string
  readonly mode: Mode
  readonly map: SourceMapV3 | undefined
  readonly mappings: ReadonlyArray<CodeMapping>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}
```

`src/compiler/analyze/scope.ts`:

```ts
/**
 * Lexical scope analysis: which names are bound where, so builtins/prelude/bare types only
 * apply to *free* identifiers.
 *
 * @since 0.1.0
 */
import { children, type Node } from "../ast.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface Scope {
  readonly parent: Scope | undefined
  readonly kind: "module" | "function" | "block"
  readonly values: Set<string>
  readonly types: Set<string>
}

/**
 * @since 0.1.0
 * @category models
 */
export interface ScopeAnalysis {
  readonly program: Node
  readonly module: Scope
  readonly scopeOf: Map<Node, Scope>
  readonly constInits: Map<string, Node>
  readonly localErrors: Set<string>
}

const makeScope = (parent: Scope | undefined, kind: Scope["kind"]): Scope => ({
  parent,
  kind,
  values: new Set(),
  types: new Set()
})

/**
 * @since 0.1.0
 * @category queries
 */
export const isValueFree = (scope: Scope, name: string): boolean => {
  for (let s: Scope | undefined = scope; s !== undefined; s = s.parent) if (s.values.has(name)) return false
  return true
}

/**
 * @since 0.1.0
 * @category queries
 */
export const isTypeFree = (scope: Scope, name: string): boolean => {
  for (let s: Scope | undefined = scope; s !== undefined; s = s.parent) if (s.types.has(name)) return false
  return true
}

/**
 * Binding names introduced by a destructuring pattern.
 *
 * @since 0.1.0
 * @category queries
 */
export const patternNames = (pattern: Node | null | undefined, out: Array<string> = []): Array<string> => {
  if (pattern === null || pattern === undefined) return out
  switch (pattern.type) {
    case "Identifier":
      out.push(pattern.name)
      break
    case "ObjectPattern":
      for (const p of pattern.properties) patternNames(p.type === "RestElement" ? p.argument : p.value, out)
      break
    case "ArrayPattern":
      for (const element of pattern.elements) patternNames(element, out)
      break
    case "RestElement":
      patternNames(pattern.argument, out)
      break
    case "AssignmentPattern":
      patternNames(pattern.left, out)
      break
    case "TSParameterProperty":
      patternNames(pattern.parameter, out)
      break
  }
  return out
}

const typeParameterNames = (node: Node): Array<string> => {
  const declaration = node.typeParameters
  if (declaration?.type !== "TSTypeParameterDeclaration") return []
  return declaration.params.map((p: Node) => (typeof p.name === "string" ? p.name : p.name.name) as string)
}

const nearestFunction = (scope: Scope): Scope => {
  let s = scope
  while (s.kind === "block" && s.parent !== undefined) s = s.parent
  return s
}

const functionTypes = new Set([
  "FunctionDeclaration",
  "TSDeclareFunction",
  "FunctionExpression",
  "ArrowFunctionExpression"
])
const blockTypes = new Set([
  "BlockStatement",
  "StaticBlock",
  "SwitchStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "DoExpression"
])

/**
 * @since 0.1.0
 * @category analysis
 */
export const analyze = (program: Node): ScopeAnalysis => {
  const module = makeScope(undefined, "module")
  const scopeOf = new Map<Node, Scope>([[program, module]])
  const constInits = new Map<string, Node>()
  const localErrors = new Set<string>()

  const visitChildren = (node: Node, scope: Scope): void => {
    for (const child of children(node)) visit(child, scope)
  }

  const visitFunction = (node: Node, scope: Scope): void => {
    if (node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction") {
      if (node.id) scope.values.add(node.id.name)
    }
    const fn = makeScope(scope, "function")
    scopeOf.set(node, fn)
    if (node.type === "FunctionExpression" && node.id) fn.values.add(node.id.name)
    for (const name of typeParameterNames(node)) fn.types.add(name)
    for (const param of node.params) for (const name of patternNames(param)) fn.values.add(name)
    for (const child of children(node)) {
      if (child === node.body && child.type === "BlockStatement") {
        scopeOf.set(child, fn)
        visitChildren(child, fn)
      } else {
        visit(child, fn)
      }
    }
  }

  const visit = (node: Node, scope: Scope): void => {
    if (functionTypes.has(node.type)) return visitFunction(node, scope)
    if (blockTypes.has(node.type)) {
      const block = makeScope(scope, "block")
      scopeOf.set(node, block)
      return visitChildren(node, block)
    }
    switch (node.type) {
      case "ImportDeclaration": {
        for (const specifier of node.specifiers) {
          const name: string = specifier.local.name
          scope.types.add(name)
          if (node.importKind !== "type" && specifier.importKind !== "type") scope.values.add(name)
        }
        return
      }
      case "VariableDeclaration": {
        const target = node.kind === "var" ? nearestFunction(scope) : scope
        for (const declarator of node.declarations) {
          for (const name of patternNames(declarator.id)) target.values.add(name)
          if (scope === module && node.kind === "const" && declarator.id.type === "Identifier" && declarator.init) {
            constInits.set(declarator.id.name, declarator.init)
          }
        }
        return visitChildren(node, scope)
      }
      case "ClassDeclaration":
      case "ClassExpression": {
        if (node.type === "ClassDeclaration" && node.id) {
          scope.values.add(node.id.name)
          scope.types.add(node.id.name)
        }
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        if (node.id) {
          inner.values.add(node.id.name)
          inner.types.add(node.id.name)
        }
        for (const name of typeParameterNames(node)) inner.types.add(name)
        return visitChildren(node, inner)
      }
      case "CatchClause": {
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        for (const name of patternNames(node.param)) inner.values.add(name)
        return visitChildren(node, inner)
      }
      case "TSTypeAliasDeclaration":
      case "TSInterfaceDeclaration": {
        scope.types.add(node.id.name)
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        for (const name of typeParameterNames(node)) inner.types.add(name)
        return visitChildren(node, inner)
      }
      case "TSEnumDeclaration":
      case "TSImportEqualsDeclaration": {
        scope.values.add(node.id.name)
        scope.types.add(node.id.name)
        return visitChildren(node, scope)
      }
      case "TSModuleDeclaration": {
        if (node.id.type === "Identifier") {
          scope.values.add(node.id.name)
          scope.types.add(node.id.name)
        }
        const inner = makeScope(scope, "function")
        scopeOf.set(node, inner)
        return visitChildren(node, inner)
      }
    }
    if (node.typeParameters?.type === "TSTypeParameterDeclaration") {
      const inner = makeScope(scope, "block")
      scopeOf.set(node, inner)
      for (const name of typeParameterNames(node)) inner.types.add(name)
      return visitChildren(node, inner)
    }
    visitChildren(node, scope)
  }

  for (const statement of program.body) visit(statement, module)
  return { program, module, scopeOf, constInits, localErrors }
}
```

`src/compiler/imports.ts`:

```ts
/**
 * Import bookkeeping: generated code and prelude identifiers call `need`. Only names that were
 * needed *and* are not already bound in the module are emitted, so files never gain unused imports.
 * Names are merged into an existing `import { … } from "<module>"` when there is one.
 *
 * @since 0.1.0
 */
import type MagicString from "magic-string"
import { isValueFree, type ScopeAnalysis } from "./analyze/scope.ts"
import type { Node } from "./ast.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface ImportSet {
  readonly need: (module: string, name: string) => void
  readonly entries: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const makeImportSet = (): ImportSet => {
  const entries = new Map<string, Set<string>>()
  return {
    entries,
    need: (module, name) => {
      let names = entries.get(module)
      if (names === undefined) {
        names = new Set()
        entries.set(module, names)
      }
      names.add(name)
    }
  }
}

/**
 * @since 0.1.0
 * @category emit
 */
export const emitImports = (ctx: {
  readonly source: string
  readonly s: MagicString
  readonly imports: ImportSet
  readonly analysis: ScopeAnalysis
}): void => {
  const lines: Array<string> = []
  const modules = [...ctx.imports.entries.keys()].sort()
  for (const module of modules) {
    const names = [...ctx.imports.entries.get(module)!].filter((name) => isValueFree(ctx.analysis.module, name)).sort()
    if (names.length === 0) continue
    const existing = ctx.analysis.program.body.find((statement: Node) =>
      statement.type === "ImportDeclaration" && statement.source.value === module && statement.importKind !== "type" &&
      statement.specifiers.length > 0 && statement.specifiers.every((s: Node) => s.type === "ImportSpecifier")
    )
    if (existing !== undefined) {
      ctx.s.appendLeft(existing.specifiers.at(-1).end, `, ${names.join(", ")}`)
    } else {
      lines.push(`import { ${names.join(", ")} } from "${module}"`)
    }
  }
  if (lines.length === 0) return
  const text = `${lines.join("\n")}\n`
  if (ctx.source.startsWith("#!")) {
    const lineEnd = ctx.source.indexOf("\n")
    ctx.s.appendLeft(lineEnd === -1 ? ctx.source.length : lineEnd + 1, text)
  } else {
    ctx.s.prepend(text)
  }
}
```

`src/compiler/context.ts`:

```ts
/**
 * @since 0.1.0
 */
import type MagicString from "magic-string"
import type { Scope, ScopeAnalysis } from "./analyze/scope.ts"
import type { Node } from "./ast.ts"
import type { Diagnostic } from "./diagnostics.ts"
import type { ImportSet } from "./imports.ts"
import type { ResolvedOptions } from "./options.ts"

/**
 * Returning `true` means "I visited the children myself".
 *
 * @since 0.1.0
 * @category models
 */
export type Handler = (node: Node, parent: Node | undefined, ctx: Ctx) => boolean | void

/**
 * @since 0.1.0
 * @category models
 */
export interface EffectFrame {
  readonly node: Node
  readonly kind: "declaration" | "arrow" | "method" | "block" | "main"
  scoped: boolean
  readonly layerConstructor: boolean
}

/**
 * @since 0.1.0
 * @category models
 */
export interface Ctx {
  readonly source: string
  readonly s: MagicString
  readonly options: ResolvedOptions
  readonly analysis: ScopeAnalysis
  readonly diagnostics: Array<Diagnostic>
  readonly imports: ImportSet
  readonly handlers: ReadonlyMap<string, ReadonlyArray<Handler>>
  scope: Scope
  effect: EffectFrame | undefined
  service: string | undefined
  namespace: string
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const makeFrame = (node: Node, kind: EffectFrame["kind"], layerConstructor = false): EffectFrame => ({
  node,
  kind,
  scoped: false,
  layerConstructor
})

/**
 * @since 0.1.0
 * @category combinators
 */
export const withEffect = <A>(ctx: Ctx, frame: EffectFrame | undefined, f: () => A): A => {
  const previous = ctx.effect
  ctx.effect = frame
  try {
    return f()
  } finally {
    ctx.effect = previous
  }
}

/**
 * @since 0.1.0
 * @category combinators
 */
export const withNamespace = <A>(ctx: Ctx, namespace: string, f: () => A): A => {
  const previous = ctx.namespace
  ctx.namespace = namespace
  try {
    return f()
  } finally {
    ctx.namespace = previous
  }
}
```

`src/compiler/walk.ts`:

```ts
/**
 * @since 0.1.0
 */
import { children, type Node } from "./ast.ts"
import type { Ctx } from "./context.ts"

const boundaries = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "ClassDeclaration",
  "ClassExpression"
])

/**
 * @since 0.1.0
 * @category traversal
 */
export const walk = (node: Node, parent: Node | undefined, ctx: Ctx): void => {
  const previousScope = ctx.scope
  const previousEffect = ctx.effect
  const scope = ctx.analysis.scopeOf.get(node)
  if (scope !== undefined) ctx.scope = scope
  if (boundaries.has(node.type) && node.efx === undefined) ctx.effect = undefined
  let handled = false
  for (const handler of ctx.handlers.get(node.type) ?? []) {
    if (handler(node, parent, ctx) === true) {
      handled = true
      break
    }
  }
  if (!handled) walkChildren(node, ctx)
  ctx.scope = previousScope
  ctx.effect = previousEffect
}

/**
 * @since 0.1.0
 * @category traversal
 */
export const walkChildren = (node: Node, ctx: Ctx, skip?: ReadonlySet<Node>): void => {
  for (const child of children(node)) {
    if (skip === undefined || !skip.has(child)) walk(child, node, ctx)
  }
}
```

`src/compiler/transform/index.ts`:

```ts
/**
 * @since 0.1.0
 */
import type { Handler } from "../context.ts"

/**
 * @since 0.1.0
 * @category models
 */
export type HandlerGroup = Readonly<Record<string, Handler>>

/**
 * Merges handler groups. Earlier groups run first for the same node type.
 *
 * @since 0.1.0
 * @category constructors
 */
export const registry = (...groups: ReadonlyArray<HandlerGroup>): ReadonlyMap<string, ReadonlyArray<Handler>> => {
  const map = new Map<string, Array<Handler>>()
  for (const group of groups) {
    for (const [type, handler] of Object.entries(group)) {
      const list = map.get(type) ?? []
      list.push(handler)
      map.set(type, list)
    }
  }
  return map
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const handlers = registry()
```

- [ ] **Step 5: Implement mappings and the compile pipeline**

`src/compiler/mappings.ts`:

```ts
/**
 * Converts magic-string's hi-res decoded source map into Volar `CodeMapping`s.
 *
 * Unchanged text produces one segment per character. Runs where both offsets advance together
 * become one mapping. An isolated segment is an edited chunk, mapped as a whole range.
 *
 * @since 0.1.0
 */
import type MagicString from "magic-string"
import type { CodeInformation, CodeMapping } from "./options.ts"

/**
 * @since 0.1.0
 * @category constants
 */
export const fullFeatures: CodeInformation = {
  verification: true,
  completion: true,
  semantic: true,
  navigation: true,
  structure: true,
  format: false
}

const lineStarts = (text: string): Array<number> => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return starts
}

/**
 * @since 0.1.0
 * @category mappings
 */
export const toCodeMappings = (s: MagicString, source: string, code: string): Array<CodeMapping> => {
  const decoded = s.generateDecodedMap({ hires: true, includeContent: false })
  const sourceLines = lineStarts(source)
  const codeLines = lineStarts(code)
  const points: Array<readonly [number, number]> = []
  decoded.mappings.forEach((line, generatedLine) => {
    for (const segment of line) {
      if (segment.length < 4) continue
      points.push([codeLines[generatedLine]! + segment[0], sourceLines[segment[2]!]! + segment[3]!])
    }
  })
  const mappings: Array<CodeMapping> = []
  let i = 0
  while (i < points.length) {
    const [generated, original] = points[i]!
    let j = i
    while (
      j + 1 < points.length &&
      points[j + 1]![0] === points[j]![0] + 1 &&
      points[j + 1]![1] === points[j]![1] + 1
    ) j++
    const next = points[j + 1]
    if (j > i) {
      mappings.push({
        sourceOffsets: [original],
        generatedOffsets: [generated],
        lengths: [points[j]![0] - generated + 1],
        data: fullFeatures
      })
    } else {
      const generatedLength = (next === undefined ? code.length : next[0]) - generated
      const sourceLength = next !== undefined && next[1] > original ? next[1] - original : generatedLength
      mappings.push(
        generatedLength === sourceLength
          ? { sourceOffsets: [original], generatedOffsets: [generated], lengths: [sourceLength], data: fullFeatures }
          : {
            sourceOffsets: [original],
            generatedOffsets: [generated],
            lengths: [sourceLength],
            generatedLengths: [generatedLength],
            data: fullFeatures
          }
      )
    }
    i = j + 1
  }
  return mappings
}
```

`src/compiler/compile.ts`:

```ts
/**
 * @since 0.1.0
 */
import MagicString from "magic-string"
import { analyze } from "./analyze/scope.ts"
import type { Ctx } from "./context.ts"
import { emitImports, makeImportSet } from "./imports.ts"
import { fullFeatures, toCodeMappings } from "./mappings.ts"
import { type CompileOptions, type CompileResult, resolveOptions, type SourceMapV3 } from "./options.ts"
import { parse } from "./parser/parse.ts"
import { handlers } from "./transform/index.ts"
import { walk } from "./walk.ts"

/**
 * Compiles EffectScript (`.efx`) to idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 * @category compiler
 */
export const toTypeScript = (source: string, options: CompileOptions = {}): CompileResult => {
  const resolved = resolveOptions(options)
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return { code: "", mode: "ts", map: undefined, mappings: [], diagnostics: parsed.diagnostics }
  }
  const s = new MagicString(source)
  const analysis = analyze(parsed.program)
  const ctx: Ctx = {
    source,
    s,
    options: resolved,
    analysis,
    diagnostics: [],
    imports: makeImportSet(),
    handlers,
    scope: analysis.module,
    effect: undefined,
    service: undefined,
    namespace: "Effect"
  }
  walk(parsed.program, undefined, ctx)
  emitImports(ctx)
  const code = s.toString()
  const changed = s.hasChanged()
  const map: SourceMapV3 | undefined = resolved.sourceMap
    ? JSON.parse(s.generateMap({ hires: "boundary", source: resolved.filename, includeContent: true }).toString())
    : undefined
  return {
    code,
    mode: parsed.mode,
    map,
    mappings: changed
      ? toCodeMappings(s, source, code)
      : [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [source.length], data: fullFeatures }],
    diagnostics: ctx.diagnostics
  }
}
```

Replace `src/compiler/index.ts` with:

```ts
/**
 * EffectScript compiler: `.efx` → idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 */
export { type Node } from "./ast.ts"
export { toTypeScript } from "./compile.ts"
export {
  type Diagnostic,
  diagnosticError,
  diagnosticWarning,
  formatDiagnostic,
  lineColumn,
  type Severity
} from "./diagnostics.ts"
export {
  type CodeInformation,
  type CodeMapping,
  type CompileOptions,
  type CompileResult,
  type ResolvedOptions,
  type Runtime,
  type SourceMapV3
} from "./options.ts"
export { type Mode, parse, type ParseResult } from "./parser/parse.ts"
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS (smoke, parser, superset, mappings, imports).

If the superset test reports new parse failures, fix them in `plugin.ts` as targeted overrides
that call `super`, then add a regression case to `test/parser.test.ts`. Never weaken the test.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): compile pipeline with scope analysis, imports, mappings and superset test"
```

---

### Task 4: Parser: `effect` declarations, blocks, arrows, methods, `throws`/`needs`

**Files:**
- Modify: `src/compiler/parser/plugin.ts`
- Test: `test/parser.test.ts` (append)

**Interfaces:**
- Consumes: `efxPlugin` and `skipBalanced`/`skipSpace` from Task 2.
- Produces these AST shapes, which every later task relies on:
  - **Effect declaration:** `FunctionDeclaration` (or `TSDeclareFunction`) with `async: true` and
    `efx: { kind: "declaration", keyword: {start,end}, exportDefault?: true }`. It also has
    `efxPipes: Array<Node>` and `efxPipeOps: Array<{start,end}>`, both possibly empty. The node
    spans from `effect` to the body's `}`; pipes come after it.
  - **Effect block:** `EffectBlock { keyword: {start,end}, body: BlockStatement }`. `await` is
    allowed inside.
  - **Effect arrow:** `ArrowFunctionExpression` with `async: true` and
    `efx: { kind: "arrow", keyword }`. The node starts at `(` or at the single parameter.
  - **Effect object method:** `Property` with `efxMethod: true`. Its `value` is a
    `FunctionExpression` (async) with `efx: { kind: "method", keyword }`; `keyword.start` equals
    `Property.start`.
  - **Effect class member:** `MethodDefinition` or `TSDeclareMethod` with
    `efx: { kind: "method", keyword }`. A `MethodDefinition`'s value carries the same `efx`.
  - **Return annotations:** a `TSTypeAnnotation` may have `efxThrows: TSType`,
    `efxThrowsKeyword: {start,end}`, `efxNeeds: TSType`, and `efxNeedsKeyword: {start,end}`.
    Its `end` extends past them.
  - **Helpers on the parser:** `efxParseAsyncBlock()` (a block where `await` is allowed) and
    `efxAttachPipes(node)` (consumes trailing `|> expr` items into `node.efxPipes` /
    `node.efxPipeOps`).

- [ ] **Step 1: Write the failing tests**

Append to `test/parser.test.ts`:

```ts
import { children } from "../src/compiler/ast.ts"

const find = (node: any, predicate: (n: any) => boolean): any => {
  if (predicate(node)) return node
  for (const child of children(node)) {
    const found = find(child, predicate)
    if (found !== undefined) return found
  }
  return undefined
}

describe("effect syntax", () => {
  it("parses effect declarations with throws/needs and trailing pipes", () => {
    const { program } = ok(
      "export effect getUser(id: string): User throws NotFound needs Db {\n  return await load(id)\n} |> retry(1) |> orDie\n"
    )
    const fn = program.body[0].declaration
    expect(fn.type).toBe("FunctionDeclaration")
    expect(fn.efx.kind).toBe("declaration")
    expect(fn.async).toBe(true)
    expect(fn.returnType.typeAnnotation.type).toBe("TSTypeReference")
    expect(fn.returnType.efxThrows.type).toBe("TSTypeReference")
    expect(fn.returnType.efxNeeds.type).toBe("TSTypeReference")
    expect(fn.body.body[0].argument.type).toBe("AwaitExpression")
    expect(fn.efxPipes.map((p: any) => p.type)).toEqual(["CallExpression", "Identifier"])
    expect(fn.efxPipeOps).toHaveLength(2)
  })

  it("parses export default effect declarations", () => {
    const { program } = ok("export default effect main() {\n  await run\n}\n")
    expect(program.body[0].type).toBe("ExportDefaultDeclaration")
    expect(program.body[0].declaration.efx.exportDefault).toBe(true)
  })

  it("parses effect blocks, arrows and object methods", () => {
    const { program } = ok(
      "const a = effect { await x }\nconst b = effect (n: number): string throws E => await f(n)\nconst c = effect n => n\nconst d = { effect m(x) { await x } }\n"
    )
    expect(program.body[0].declarations[0].init.type).toBe("EffectBlock")
    const b = program.body[1].declarations[0].init
    expect(b.type).toBe("ArrowFunctionExpression")
    expect(b.efx.kind).toBe("arrow")
    expect(b.body.type).toBe("AwaitExpression")
    expect(b.returnType.efxThrows.type).toBe("TSTypeReference")
    expect(program.body[2].declarations[0].init.efx.kind).toBe("arrow")
    const prop = program.body[3].declarations[0].init.properties[0]
    expect(prop.efxMethod).toBe(true)
    expect(prop.key.name).toBe("m")
    expect(prop.value.efx.kind).toBe("method")
    expect(prop.value.efx.keyword.start).toBe(prop.start)
  })

  it("parses effect class members, with and without bodies", () => {
    const { program } = ok("class S {\n  effect find(id: string): User throws E\n  effect load() { await x }\n}\n")
    const [find1, load] = program.body[0].body.body
    expect(find1.type).toBe("TSDeclareMethod")
    expect(find1.efx.kind).toBe("method")
    expect(find1.returnType.efxThrows.type).toBe("TSTypeReference")
    expect(load.type).toBe("MethodDefinition")
    expect(load.value.efx.kind).toBe("method")
  })

  it("parses throws in function types", () => {
    const { program } = ok("type F = (id: string) => User throws NotFound\n")
    expect(find(program, (n) => n.efxThrows !== undefined)).toBeDefined()
  })

  it("contextual words remain identifiers", () => {
    ok(
      "const effect = 1\neffect + 1\nfunction match(a: number) { return a }\nmatch(1)\n" +
        "const o = { effect: 1, effect2() {}, effect() {} }\nclass K { effect = 1; effect2() {} }\n" +
        "const main = () => 1\nmain()\nconst defer = (f: () => void) => f\ndefer(() => {})\n" +
        "const throws = 1, needs = 2\neffect\n{ }\n"
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/parser.test.ts`
Expected: FAIL in the "effect syntax" tests ("Unexpected token" at `getUser`, and so on). The
"contextual words" test should already pass, because it is plain TS.

- [ ] **Step 3: Implement the effect syntax in the plugin**

In `src/compiler/parser/plugin.ts`, add `import { skipBalanced, skipSpace } from "./scan.ts"` at the
top, then add these methods inside `class EfxParser`:

```ts
    efxNextIsNameSameLine(): boolean {
      const next = this.lookahead()
      return next.type === tt.name && this.efxSameLine(next)
    }

    efxIsEffectDeclarationStart(): boolean {
      return this.efxIsWord("effect") && this.efxNextIsNameSameLine()
    }

    /** A block in which `await` is allowed: the body of an effect. */
    efxParseAsyncBlock(): any {
      const oldYieldPos = this.yieldPos
      const oldAwaitPos = this.awaitPos
      const oldAwaitIdentPos = this.awaitIdentPos
      const oldLabels = this.labels
      this.yieldPos = 0
      this.awaitPos = 0
      this.awaitIdentPos = 0
      this.labels = []
      this.enterScope(2 | 4) // SCOPE_FUNCTION | SCOPE_ASYNC
      const body = this.parseBlock(false)
      this.exitScope()
      this.yieldPos = oldYieldPos
      this.awaitPos = oldAwaitPos
      this.awaitIdentPos = oldAwaitIdentPos
      this.labels = oldLabels
      return body
    }

    /** Trailing `|> expr` items after a declaration-like construct. */
    efxAttachPipes(node: any): void {
      const pipes: Array<any> = []
      const ops: Array<{ start: number; end: number }> = []
      while (this.type === pipelineToken) {
        ops.push({ start: this.start, end: this.end })
        this.next()
        const start = this.start
        const startLoc = this.startLoc
        pipes.push(this.parseExprOp(this.parseMaybeUnary(null, false, false, false), start, startLoc, pipelineToken.binop, false))
      }
      node.efxPipes = pipes
      node.efxPipeOps = ops
      if (pipes.length > 0) this.eat(tt.semi)
    }

    efxParseEffectDeclaration(exportDefault: boolean): any {
      const node = this.startNode()
      const keyword = { start: this.start, end: this.end }
      this.next()
      const fn = this.parseFunction(node, 1 /* FUNC_STATEMENT */, false, true)
      fn.efx = exportDefault ? { kind: "declaration", keyword, exportDefault: true } : { kind: "declaration", keyword }
      this.efxAttachPipes(fn)
      return fn
    }

    parseStatement(context: unknown, topLevel: unknown, exports: unknown) {
      if (this.efxIsEffectDeclarationStart()) return this.efxParseEffectDeclaration(false)
      return super.parseStatement(context, topLevel, exports)
    }

    shouldParseExportStatement() {
      return this.efxIsEffectDeclarationStart() || super.shouldParseExportStatement()
    }

    parseExportDefaultDeclaration() {
      if (this.efxIsEffectDeclarationStart()) return this.efxParseEffectDeclaration(true)
      return super.parseExportDefaultDeclaration()
    }

    // --- effect expressions --------------------------------------------------------------------

    /** `(params)` followed by `=>`, or by `: ReturnType … =>`. */
    efxIsParenArrowAhead(parenStart: number): boolean {
      const end = skipBalanced(this.input, parenStart)
      if (end === -1) return false
      let i = skipSpace(this.input, end)
      if (this.input.startsWith("=>", i)) return true
      if (this.input[i] !== ":") return false
      i++
      while (i < this.input.length) {
        i = skipSpace(this.input, i)
        if (this.input.startsWith("=>", i)) return true
        const ch = this.input[i]!
        if (ch === "(" || ch === "[" || ch === "{") {
          i = skipBalanced(this.input, i)
          if (i === -1) return false
          continue
        }
        if (ch === ";" || ch === "," || ch === ")" || ch === "}" || ch === "]") return false
        i++
      }
      return false
    }

    efxParseEffectBlock(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.body = this.efxParseAsyncBlock()
      return this.finishNode(node, "EffectBlock")
    }

    efxParseEffectArrow(): any {
      const keyword = { start: this.start, end: this.end }
      this.next()
      const state = this.efxState()
      const arrowStart = this.start
      state.arrowStarts.add(arrowStart)
      let arrow: any
      if (this.type === tt.parenL) {
        arrow = this.parseParenAndDistinguishExpression(true, false)
      } else {
        const start = this.start
        const startLoc = this.startLoc
        const param = this.parseIdent(false)
        this.expect(tt.arrow)
        arrow = this.parseArrowExpression(this.startNodeAt(start, startLoc), [param], true, false)
      }
      state.arrowStarts.delete(arrowStart)
      if (arrow.type !== "ArrowFunctionExpression") this.raise(keyword.start, "Expected an arrow function after `effect`")
      arrow.efx = { kind: "arrow", keyword }
      return arrow
    }

    parseArrowExpression(node: any, params: any, isAsync: boolean, forInit: boolean) {
      const forced = this.efxState().arrowStarts.has(node.start)
      return super.parseArrowExpression(node, params, forced || isAsync, forInit)
    }

    parseExprAtom(refDestructuringErrors: unknown, forInit: unknown, forNew: unknown) {
      if (this.efxIsWord("effect")) {
        const next = this.lookahead()
        if (this.efxSameLine(next)) {
          if (next.type === tt.braceL) return this.efxParseEffectBlock()
          if (next.type === tt.parenL && this.efxIsParenArrowAhead(next.start)) return this.efxParseEffectArrow()
          if (next.type === tt.name && this.input.startsWith("=>", skipSpace(this.input, next.end))) {
            return this.efxParseEffectArrow()
          }
        }
      }
      return super.parseExprAtom(refDestructuringErrors, forInit, forNew)
    }

    // --- effect methods ------------------------------------------------------------------------

    efxIsMethodAhead(): boolean {
      if (!this.efxIsWord("effect")) return false
      const next = this.lookahead()
      return this.efxSameLine(next) &&
        (next.type === tt.name || next.type === tt.string || next.type === tt.num || next.type === tt.bracketL ||
          next.type.keyword !== undefined)
    }

    parseProperty(isPattern: boolean, refDestructuringErrors: unknown) {
      if (!isPattern && this.efxIsMethodAhead()) {
        const keyword = { start: this.start, end: this.end }
        this.value = "async" // reuse acorn's `async` method path; the key is re-parsed afterwards
        const prop = super.parseProperty(isPattern, refDestructuringErrors)
        prop.efxMethod = true
        if (prop.value?.type === "FunctionExpression") prop.value.efx = { kind: "method", keyword }
        return prop
      }
      return super.parseProperty(isPattern, refDestructuringErrors)
    }

    parseClassElement(constructorAllowsSuper: boolean) {
      if (this.efxIsMethodAhead()) {
        const keyword = { start: this.start, end: this.end }
        this.value = "async"
        const element = super.parseClassElement(constructorAllowsSuper)
        element.efx = { kind: "method", keyword }
        if (element.value?.type === "FunctionExpression") element.value.efx = element.efx
        return element
      }
      return super.parseClassElement(constructorAllowsSuper)
    }

    // --- throws / needs ------------------------------------------------------------------------

    tsParseTypeOrTypePredicateAnnotation(returnToken: unknown) {
      const annotation = super.tsParseTypeOrTypePredicateAnnotation(returnToken)
      if (this.efxIsWord("throws") && !this.hasPrecedingLineBreak()) {
        annotation.efxThrowsKeyword = { start: this.start, end: this.end }
        this.next()
        annotation.efxThrows = this.tsInType(() => this.tsParseType())
      }
      if (this.efxIsWord("needs") && !this.hasPrecedingLineBreak()) {
        annotation.efxNeedsKeyword = { start: this.start, end: this.end }
        this.next()
        annotation.efxNeeds = this.tsInType(() => this.tsParseType())
      }
      if (annotation.efxThrows !== undefined || annotation.efxNeeds !== undefined) annotation.end = this.lastTokEnd
      return annotation
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/parser.test.ts packages/effectscript/core/test/superset.test.ts`
Expected: PASS. The superset test must stay green. It proves the new overrides never fire on valid
TS.

If "parses effect class members" fails because acorn-typescript rejects the mutated `async` value,
inspect `parseClassElement` in `node_modules/@sveltejs/acorn-typescript/index.js`. Then mark the
element some other way: record `this.start` in `efxState().arrowStarts`-style set
`methodStarts`, and in an override of `parseClassMethod(method, isGenerator, isAsync, ...)` force
`isAsync = true` when `method.start` is in the set.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): parse effect declarations, blocks, arrows, methods and throws/needs"
```

---

### Task 5: Transform: `effect` declarations, `await`, `throw`, return types (+ test harnesses)

**Files:**
- Create: `src/compiler/transform/returnType.ts`, `src/compiler/transform/effect.ts`,
  `src/compiler/transform/await.ts`
- Create: `test/utils/fixtures.ts`, `test/utils/typecheck.ts`, `test/utils/run.ts`,
  `test/compile.test.ts`, `test/typecheck.test.ts`, `test/runtime.test.ts`
- Create fixtures: `test/fixtures/effect/{declaration,await-precedence,throw,boundaries,comments,export-default,pipes,concurrency}.efx`
  and the matching `.ts` files
- Modify: `src/compiler/transform/index.ts` (register handlers)

**Interfaces:**
- Consumes: `Ctx`, `Handler`, `makeFrame`, `withEffect`, `walk`, `walkChildren`, and
  `ScopeAnalysis.localErrors` from Task 3, plus the Task 4 AST shapes.
- Produces:
  - `rewriteReturnType(ctx, annotation, wrapper: "Effect.fn.Return" | "Effect.Effect")`. It marks
    `annotation.efxHandled = true`.
  - `returnTypeHandlers: HandlerGroup`, which handles `TSTypeAnnotation` nodes with throws/needs
    that no one has handled yet, emitting `Effect.Effect<…>`.
  - `spanName(ctx, name)`, which returns `name`, or `Service.name` when `ctx.service` is set.
  - `removePipeOp(ctx, previousEnd, op, text)`, which removes `|>` plus one following space and
    appends `text` at `previousEnd`.
  - `attachPipesAsArguments(ctx, node, end, leading)`, which turns
    `} |> a |> b` into `}<leading>, a, b)`. It walks each pipe and closes with `)`.
  - `effectHandlers: HandlerGroup` and `awaitHandlers: HandlerGroup`.
  - `needsParens(node, parent)` and `isParenthesized(source, node)`, from `await.ts`.
  - Test utilities:
    - `listFixtures()`
    - `compileFixture(file) → { source, result, outFile }`
    - `typecheck(files: ReadonlyMap<string, string>): Array<string>`
    - `runCompiled(source, options?): Promise<any>`

- [ ] **Step 1: Write the test harnesses**

`test/utils/fixtures.ts`:

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import { toTypeScript } from "../../src/compiler/index.ts"

export const fixturesDir = path.join(import.meta.dirname, "..", "fixtures")

export const listFixtures = (): Array<string> =>
  fs.readdirSync(fixturesDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".efx"))
    .map((file) => file.split(path.sep).join("/"))
    .sort()

export const compileFixture = (file: string) => {
  const source = fs.readFileSync(path.join(fixturesDir, file), "utf8")
  const result = toTypeScript(source, { filename: file, packageName: "fixtures" })
  const outFile = file.replace(/\.efx$/, result.mode === "tsx" ? ".tsx" : ".ts")
  return { source, result, outFile }
}
```

`test/utils/typecheck.ts`:

```ts
import * as path from "node:path"
import * as ts from "typescript"

const root = path.resolve(import.meta.dirname, "../../../../..")
const virtualDir = path.join(root, "packages/effectscript/core/test/.virtual")
const src = (p: string) => path.join(root, "packages", p)

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  moduleDetection: ts.ModuleDetectionKind.Force,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.ReactJSX,
  types: ["node"],
  paths: {
    "effect": [src("effect/src/index.ts")],
    "effect/*": [src("effect/src/*/index.ts"), src("effect/src/*.ts")],
    "@effect/platform-node": [src("platform/node/src/index.ts")],
    "@effect/platform-bun": [src("platform/bun/src/index.ts")],
    "@effect/vitest": [src("vitest/src/index.ts")]
  }
}

/** Type-checks virtual files (name → code); returns diagnostics located in those files. */
export const typecheck = (files: ReadonlyMap<string, string>): Array<string> => {
  const virtual = new Map([...files].map(([name, code]) => [path.join(virtualDir, name), code]))
  const host = ts.createCompilerHost(compilerOptions, true)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const code = virtual.get(fileName)
    return code !== undefined
      ? ts.createSourceFile(fileName, code, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate)
  }
  const fileExists = host.fileExists.bind(host)
  host.fileExists = (fileName) => virtual.has(fileName) || fileExists(fileName)
  const readFile = host.readFile.bind(host)
  host.readFile = (fileName) => virtual.get(fileName) ?? readFile(fileName)
  const program = ts.createProgram([...virtual.keys()], compilerOptions, host)
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => d.file !== undefined && virtual.has(d.file.fileName))
    .map((d) => {
      const { character, line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0)
      const name = path.relative(virtualDir, d.file!.fileName)
      return `${name}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`
    })
}
```

`test/utils/run.ts`:

```ts
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { type CompileOptions, toTypeScript } from "../../src/compiler/index.ts"

const dir = path.join(import.meta.dirname, "..", ".runtime")
let counter = 0

/** Compiles EffectScript and imports the result through vitest's TS pipeline. */
export const runCompiled = async (source: string, options: CompileOptions = {}): Promise<any> => {
  const result = toTypeScript(source, options)
  if (result.diagnostics.length > 0) {
    throw new Error(result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"))
  }
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `case-${process.pid}-${counter++}.${result.mode}`)
  await fs.writeFile(file, result.code)
  return import(/* @vite-ignore */ file)
}
```

`test/compile.test.ts`:

```ts
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { compileFixture, fixturesDir, listFixtures } from "./utils/fixtures.ts"

describe("golden fixtures", () => {
  for (const file of listFixtures()) {
    it(file, async () => {
      const { outFile, result } = compileFixture(file)
      expect(result.diagnostics).toEqual([])
      await expect(result.code).toMatchFileSnapshot(path.join(fixturesDir, outFile))
    })
  }
})
```

`test/typecheck.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { compileFixture, listFixtures } from "./utils/fixtures.ts"
import { typecheck } from "./utils/typecheck.ts"

describe("typecheck", () => {
  it("every golden output type-checks against the workspace effect", () => {
    const files = new Map(listFixtures().map((file) => {
      const { outFile, result } = compileFixture(file)
      return [outFile, result.code] as const
    }))
    expect(typecheck(files)).toEqual([])
  }, 180_000)
})
```

- [ ] **Step 2: Write the fixtures (inputs and expected outputs)**

`test/fixtures/effect/declaration.efx`:

```ts
import { Data } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

declare const lookup: (id: string) => Effect.Effect<string, NotFound>

export effect getName(id: string): string throws NotFound {
  const name = await lookup(id)
  return name.toUpperCase()
}

effect helper(n: number) {
  return n * 2
}
```

`test/fixtures/effect/declaration.ts`:

```ts
import { Data, Effect } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

declare const lookup: (id: string) => Effect.Effect<string, NotFound>

export const getName = Effect.fn("getName")(function*(id: string): Effect.fn.Return<string, NotFound> {
  const name = yield* lookup(id)
  return name.toUpperCase()
})

const helper = Effect.fn("helper")(function*(n: number) {
  return n * 2
})
```

`test/fixtures/effect/await-precedence.efx`:

```ts
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<boolean>
declare const s: Effect.Effect<{ readonly length: number }>

effect precedence() {
  const sum = await a + 1
  const not = !await b
  const cast = await a as number
  const member = (await s).length
  const call = String(await a)
  const nullish = undefined ?? await a
  const cond = await b ? 1 : 2
  return [sum, not, cast, member, call, nullish, cond]
}
```

`test/fixtures/effect/await-precedence.ts`:

```ts
import { Effect } from "effect"
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<boolean>
declare const s: Effect.Effect<{ readonly length: number }>

const precedence = Effect.fn("precedence")(function*() {
  const sum = (yield* a) + 1
  const not = !(yield* b)
  const cast = (yield* a) as number
  const member = (yield* s).length
  const call = String(yield* a)
  const nullish = undefined ?? (yield* a)
  const cond = (yield* b) ? 1 : 2
  return [sum, not, cast, member, call, nullish, cond]
})
```

`test/fixtures/effect/throw.efx`:

```ts
import { Data } from "effect"

class Invalid extends Data.TaggedError("Invalid")<{}> {}

effect check(n: number): number throws Invalid | string {
  if (n < 0) throw new Invalid()
  if (n === 0) {
    throw "zero"
  }
  const parse = (s: string) => {
    if (s === "") throw new Error("plain JS throw")
    return Number(s)
  }
  return parse(String(n))
}
```

`test/fixtures/effect/throw.ts`:

```ts
import { Data, Effect } from "effect"

class Invalid extends Data.TaggedError("Invalid")<{}> {}

const check = Effect.fn("check")(function*(n: number): Effect.fn.Return<number, Invalid | string> {
  if (n < 0) return yield* Effect.fail(new Invalid())
  if (n === 0) {
    return yield* Effect.fail("zero")
  }
  const parse = (s: string) => {
    if (s === "") throw new Error("plain JS throw")
    return Number(s)
  }
  return parse(String(n))
})
```

`test/fixtures/effect/boundaries.efx`:

```ts
effect outer() {
  const plain = [1, 2].map((n) => n + 1)
  const promise = async () => {
    await Promise.resolve(1)
  }
  function named() {
    throw new Error("still JS")
  }
  return { plain, promise, named }
}

const notEffect = async () => await Promise.resolve(2)
```

`test/fixtures/effect/boundaries.ts`:

```ts
import { Effect } from "effect"
const outer = Effect.fn("outer")(function*() {
  const plain = [1, 2].map((n) => n + 1)
  const promise = async () => {
    await Promise.resolve(1)
  }
  function named() {
    throw new Error("still JS")
  }
  return { plain, promise, named }
})

const notEffect = async () => await Promise.resolve(2)
```

`test/fixtures/effect/comments.efx`:

```ts
declare const task: Effect.Effect<number>

/** Doubles the task result. */
export effect /* inline */ doubled(): number {
  // leading comment
  const n = await /* why */ task
  return n * 2 // trailing
}
```

`test/fixtures/effect/comments.ts`:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number>

/** Doubles the task result. */
export const doubled = Effect.fn("doubled")(function* /* inline */ (): Effect.fn.Return<number> {
  // leading comment
  const n = yield* /* why */ task
  return n * 2 // trailing
})
```

`test/fixtures/effect/export-default.efx`:

```ts
declare const task: Effect.Effect<number>

export default effect main() {
  return await task
}
```

`test/fixtures/effect/export-default.ts`:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number>

const main = Effect.fn("main")(function*() {
  return yield* task
})
export default main
```

`test/fixtures/effect/pipes.efx`:

```ts
declare const task: Effect.Effect<number, string>

export effect resilient() {
  return await task
} |> Effect.retry({ times: 2 })
  |> Effect.orElseSucceed(() => 0)
```

`test/fixtures/effect/pipes.ts`:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number, string>

export const resilient = Effect.fn("resilient")(function*() {
  return yield* task
}, Effect.retry({ times: 2 }),
  Effect.orElseSucceed(() => 0))
```

`test/fixtures/effect/concurrency.efx`:

```ts
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<string>

effect both() {
  const [n, s] = await [a, b]
  const { x, y } = await { x: a, y: b }
  return `${n}${s}${x}${y}`
}
```

`test/fixtures/effect/concurrency.ts`:

```ts
import { Effect } from "effect"
declare const a: Effect.Effect<number>
declare const b: Effect.Effect<string>

const both = Effect.fn("both")(function*() {
  const [n, s] = yield* Effect.all([a, b], { concurrency: "unbounded" })
  const { x, y } = yield* Effect.all({ x: a, y: b }, { concurrency: "unbounded" })
  return `${n}${s}${x}${y}`
})
```

`test/runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("runtime", () => {
  it("effect declarations run, fail with typed errors and run arrays concurrently", async () => {
    const mod = await runCompiled(`
      import { Data, Effect, Exit } from "effect"
      class Boom extends Data.TaggedError("Boom")<{}> {}
      export effect half(n: number): number throws Boom {
        if (n % 2 !== 0) throw new Boom()
        const [a, b] = await [Effect.succeed(n / 2), Effect.succeed(0)]
        return a + b
      }
      export const ok = Effect.runSync(half(4))
      export const failed = Effect.runSync(Effect.exit(half(3)))
      export const isFailure = Exit.isFailure(failed)
    `)
    expect(mod.ok).toBe(2)
    expect(mod.isFailure).toBe(true)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/runtime.test.ts`
Expected: FAIL. Outputs equal the inputs, because no handlers are registered yet.

- [ ] **Step 4: Implement the return-type rewriting**

`src/compiler/transform/returnType.ts`:

```ts
/**
 * `: A throws E needs R` → `: Wrapper<A, E, R>` (in place).
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx } from "../context.ts"
import type { HandlerGroup } from "./index.ts"

/**
 * @since 0.1.0
 * @category transforms
 */
export const rewriteReturnType = (ctx: Ctx, annotation: Node | null | undefined, wrapper: string): void => {
  if (annotation === null || annotation === undefined || annotation.typeAnnotation === undefined) return
  annotation.efxHandled = true
  const success: Node = annotation.typeAnnotation
  ctx.imports.need("effect", "Effect")
  ctx.s.appendRight(success.start, `${wrapper}<`)
  let end: number = success.end
  if (annotation.efxThrows !== undefined) {
    ctx.s.update(success.end, annotation.efxThrowsKeyword.end, ",")
    end = annotation.efxThrows.end
  }
  if (annotation.efxNeeds !== undefined) {
    ctx.s.update(end, annotation.efxNeedsKeyword.end, annotation.efxThrows !== undefined ? "," : ", never,")
    end = annotation.efxNeeds.end
  }
  ctx.s.prependLeft(end, ">")
}

/**
 * `throws`/`needs` in any other return position means "returns an Effect".
 *
 * @since 0.1.0
 * @category handlers
 */
export const returnTypeHandlers: HandlerGroup = {
  TSTypeAnnotation: (node, _parent, ctx) => {
    if (node.efxHandled === true) return
    if (node.efxThrows === undefined && node.efxNeeds === undefined) return
    rewriteReturnType(ctx, node, "Effect.Effect")
  }
}
```

- [ ] **Step 5: Implement `effect` declarations**

`src/compiler/transform/effect.ts`:

```ts
/**
 * `effect` functions: declarations (this task), blocks/arrows/methods (Task 6).
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk, walkChildren } from "../walk.ts"
import type { HandlerGroup } from "./index.ts"
import { rewriteReturnType } from "./returnType.ts"

/**
 * @since 0.1.0
 * @category utils
 */
export const spanName = (ctx: Ctx, name: string): string =>
  ctx.service === undefined ? name : `${ctx.service}.${name}`

/**
 * Removes a `|>` token (and one following space) and appends `text` right after the previous item.
 *
 * @since 0.1.0
 * @category utils
 */
export const removePipeOp = (
  ctx: Ctx,
  previousEnd: number,
  op: { readonly start: number; readonly end: number },
  text: string
): void => {
  ctx.s.appendLeft(previousEnd, text)
  ctx.s.remove(op.start, ctx.source[op.end] === " " ? op.end + 1 : op.end)
}

/**
 * `} |> a |> b` → `}<leading>, a, b)`. Walks each pipe in the current (outer) context.
 *
 * @since 0.1.0
 * @category utils
 */
export const attachPipesAsArguments = (ctx: Ctx, node: Node, end: number, leading: string): void => {
  const pipes: Array<Node> = node.efxPipes ?? []
  const ops: Array<{ readonly start: number; readonly end: number }> = node.efxPipeOps ?? []
  if (pipes.length === 0) {
    ctx.s.prependLeft(end, `${leading})`)
    return
  }
  let previousEnd = end
  pipes.forEach((pipe, i) => {
    removePipeOp(ctx, previousEnd, ops[i]!, i === 0 ? `${leading},` : ",")
    walk(pipe, node, ctx)
    previousEnd = pipe.end
  })
  ctx.s.prependLeft(previousEnd, ")")
}

/**
 * @since 0.1.0
 * @category utils
 */
export const lastEnd = (node: Node): number => {
  const pipes: Array<Node> = node.efxPipes ?? []
  return pipes.length > 0 ? pipes[pipes.length - 1]!.end : node.end
}

const effectDeclaration: Handler = (node, parent, ctx) => {
  if (node.efx?.kind !== "declaration") return
  if (node.type === "TSDeclareFunction") {
    ctx.diagnostics.push(diagnosticError("EFX2005", "An `effect` declaration needs a body", node.start, node.end))
    return true
  }
  const name: string = node.id.name
  const exportDefault = node.efx.exportDefault === true
  const keyword: { start: number; end: number } = node.efx.keyword
  const head = `const ${name} = Effect.fn(${JSON.stringify(spanName(ctx, name))})(function*`
  ctx.imports.need("effect", "Effect")
  const start = exportDefault ? parent!.start : keyword.start
  if (/^\s*$/.test(ctx.source.slice(keyword.end, node.id.start))) {
    ctx.s.update(start, node.id.end, head)
  } else {
    ctx.s.update(start, keyword.end, head)
    ctx.s.remove(node.id.start, node.id.end)
  }
  rewriteReturnType(ctx, node.returnType, "Effect.fn.Return")
  const frame = makeFrame(node, "declaration")
  withEffect(ctx, frame, () => walkChildren(node, ctx, new Set([node.id, ...(node.efxPipes ?? [])])))
  attachPipesAsArguments(ctx, node, node.end, frame.scoped ? ", Effect.scoped" : "")
  if (exportDefault) ctx.s.appendLeft(lastEnd(node), `\nexport default ${name}`)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const effectHandlers: HandlerGroup = {
  FunctionDeclaration: effectDeclaration,
  TSDeclareFunction: effectDeclaration
}
```

- [ ] **Step 6: Implement `await`, concurrency and `throw` statements**

`src/compiler/transform/await.ts`:

```ts
/**
 * Inside `effect` code: `await` → `yield*`, `await [..]`/`await {..}` → concurrent `Effect.all`,
 * `throw e` → `return yield* Effect.fail(e)`.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { skipSpace } from "../parser/scan.ts"
import type { HandlerGroup } from "./index.ts"

/**
 * Whether `yield* x` must be parenthesized where `await x` was.
 *
 * @since 0.1.0
 * @category utils
 */
export const needsParens = (node: Node, parent: Node | undefined): boolean => {
  if (parent === undefined) return false
  switch (parent.type) {
    case "BinaryExpression":
    case "LogicalExpression":
    case "UnaryExpression":
    case "AwaitExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
      return true
    case "MemberExpression":
      return parent.object === node
    case "CallExpression":
    case "NewExpression":
      return parent.callee === node
    case "TaggedTemplateExpression":
      return parent.tag === node
    case "ConditionalExpression":
      return parent.test === node
    default:
      return false
  }
}

/**
 * @since 0.1.0
 * @category utils
 */
export const isParenthesized = (source: string, node: Node): boolean => {
  let before = node.start - 1
  while (before >= 0 && /\s/.test(source[before]!)) before--
  return source[before] === "(" && source[skipSpace(source, node.end)] === ")"
}

/**
 * Wraps `[start, end)` in parentheses when the replacement binds looser than the original.
 *
 * @since 0.1.0
 * @category utils
 */
export const parenthesizeIfNeeded = (ctx: Ctx, node: Node, parent: Node | undefined): void => {
  if (needsParens(node, parent) && !isParenthesized(ctx.source, node)) {
    ctx.s.appendRight(node.start, "(")
    ctx.s.prependLeft(node.end, ")")
  }
}

const awaitExpression: Handler = (node, parent, ctx) => {
  if (ctx.effect === undefined) return
  parenthesizeIfNeeded(ctx, node, parent)
  const argument: Node = node.argument
  if (argument.type === "ArrayExpression" || argument.type === "ObjectExpression") {
    ctx.imports.need("effect", "Effect")
    ctx.s.update(node.start, argument.start, "yield* Effect.all(")
    ctx.s.prependLeft(argument.end, ", { concurrency: \"unbounded\" })")
  } else {
    ctx.s.update(node.start, node.start + 5, "yield*")
  }
}

const throwStatement: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) return
  const argument: Node = node.argument
  if (
    argument.type === "NewExpression" && argument.callee.type === "Identifier" &&
    ctx.analysis.localErrors.has(argument.callee.name)
  ) {
    ctx.s.update(node.start, node.start + 5, "return yield*")
  } else {
    ctx.imports.need("effect", "Effect")
    ctx.s.update(node.start, argument.start, "return yield* Effect.fail(")
    ctx.s.prependLeft(argument.end, ")")
  }
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const awaitHandlers: HandlerGroup = {
  AwaitExpression: awaitExpression,
  ThrowStatement: throwStatement
}
```

In `src/compiler/transform/index.ts`, replace `export const handlers = registry()` with:

```ts
import { awaitHandlers } from "./await.ts"
import { effectHandlers } from "./effect.ts"
import { returnTypeHandlers } from "./returnType.ts"

/**
 * @since 0.1.0
 * @category handlers
 */
export const handlers = registry(effectHandlers, awaitHandlers, returnTypeHandlers)
```

(Place the imports at the top of the file. Importing `type HandlerGroup` from `./index.ts` in the
transform modules is type-only, so it creates no runtime cycle.)

- [ ] **Step 7: Run all core tests**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS. That includes `typecheck.test.ts` (the eight outputs type-check) and
`superset.test.ts` (still byte-identical).

If a golden diff is whitespace-only *and* the produced output is equally idiomatic, fix the
transform to match the golden. Goldens are the contract, so don't edit them to match the code. The
one exception is when the golden itself is wrong TypeScript: then fix the golden and say so in the
commit message.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): compile effect declarations, await, throw and throws/needs"
```

---

### Task 6: Transform: `effect` blocks, arrows, object methods (+ diagnostics EFX2001–2005)

**Files:**
- Modify: `src/compiler/transform/effect.ts`
- Create fixtures: `test/fixtures/effect/blocks.efx`, `test/fixtures/effect/blocks.ts`
- Test: `test/transform.test.ts` (new; inline cases that don't need type-checking),
  `test/diagnostics.test.ts` (new)

**Interfaces:**
- Consumes: `spanName`, `rewriteReturnType`, `makeFrame`, `withEffect`, `withNamespace`, `walk`,
  `walkChildren`, and `containsThis`.
- Produces:
  - `effectHandlers` extended with `EffectBlock`, `ArrowFunctionExpression`, `Property`,
    `MethodDefinition`, `TSDeclareMethod`, and `ExpressionStatement`.
  - `EffectBlock` honors `node.efxLayerConstructor === true`: it is never scoped, because the
    layer owns the scope. Task 14 sets the flag.
  - Test helper `ts(source, options?)` in `test/transform.test.ts`, returning
    `toTypeScript(...).code` and failing on diagnostics.

- [ ] **Step 1: Write the failing tests and fixtures**

`test/fixtures/effect/blocks.efx`:

```ts
declare const task: Effect.Effect<number>

export const program = effect {
  const n = await task
  return n + 1
}

class Counter {
  count = 0
  readonly increment = effect {
    this.count++
    return this.count
  }
}

export const add = effect (n: number) => (await task) + n
export const addAll = effect (xs: ReadonlyArray<number>): number => {
  let total = 0
  for (const x of xs) total += x + (await task)
  return total
}
export const typed = effect (s: string): string throws never => s.trim()

export const api = {
  effect fetch(id: string) {
    return id.length + (await task)
  },
  plain() {
    return 1
  }
}
```

`test/fixtures/effect/blocks.ts`:

```ts
import { Effect } from "effect"
declare const task: Effect.Effect<number>

export const program = Effect.gen(function*() {
  const n = yield* task
  return n + 1
})

class Counter {
  count = 0
  readonly increment = Effect.gen({ self: this }, function*() {
    this.count++
    return this.count
  })
}

export const add = Effect.fnUntraced(function*(n: number) { return (yield* task) + n })
export const addAll = Effect.fnUntraced(function*(xs: ReadonlyArray<number>): Effect.fn.Return<number> {
  let total = 0
  for (const x of xs) total += x + (yield* task)
  return total
})
export const typed = Effect.fnUntraced(function*(s: string): Effect.fn.Return<string, never> { return s.trim() })

export const api = {
  fetch: Effect.fn("fetch")(function*(id: string) {
    return id.length + (yield* task)
  }),
  plain() {
    return 1
  }
}
```

`test/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { type CompileOptions, toTypeScript } from "../src/compiler/index.ts"

export const ts = (source: string, options: CompileOptions = {}): string => {
  const result = toTypeScript(source, options)
  if (result.diagnostics.length > 0) throw new Error(result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"))
  return result.code
}

describe("effect expressions", () => {
  it("compiles single-parameter effect arrows", () => {
    expect(ts("const single = effect n => n * 2\n"))
      .toBe("import { Effect } from \"effect\"\nconst single = Effect.fnUntraced(function*(n) { return n * 2 })\n")
  })

  it("compiles parenthesized object bodies", () => {
    expect(ts("const f = effect () => ({ a: 1 })\n"))
      .toBe("import { Effect } from \"effect\"\nconst f = Effect.fnUntraced(function*() { return ({ a: 1 }) })\n")
  })

  it("uses fnUntraced for computed effect methods", () => {
    expect(ts("const k = \"x\"\nconst o = { effect [k](n: number) { return n } }\n"))
      .toBe("import { Effect } from \"effect\"\nconst k = \"x\"\nconst o = { [k]: Effect.fnUntraced(function*(n: number) { return n }) }\n")
  })

  it("effect arrows inside plain functions are still effects", () => {
    expect(ts("function plain() {\n  return effect (n: number) => n\n}\n"))
      .toBe("import { Effect } from \"effect\"\nfunction plain() {\n  return Effect.fnUntraced(function*(n: number) { return n })\n}\n")
  })

  it("nests effect arrows inside effect declarations", () => {
    expect(ts("effect outer() {\n  const inner = effect (n: number) => n\n  return yield_(inner)\n}\n"))
      .toBe(
        "import { Effect } from \"effect\"\nconst outer = Effect.fn(\"outer\")(function*() {\n  const inner = Effect.fnUntraced(function*(n: number) { return n })\n  return yield_(inner)\n})\n"
      )
  })
})
```

`test/diagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { toTypeScript } from "../src/compiler/index.ts"

const codes = (source: string) => toTypeScript(source).diagnostics.map((d) => d.code)

describe("effect diagnostics", () => {
  it("EFX2001: effect arrows cannot use this", () => {
    expect(codes("class A { x = 1; f = effect () => this.x }\n")).toEqual(["EFX2001"])
  })

  it("EFX2002: effect class methods are not supported yet", () => {
    expect(codes("class A {\n  effect m() { return 1 }\n}\n")).toEqual(["EFX2002"])
  })

  it("EFX2003: unused effect block statement", () => {
    expect(codes("effect {\n  1\n}\n")).toEqual(["EFX2003"])
  })

  it("EFX2005: effect declaration without body", () => {
    expect(codes("effect f(): void\n")).toEqual(["EFX2005"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/transform.test.ts packages/effectscript/core/test/diagnostics.test.ts packages/effectscript/core/test/compile.test.ts`
Expected: FAIL. `effect`/`=>`/`EffectBlock` text is left unchanged.

- [ ] **Step 3: Implement the handlers**

In `src/compiler/transform/effect.ts`, extend the imports:

```ts
import { containsThis, type Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { skipSpace } from "../parser/scan.ts"
```

and add these handlers above `effectHandlers`:

```ts
const effectBlock: Handler = (node, parent, ctx) => {
  if (parent?.type === "ExpressionStatement") {
    ctx.diagnostics.push(
      diagnosticError("EFX2003", "This effect is created but never used", node.start, node.keyword.end, "did you mean `main { … }`?")
    )
  }
  ctx.imports.need("effect", "Effect")
  const head = containsThis(node.body) ? "Effect.gen({ self: this }, function*() " : "Effect.gen(function*() "
  ctx.s.update(node.start, node.body.start, head)
  const frame = makeFrame(node, "block", node.efxLayerConstructor === true)
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  if (frame.scoped && !frame.layerConstructor) {
    ctx.s.appendRight(node.start, "Effect.scoped(")
    ctx.s.prependLeft(node.end, "))")
  } else {
    ctx.s.prependLeft(node.end, ")")
  }
  return true
}

const effectArrow: Handler = (node, _parent, ctx) => {
  if (node.efx?.kind !== "arrow") return
  const keyword: { start: number; end: number } = node.efx.keyword
  if (containsThis(node.body)) {
    ctx.diagnostics.push(
      diagnosticError("EFX2001", "`effect` arrows cannot use `this`", keyword.start, keyword.end, "use an `effect { … }` block or an `effect` method")
    )
  }
  ctx.imports.need("effect", "Effect")
  const params: Array<Node> = node.params
  if (ctx.source[skipSpace(ctx.source, keyword.end)] === "(") {
    ctx.s.update(keyword.start, node.start, "Effect.fnUntraced(function*")
  } else {
    ctx.s.update(keyword.start, params[0]!.start, "Effect.fnUntraced(function*(")
    ctx.s.appendLeft(params[0]!.end, ")")
  }
  rewriteReturnType(ctx, node.returnType, "Effect.fn.Return")
  const searchFrom: number = node.returnType?.end ?? (params.length > 0 ? params[params.length - 1]!.end : node.start)
  const arrow = ctx.source.indexOf("=>", searchFrom)
  const expressionBody = node.body.type !== "BlockStatement"
  if (expressionBody) ctx.s.update(arrow, arrow + 2, "{ return")
  else ctx.s.remove(arrow, node.body.start)
  const frame = makeFrame(node, "arrow")
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walkChildren(node, ctx)))
  const close = frame.scoped ? ", Effect.scoped)" : ")"
  ctx.s.prependLeft(node.end, expressionBody ? ` }${close}` : close)
  return true
}

const effectProperty: Handler = (node, _parent, ctx) => {
  if (node.efxMethod !== true) return
  const fn: Node = node.value
  ctx.imports.need("effect", "Effect")
  const keyStart = node.computed ? ctx.source.lastIndexOf("[", node.key.start) : node.key.start
  ctx.s.remove(fn.efx.keyword.start, keyStart)
  const name: string | undefined = node.computed
    ? undefined
    : node.key.type === "Identifier"
    ? node.key.name
    : String(node.key.value)
  ctx.s.appendRight(
    fn.start,
    name === undefined ? ": Effect.fnUntraced(function*" : `: Effect.fn(${JSON.stringify(spanName(ctx, name))})(function*`
  )
  rewriteReturnType(ctx, fn.returnType, "Effect.fn.Return")
  if (node.computed) walk(node.key, node, ctx)
  const frame = makeFrame(fn, "method")
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(fn, node, ctx)))
  ctx.s.prependLeft(fn.end, frame.scoped ? ", Effect.scoped)" : ")")
  return true
}

const effectClassMember: Handler = (node, _parent, ctx) => {
  if (node.efx?.kind !== "method") return
  ctx.diagnostics.push(
    diagnosticError(
      "EFX2002",
      "`effect` class methods are not supported yet",
      node.efx.keyword.start,
      node.efx.keyword.end,
      "use a property: `name = effect (…) => { … }`, or a `service`"
    )
  )
}
```

Then replace `effectHandlers` with:

```ts
export const effectHandlers: HandlerGroup = {
  FunctionDeclaration: effectDeclaration,
  TSDeclareFunction: effectDeclaration,
  EffectBlock: effectBlock,
  ArrowFunctionExpression: effectArrow,
  Property: effectProperty,
  MethodDefinition: effectClassMember,
  TSDeclareMethod: effectClassMember
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS, including `typecheck.test.ts` with the new `blocks.ts` and the superset test.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): compile effect blocks, arrows and object methods"
```

---

### Task 7: `try` / `catch` / `finally` inside `effect`

**Files:**
- Modify: `src/compiler/parser/plugin.ts` (multiple catch clauses)
- Modify: `src/compiler/walk.ts` (add `walkInScopeOf`)
- Create: `src/compiler/transform/try.ts`
- Modify: `src/compiler/transform/index.ts` (register `tryHandlers` **before** `awaitHandlers`)
- Create fixtures: `test/fixtures/try/catch.efx` and `test/fixtures/try/catch.ts`
- Test: `test/runtime.test.ts`, `test/diagnostics.test.ts`, `test/parser.test.ts` (append)

**Interfaces:**
- Consumes: Task 5 and 6 helpers (`withEffect`, `walk`, `containsThis`).
- Produces:
  - `TryStatement.handlers: Array<CatchClause>`. `handler` is still `handlers[0] ?? null`.
  - `walkInScopeOf(scopeNode, node, parent, ctx)`, which walks `node` with `ctx.scope` set to the
    scope recorded for `scopeNode`.
  - From `try.ts`: `isEffectful(node)`, `containsAtLevel(node, predicate)`, `alwaysExits(node)`,
    and `findCrossingJump(node)`, all reused by Tasks 8 and 9.
  - Diagnostics:
    - EFX2020: mixed returns in an effectful `try`
    - EFX2021: `break`/`continue` crossing the boundary, or `return` in `finally`
    - EFX2022: a typed catch or several catch clauses on a plain (non-effectful) `try` inside
      `effect`
    - EFX2023: an untyped `catch` that isn't the last clause
    - EFX2024: several `catch` clauses outside `effect`

- [ ] **Step 1: Write the failing tests and fixtures**

Append to `test/parser.test.ts`:

```ts
describe("try statements", () => {
  it("parses multiple typed catch clauses", () => {
    const { program } = ok("try { a } catch (e: A) { b } catch (e: B | C) { c } catch { d } finally { e }\n")
    const statement = program.body[0]
    expect(statement.handlers).toHaveLength(3)
    expect(statement.handler).toBe(statement.handlers[0])
    expect(statement.handlers[2].param).toBeNull()
    expect(statement.finalizer.type).toBe("BlockStatement")
  })
})
```

`test/fixtures/try/catch.efx`:

```ts
import { Data } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{}> {}
class Timeout extends Data.TaggedError("Timeout")<{}> {}

declare const load: (id: string) => Effect.Effect<string, NotFound | Timeout | Error>

effect withFallback(id: string) {
  try {
    return await load(id)
  } catch (e: NotFound) {
    return "missing"
  } catch (e: Timeout) {
    return "slow"
  } catch (e) {
    return `failed: ${String(e)}`
  }
}

effect logged(id: string) {
  let result = "none"
  try {
    result = await load(id)
  } catch (e: NotFound | Timeout) {
    result = e._tag
  } finally {
    await Effect.log("done")
  }
  return result
}

effect plain(json: string) {
  try {
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
}
```

`test/fixtures/try/catch.ts`:

```ts
import { Data, Effect } from "effect"

class NotFound extends Data.TaggedError("NotFound")<{}> {}
class Timeout extends Data.TaggedError("Timeout")<{}> {}

declare const load: (id: string) => Effect.Effect<string, NotFound | Timeout | Error>

const withFallback = Effect.fn("withFallback")(function*(id: string) {
  return yield* Effect.gen(function*() {
    return yield* load(id)
  }).pipe(Effect.catchTags({ NotFound: (e) => Effect.gen(function*() {
    return "missing"
  }), Timeout: (e) => Effect.gen(function*() {
    return "slow"
  }) }), Effect.catch((e) => Effect.gen(function*() {
    return `failed: ${String(e)}`
  })))
})

const logged = Effect.fn("logged")(function*(id: string) {
  let result = "none"
  yield* Effect.gen(function*() {
    result = yield* load(id)
  }).pipe(Effect.catchTag(["NotFound", "Timeout"], (e) => Effect.gen(function*() {
    result = e._tag
  })), Effect.ensuring(Effect.gen(function*() {
    yield* Effect.log("done")
  })))
  return result
})

const plain = Effect.fn("plain")(function*(json: string) {
  try {
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
})
```

Append to `test/runtime.test.ts` (inside the `describe`):

```ts
  it("effectful try/catch catches typed failures in clause order and runs finally", async () => {
    const mod = await runCompiled(`
      import { Data, Effect } from "effect"
      class A extends Data.TaggedError("A")<{}> {}
      class B extends Data.TaggedError("B")<{}> {}
      const fail = (tag: "A" | "B" | "C"): Effect.Effect<string, A | B | "C"> =>
        tag === "A" ? Effect.fail(new A()) : tag === "B" ? Effect.fail(new B()) : Effect.fail("C" as const)
      export const order: Array<string> = []
      effect handle(tag: "A" | "B" | "C") {
        try {
          return await fail(tag)
        } catch (e: A) {
          return "a"
        } catch (e: B) {
          return "b"
        } catch (e) {
          return "other"
        } finally {
          order.push(tag)
        }
      }
      effect parse(s: string) {
        try {
          return JSON.parse(s) as string
        } catch {
          return "bad json"
        }
      }
      export const results = (["A", "B", "C"] as const).map((t) => Effect.runSync(handle(t)))
      export const parsed = Effect.runSync(parse("{"))
    `)
    expect(mod.results).toEqual(["a", "b", "other"])
    expect(mod.order).toEqual(["A", "B", "C"])
    expect(mod.parsed).toBe("bad json")
  })
```

Append to `test/diagnostics.test.ts`:

```ts
describe("try diagnostics", () => {
  it("EFX2020: mixed returns", () => {
    expect(codes("effect f(x: Effect.Effect<number>) {\n  try {\n    if (Math.random()) return await x\n    await x\n  } catch {\n    return 0\n  }\n  return 1\n}\n"))
      .toEqual(["EFX2020"])
  })

  it("EFX2021: break crossing the try boundary", () => {
    expect(codes("effect f(x: Effect.Effect<number>) {\n  for (;;) {\n    try {\n      await x\n      break\n    } catch {}\n  }\n}\n"))
      .toEqual(["EFX2021"])
  })

  it("EFX2022: typed catch on a plain try inside effect", () => {
    expect(codes("effect f() {\n  try {\n    JSON.parse(\"1\")\n  } catch (e: SyntaxError) {}\n}\n")).toEqual(["EFX2022"])
  })

  it("EFX2023: untyped catch must be last", () => {
    expect(codes("effect f(x: Effect.Effect<number>) {\n  try {\n    await x\n  } catch (e) {} catch (e: A) {}\n}\n"))
      .toEqual(["EFX2023"])
  })

  it("EFX2024: multiple catch outside effect", () => {
    expect(codes("try {} catch (a) {} catch (b) {}\n")).toEqual(["EFX2024"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/parser.test.ts packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/runtime.test.ts packages/effectscript/core/test/diagnostics.test.ts`
Expected: FAIL. The parser rejects a second `catch`, and the transform leaves `try` unchanged.

- [ ] **Step 3: Parse multiple catch clauses**

Add to `class EfxParser` in `plugin.ts`:

```ts
    parseTryStatement(node: any) {
      this.next()
      node.block = this.parseBlock()
      node.handlers = []
      while (this.type === tt._catch) {
        const clause = this.startNode()
        this.next()
        if (this.eat(tt.parenL)) {
          clause.param = this.parseCatchClauseParam()
        } else {
          clause.param = null
          this.enterScope(0)
        }
        clause.body = this.parseBlock(false)
        this.exitScope()
        node.handlers.push(this.finishNode(clause, "CatchClause"))
      }
      node.handler = node.handlers[0] ?? null
      node.finalizer = this.eat(tt._finally) ? this.parseBlock() : null
      if (node.handler === null && node.finalizer === null) this.raise(node.start, "Missing catch or finally clause")
      return this.finishNode(node, "TryStatement")
    }
```

In `src/compiler/walk.ts`, add:

```ts
/**
 * Walks `node` with the scope recorded for `scopeNode` (e.g. a catch clause body).
 *
 * @since 0.1.0
 * @category traversal
 */
export const walkInScopeOf = (scopeNode: Node, node: Node, parent: Node | undefined, ctx: Ctx): void => {
  const previous = ctx.scope
  const scope = ctx.analysis.scopeOf.get(scopeNode)
  if (scope !== undefined) ctx.scope = scope
  walk(node, parent, ctx)
  ctx.scope = previous
}
```

- [ ] **Step 4: Implement the try transform**

`src/compiler/transform/try.ts`:

```ts
/**
 * Effectful `try` (its block contains `await`/`throw`) → `Effect.gen(…).pipe(catch…, ensuring)`.
 * A plain `try` (no effects inside) keeps JavaScript semantics.
 *
 * @since 0.1.0
 */
import { children, containsThis, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk, walkInScopeOf } from "../walk.ts"
import type { HandlerGroup } from "./index.ts"

const boundaryTypes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "EffectBlock"
])

/**
 * Whether `predicate` holds somewhere in `node` without crossing into nested functions/effects.
 *
 * @since 0.1.0
 * @category utils
 */
export const containsAtLevel = (node: Node, predicate: (node: Node) => boolean): boolean => {
  if (predicate(node)) return true
  if (boundaryTypes.has(node.type) || node.efx !== undefined) return false
  return children(node).some((child) => containsAtLevel(child, predicate))
}

/**
 * @since 0.1.0
 * @category utils
 */
export const isEffectful = (node: Node): boolean =>
  containsAtLevel(node, (n) =>
    n.type === "AwaitExpression" || n.type === "ThrowStatement" || n.type === "ThrowExpression" ||
    n.type === "DeferStatement" || (n.type === "ForOfStatement" && n.await === true))

/**
 * @since 0.1.0
 * @category utils
 */
export const alwaysExits = (node: Node | null | undefined): boolean => {
  if (node === null || node === undefined) return false
  switch (node.type) {
    case "ReturnStatement":
    case "ThrowStatement":
      return true
    case "BlockStatement":
      return node.body.length > 0 && alwaysExits(node.body[node.body.length - 1])
    case "IfStatement":
      return alwaysExits(node.consequent) && alwaysExits(node.alternate)
    default:
      return false
  }
}

const loopTypes = /^(For|ForIn|ForOf|While|DoWhile)Statement$/

/**
 * A `break`/`continue` inside `node` whose target lies outside `node`.
 *
 * @since 0.1.0
 * @category utils
 */
export const findCrossingJump = (
  node: Node,
  loops = 0,
  switches = 0,
  labels: ReadonlySet<string> = new Set()
): Node | undefined => {
  if (boundaryTypes.has(node.type) || node.efx !== undefined) return undefined
  if (node.type === "BreakStatement") {
    if (node.label ? !labels.has(node.label.name) : loops + switches === 0) return node
  }
  if (node.type === "ContinueStatement") {
    if (node.label ? !labels.has(node.label.name) : loops === 0) return node
  }
  const loop = loopTypes.test(node.type) ? 1 : 0
  const isSwitch = node.type === "SwitchStatement" ? 1 : 0
  const nextLabels = node.type === "LabeledStatement" ? new Set([...labels, node.label.name as string]) : labels
  for (const child of children(node)) {
    const found = findCrossingJump(child, loops + loop, switches + isSwitch, nextLabels)
    if (found !== undefined) return found
  }
  return undefined
}

const lastSegment = (name: Node): string => (name.type === "TSQualifiedName" ? name.right.name : name.name)

const tagsOf = (clause: Node): Array<string> | undefined => {
  const annotation: Node | undefined = clause.param?.typeAnnotation?.typeAnnotation
  if (annotation === undefined) return undefined
  const types: Array<Node> = annotation.type === "TSUnionType" ? annotation.types : [annotation]
  return types.every((t) => t.type === "TSTypeReference") ? types.map((t) => lastSegment(t.typeName)) : undefined
}

const paramText = (ctx: Ctx, clause: Node): string => {
  const param: Node | null = clause.param
  if (param === null) return ""
  if (param.type === "Identifier") return param.name
  return ctx.source.slice(param.start, param.typeAnnotation?.start ?? param.end).trim()
}

const isReturn = (n: Node) => n.type === "ReturnStatement"

interface Part {
  readonly bodyStart: number
  readonly open: string
  readonly close: string
}

const tryStatement: Handler = (node, _parent, ctx) => {
  const clauses: Array<Node> = node.handlers ?? (node.handler ? [node.handler] : [])
  if (ctx.effect === undefined) {
    if (clauses.length > 1) {
      ctx.diagnostics.push(
        diagnosticError("EFX2024", "Multiple `catch` clauses are only valid inside `effect` code", clauses[1]!.start, clauses[1]!.start + 5)
      )
    }
    return
  }
  if (!isEffectful(node.block)) {
    const typed = clauses.find((c) => tagsOf(c) !== undefined)
    if (typed !== undefined || clauses.length > 1) {
      const at = typed ?? clauses[1]!
      ctx.diagnostics.push(
        diagnosticError(
          "EFX2022",
          "Typed or multiple `catch` clauses need an effectful `try` (one that uses `await` or `throw`)",
          at.start,
          at.start + 5,
          "a `try` around synchronous code catches JavaScript exceptions; decode with Schema or use Effect.try instead"
        )
      )
    }
    return
  }

  for (const [i, clause] of clauses.entries()) {
    if (tagsOf(clause) === undefined && i < clauses.length - 1) {
      ctx.diagnostics.push(diagnosticError("EFX2023", "An untyped `catch` must be the last clause", clause.start, clause.start + 5))
    }
  }
  for (const part of [node.block, ...clauses.map((c) => c.body)]) {
    const jump = findCrossingJump(part)
    if (jump !== undefined) {
      ctx.diagnostics.push(
        diagnosticError("EFX2021", "`break`/`continue` cannot cross an effectful `try`", jump.start, jump.end)
      )
    }
  }
  if (node.finalizer !== null && containsAtLevel(node.finalizer, isReturn)) {
    ctx.diagnostics.push(diagnosticError("EFX2021", "`return` is not allowed in `finally` inside `effect`", node.finalizer.start, node.finalizer.end))
  }

  const bodies: Array<Node> = [node.block, ...clauses.map((c) => c.body)]
  const anyReturn = bodies.some((b) => containsAtLevel(b, isReturn))
  const allExit = bodies.every((b) => alwaysExits(b))
  if (anyReturn && !allExit) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2020",
        "An effectful `try` must return on every path or on none",
        node.start,
        node.start + 3,
        "move the code after the `try` into each branch, or assign to a variable and return after the `try`"
      )
    )
  }

  ctx.imports.need("effect", "Effect")
  const gen = `Effect.gen(${containsThis(node) ? "{ self: this }, " : ""}function*() `
  ctx.s.update(node.start, node.block.start, `${anyReturn && allExit ? "return " : ""}yield* ${gen}`)

  const typedClauses = clauses.filter((c) => tagsOf(c) !== undefined)
  const grouped = typedClauses.length > 1 && typedClauses.every((c) => tagsOf(c)!.length === 1)
  const parts: Array<Part> = clauses.map((clause) => {
    const tags = tagsOf(clause)
    const handler = `(${paramText(ctx, clause)}) => ${gen}`
    if (tags === undefined) return { bodyStart: clause.body.start, open: `Effect.catch(${handler}`, close: "))" }
    if (grouped) {
      const index = typedClauses.indexOf(clause)
      return {
        bodyStart: clause.body.start,
        open: `${index === 0 ? "Effect.catchTags({ " : ""}${tags[0]}: ${handler}`,
        close: index === typedClauses.length - 1 ? ") })" : ")"
      }
    }
    const tag = tags.length === 1 ? JSON.stringify(tags[0]) : `[${tags.map((t) => JSON.stringify(t)).join(", ")}]`
    return { bodyStart: clause.body.start, open: `Effect.catchTag(${tag}, ${handler}`, close: "))" }
  })
  if (node.finalizer !== null) {
    parts.push({ bodyStart: node.finalizer.start, open: `Effect.ensuring(${gen}`, close: "))" })
  }
  const ends: Array<number> = [node.block.end, ...clauses.map((c) => c.body.end as number)]
  parts.forEach((part, i) => {
    const join = i === 0 ? `).pipe(${part.open}` : `${parts[i - 1]!.close}, ${part.open}`
    ctx.s.update(ends[i]!, part.bodyStart, join)
  })
  ctx.s.appendLeft(node.end, `${parts[parts.length - 1]!.close})`)

  walk(node.block, node, ctx)
  for (const clause of clauses) walkInScopeOf(clause, clause.body, clause, ctx)
  if (node.finalizer !== null) walk(node.finalizer, node, ctx)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const tryHandlers: HandlerGroup = {
  TryStatement: tryStatement
}
```

In `src/compiler/transform/index.ts`, import `tryHandlers` and register:
`export const handlers = registry(effectHandlers, tryHandlers, awaitHandlers, returnTypeHandlers)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS, with `try/catch.ts` matching and type-checking.

If the catch parameter's annotation is not at `param.typeAnnotation`, log
`clause.param` from a parser test. Then adjust `tagsOf` to where acorn-typescript stores it (for
example `clause.param.typeAnnotation` vs `clause.typeAnnotation`) and keep the tests unchanged.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): effectful try/catch/finally with typed and multiple catch clauses"
```

---

### Task 8: Resources: `defer`, `using … await`, `for await`

**Files:**
- Modify: `src/compiler/parser/plugin.ts` (`defer` statement)
- Create: `src/compiler/transform/resources.ts`
- Modify: `src/compiler/transform/index.ts` (register `resourceHandlers` after `tryHandlers`)
- Create fixtures: `test/fixtures/resources/defer.efx` and `test/fixtures/resources/defer.ts`
- Test: `test/runtime.test.ts`, `test/diagnostics.test.ts`, `test/parser.test.ts` (append)

**Interfaces:**
- Consumes: `EffectFrame.scoped` (mutable) and `containsThis`/`findCrossingJump`/`containsAtLevel`
  from `try.ts`.
- Produces:
  - AST `DeferStatement { keyword: {start,end}, argument: Expression | BlockStatement }`.
  - `resourceHandlers: HandlerGroup` covering `DeferStatement`, `VariableDeclaration` (`using`),
    and `ForOfStatement` (`await`).
  - Diagnostics:
    - EFX2010: `break`/`return` inside an effectful `for await`
    - EFX2011: `defer` outside `effect`
    - EFX2012: `for await` without a declaration

- [ ] **Step 1: Write the failing tests and fixtures**

Append to `test/parser.test.ts`:

```ts
describe("defer", () => {
  it("parses defer expressions and blocks, but not defer calls", () => {
    const { program } = ok("effect f() {\n  defer close()\n  defer { cleanup() }\n}\nconst defer = (x: unknown) => x\ndefer(1)\n")
    const [a, b] = program.body[0].body.body
    expect(a.type).toBe("DeferStatement")
    expect(a.argument.type).toBe("CallExpression")
    expect(b.argument.type).toBe("BlockStatement")
    expect(program.body[2].type).toBe("ExpressionStatement")
  })
})
```

`test/fixtures/resources/defer.efx`:

```ts
import { Console, Scope, Stream } from "effect"

declare const acquire: Effect.Effect<{ readonly close: Effect.Effect<void> }, never, Scope.Scope>

export effect useResource() {
  using handle = await acquire
  defer handle.close
  defer {
    globalThis.console.info("sync cleanup")
  }
  return 1
}

export effect sum(numbers: Stream.Stream<number>) {
  let total = 0
  for await (const n of numbers) {
    if (n < 0) continue
    total += n
  }
  return total
}

export const block = effect {
  defer Console.log("bye")
  return 2
}
```

`test/fixtures/resources/defer.ts`:

```ts
import { Console, Scope, Stream, Effect } from "effect"

declare const acquire: Effect.Effect<{ readonly close: Effect.Effect<void> }, never, Scope.Scope>

export const useResource = Effect.fn("useResource")(function*() {
  const handle = yield* acquire
  yield* Effect.addFinalizer(() => handle.close)
  yield* Effect.addFinalizer(() => Effect.sync(() => {
    globalThis.console.info("sync cleanup")
  }))
  return 1
}, Effect.scoped)

export const sum = Effect.fn("sum")(function*(numbers: Stream.Stream<number>) {
  let total = 0
  yield* Stream.runForEach(numbers, (n) => Effect.gen(function*() {
    if (n < 0) return
    total += n
  }))
  return total
})

export const block = Effect.scoped(Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Console.log("bye"))
  return 2
}))
```

(Merged names are appended in the order they are needed, so `Effect` comes after the user's
names.)

Append to `test/runtime.test.ts`:

```ts
  it("defer runs finalizers in reverse order at function exit; for await consumes streams", async () => {
    const mod = await runCompiled(`
      import { Effect, Stream } from "effect"
      export const log: Array<string> = []
      effect run() {
        defer Effect.sync(() => log.push("first-registered"))
        defer { log.push("second-registered") }
        log.push("body")
        return 1
      }
      export const result = Effect.runSync(run())
      effect total() {
        let sum = 0
        for await (const n of Stream.make(1, -2, 3)) {
          if (n < 0) continue
          sum += n
        }
        return sum
      }
      export const summed = Effect.runSync(total())
    `)
    expect(mod.result).toBe(1)
    expect(mod.log).toEqual(["body", "second-registered", "first-registered"])
    expect(mod.summed).toBe(4)
  })
```

Append to `test/diagnostics.test.ts`:

```ts
describe("resource diagnostics", () => {
  it("EFX2010: break inside for await", () => {
    expect(codes("effect f(s: Stream.Stream<number>) {\n  for await (const n of s) {\n    break\n  }\n}\n")).toEqual(["EFX2010"])
  })

  it("EFX2011: defer outside effect", () => {
    expect(codes("function f() {\n  defer close()\n}\n")).toEqual(["EFX2011"])
  })

  it("EFX2012: for await without a declaration", () => {
    expect(codes("effect f(s: Stream.Stream<number>) {\n  let n = 0\n  for await (n of s) {}\n}\n")).toEqual(["EFX2012"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: FAIL. The parser rejects `defer close()` ("Unexpected token"), so the new fixture, the
runtime case, and the diagnostics fail.

- [ ] **Step 3: Parse `defer`**

Add to `class EfxParser` in `plugin.ts`:

```ts
    efxDeferFollows(): boolean {
      if (!this.efxIsWord("defer")) return false
      const next = this.lookahead()
      if (!this.efxSameLine(next)) return false
      return next.type === tt.braceL || next.type === tt.name || next.type === tt._new || next.type === tt._this ||
        next.type === tt.string || next.type === tt.backQuote || next.type === tt._void
    }

    efxParseDefer(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.argument = this.type === tt.braceL ? this.parseBlock() : this.parseExpression()
      this.semicolon()
      return this.finishNode(node, "DeferStatement")
    }
```

and extend `parseStatement` (before the `super` call):

```ts
      if (this.efxDeferFollows()) return this.efxParseDefer()
```

- [ ] **Step 4: Implement the resource transforms**

`src/compiler/transform/resources.ts`:

```ts
/**
 * `defer`, `using x = await e` and `for await` inside `effect` code.
 *
 * @since 0.1.0
 */
import { children, containsThis, type Node } from "../ast.ts"
import { type Handler, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./index.ts"
import { findCrossingJump } from "./try.ts"

const deferStatement: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) {
    ctx.diagnostics.push(diagnosticError("EFX2011", "`defer` is only valid inside `effect` code", node.keyword.start, node.keyword.end))
    return true
  }
  ctx.effect.scoped = true
  ctx.imports.need("effect", "Effect")
  const argument: Node = node.argument
  if (argument.type === "BlockStatement") {
    ctx.s.update(node.start, argument.start, "yield* Effect.addFinalizer(() => Effect.sync(() => ")
    ctx.s.appendLeft(argument.end, "))")
  } else {
    ctx.s.update(node.start, argument.start, "yield* Effect.addFinalizer(() => ")
    ctx.s.appendLeft(argument.end, ")")
  }
  withEffect(ctx, undefined, () => walk(argument, node, ctx))
  return true
}

const usingDeclaration: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined || node.kind !== "using") return
  if (!node.declarations.every((d: Node) => d.init?.type === "AwaitExpression")) return
  ctx.effect.scoped = true
  ctx.s.update(node.start, node.start + 5, "const")
}

const loopTypes = /^(For|ForIn|ForOf|While|DoWhile)Statement$/

/** `continue` statements that target this loop (unlabeled, not inside a nested loop). */
const loopContinues = (node: Node, out: Array<Node> = []): Array<Node> => {
  for (const child of children(node)) {
    if (child.type === "ContinueStatement" && child.label === null) out.push(child)
    else if (!loopTypes.test(child.type) && child.efx === undefined && !/Function|Class|EffectBlock/.test(child.type)) {
      loopContinues(child, out)
    }
  }
  return out
}

const forAwait: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined || node.await !== true) return
  const left: Node = node.left
  if (left.type !== "VariableDeclaration") {
    ctx.diagnostics.push(diagnosticError("EFX2012", "`for await` in `effect` code needs a `const` or `let` declaration", left.start, left.end))
    return true
  }
  const jump = findCrossingJump(node.body)
  const escape = jump?.type === "BreakStatement" ? jump : findReturn(node.body)
  if (escape !== undefined) {
    ctx.diagnostics.push(
      diagnosticError("EFX2010", "`break` and `return` are not supported inside `for await` in `effect` code", escape.start, escape.end, "use `continue`, or collect with Stream operators")
    )
  }
  ctx.imports.need("effect", "Effect")
  ctx.imports.need("effect", "Stream")
  const gen = `Effect.gen(${containsThis(node.body) ? "{ self: this }, " : ""}function*() `
  const id: Node = left.declarations[0].id
  ctx.s.remove(left.start, id.start)
  ctx.s.update(node.start, left.start, "yield* Stream.runForEach(")
  ctx.s.move(node.right.start, node.right.end, left.start)
  ctx.s.appendRight(left.start, ", (")
  ctx.s.update(left.end, node.right.start, `) => ${gen}`)
  ctx.s.remove(node.right.end, node.body.start)
  ctx.s.appendLeft(node.end, "))")
  for (const statement of loopContinues(node.body)) ctx.s.update(statement.start, statement.start + 8, "return")
  walk(node.right, node, ctx)
  walk(node.body, node, ctx)
  return true
}

const findReturn = (node: Node): Node | undefined => {
  if (node.type === "ReturnStatement") return node
  if (/Function|Class|EffectBlock/.test(node.type) || node.efx !== undefined) return undefined
  for (const child of children(node)) {
    const found = findReturn(child)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const resourceHandlers: HandlerGroup = {
  DeferStatement: deferStatement,
  VariableDeclaration: usingDeclaration,
  ForOfStatement: forAwait
}
```

Register in `transform/index.ts`:
`registry(effectHandlers, tryHandlers, resourceHandlers, awaitHandlers, returnTypeHandlers)`.

Also add `"DeferStatement"` to the `isEffectful` predicate in `try.ts`. It is already listed, so
nothing changes there.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): defer, scoped using and for await over streams"
```

---

### Task 9: Proposals: `throw` expressions and `do` expressions

**Files:**
- Modify: `src/compiler/parser/plugin.ts`
- Create: `src/compiler/transform/proposals.ts`
- Modify: `src/compiler/transform/index.ts` (register `proposalHandlers` before `awaitHandlers`)
- Create fixtures: `test/fixtures/proposals/throw-do.efx` and `test/fixtures/proposals/throw-do.ts`
- Test: `test/diagnostics.test.ts`

**Interfaces:**
- Consumes: `isEffectful` and `containsAtLevel` from `try.ts`.
- Produces:
  - AST `ThrowExpression { argument }` and `DoExpression { body: BlockStatement }`.
  - `proposalHandlers: HandlerGroup`.
  - Diagnostic EFX7001: `return`/`break`/`continue` escaping a `do` expression.

- [ ] **Step 1: Write the failing fixture and test**

`test/fixtures/proposals/throw-do.efx`:

```ts
import { Data } from "effect"

class Missing extends Data.TaggedError("Missing")<{}> {}

declare const find: (id: string) => Effect.Effect<string | undefined>

effect required(id: string) {
  const value = (await find(id)) ?? throw new Missing()
  return value
}

const port = Number(process.env["PORT"] ?? throw new Error("PORT is required"))

const size = do {
  const n = port * 2
  if (n > 100) {
    "large"
  } else {
    "small"
  }
}

effect describeId(id: string) {
  const label = do {
    const value = await find(id)
    value === undefined ? "none" : value.toUpperCase()
  }
  return label
}
```

`test/fixtures/proposals/throw-do.ts`:

```ts
import { Data, Effect } from "effect"

class Missing extends Data.TaggedError("Missing")<{}> {}

declare const find: (id: string) => Effect.Effect<string | undefined>

const required = Effect.fn("required")(function*(id: string) {
  const value = (yield* find(id)) ?? (yield* Effect.fail(new Missing()))
  return value
})

const port = Number(process.env["PORT"] ?? (() => { throw new Error("PORT is required") })())

const size = (() => {
  const n = port * 2
  if (n > 100) {
    return "large"
  } else {
    return "small"
  }
})()

const describeId = Effect.fn("describeId")(function*(id: string) {
  const label = (yield* Effect.gen(function*() {
    const value = yield* find(id)
    return value === undefined ? "none" : value.toUpperCase()
  }))
  return label
})
```

Append to `test/diagnostics.test.ts`:

```ts
describe("proposal diagnostics", () => {
  it("EFX7001: return escaping a do expression", () => {
    expect(codes("function f() {\n  const x = do {\n    return 1\n  }\n}\n")).toEqual(["EFX7001"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/diagnostics.test.ts`
Expected: FAIL (parse error at `throw` in expression position).

- [ ] **Step 3: Parse throw and do expressions**

In `plugin.ts`, extend `parseExprAtom` (before the final `super` call):

```ts
      if (this.type === tt._throw) {
        const node = this.startNode()
        this.next()
        node.argument = this.parseMaybeUnary(null, false, false, false)
        return this.finishNode(node, "ThrowExpression")
      }
      if (this.type === tt._do) {
        const node = this.startNode()
        this.next()
        node.body = this.parseBlock()
        return this.finishNode(node, "DoExpression")
      }
```

- [ ] **Step 4: Implement the transforms**

`src/compiler/transform/proposals.ts`:

```ts
/**
 * TC39 throw expressions and do expressions.
 *
 * @since 0.1.0
 */
import { containsThis, type Node } from "../ast.ts"
import { type Ctx, type Handler, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./index.ts"
import { containsAtLevel, findCrossingJump, isEffectful } from "./try.ts"

const throwExpression: Handler = (node, _parent, ctx) => {
  const argument: Node = node.argument
  if (ctx.effect === undefined) {
    ctx.s.update(node.start, argument.start, "(() => { throw ")
    ctx.s.appendLeft(argument.end, " })()")
    return
  }
  if (
    argument.type === "NewExpression" && argument.callee.type === "Identifier" &&
    ctx.analysis.localErrors.has(argument.callee.name)
  ) {
    ctx.s.update(node.start, node.start + 5, "(yield*")
    ctx.s.appendLeft(argument.end, ")")
  } else {
    ctx.imports.need("effect", "Effect")
    ctx.s.update(node.start, argument.start, "(yield* Effect.fail(")
    ctx.s.appendLeft(argument.end, "))")
  }
}

/** Prepends `return ` to the completion statements of a block. */
const returnCompletion = (ctx: Ctx, node: Node | null | undefined): void => {
  if (node === null || node === undefined) return
  switch (node.type) {
    case "ExpressionStatement":
      ctx.s.appendRight(node.start, "return ")
      return
    case "BlockStatement":
      returnCompletion(ctx, node.body[node.body.length - 1])
      return
    case "IfStatement":
      returnCompletion(ctx, node.consequent)
      returnCompletion(ctx, node.alternate)
      return
  }
}

const doExpression: Handler = (node, _parent, ctx) => {
  const escape = containsAtLevel(node.body, (n) => n.type === "ReturnStatement")
    ? node.body
    : findCrossingJump(node.body)
  if (escape !== undefined) {
    ctx.diagnostics.push(
      diagnosticError("EFX7001", "`return`, `break` and `continue` cannot escape a `do` expression", node.start, node.start + 2)
    )
  }
  returnCompletion(ctx, node.body)
  if (ctx.effect !== undefined && isEffectful(node.body)) {
    ctx.imports.need("effect", "Effect")
    ctx.s.update(node.start, node.body.start, `(yield* Effect.gen(${containsThis(node.body) ? "{ self: this }, " : ""}function*() `)
    ctx.s.appendLeft(node.end, "))")
    walk(node.body, node, ctx)
  } else {
    ctx.s.update(node.start, node.body.start, "(() => ")
    ctx.s.appendLeft(node.end, ")()")
    withEffect(ctx, undefined, () => walk(node.body, node, ctx))
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const proposalHandlers: HandlerGroup = {
  ThrowExpression: throwExpression,
  DoExpression: doExpression
}
```

Register: `registry(effectHandlers, tryHandlers, resourceHandlers, proposalHandlers, awaitHandlers, returnTypeHandlers)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): throw expressions and do expressions"
```

---

### Task 10: Pipeline operator `|>` (F# + Hack), `await` over pipelines

**Files:**
- Modify: `src/compiler/parser/plugin.ts` (`parseAwait`, topic `%`, topic depth in
  `efxAttachPipes`)
- Modify: `src/compiler/analyze/scope.ts` (add `localEffects`)
- Create: `src/compiler/transform/pipeline.ts`
- Modify: `src/compiler/transform/effect.ts` (EFX5001 for `%` in declaration pipes)
- Modify: `src/compiler/transform/index.ts` (register `pipelineHandlers` before `awaitHandlers`)
- Create fixtures: `test/fixtures/pipeline/pipes.efx` and `test/fixtures/pipeline/pipes.ts`
- Test: `test/parser.test.ts`, `test/diagnostics.test.ts` (append)

**Interfaces:**
- Consumes: `walk`, `isParenthesized` (from `await.ts`), and `isValueFree`.
- Produces:
  - AST `TopicReference`.
  - `AwaitExpression.argument` may be a `PipelineExpression` when `await x |> f` is written.
  - `ScopeAnalysis.localEffects: Set<string>`: module-level `effect` declaration names.
  - `topicsOf(node): Array<Node>` (excluding nested pipeline right sides) and
    `knownPipeable(ctx, node): boolean`.
  - `pipelineHandlers: HandlerGroup`.
  - Diagnostic EFX5001: Hack topic in declaration pipes.

- [ ] **Step 1: Write the failing tests and fixtures**

Append to `test/parser.test.ts`:

```ts
describe("pipelines and await", () => {
  it("await applies to the whole pipeline", () => {
    const { program } = ok("effect f() {\n  return await a |> g |> h\n}\n")
    const argument = program.body[0].body.body[0].argument
    expect(argument.type).toBe("AwaitExpression")
    expect(argument.argument.type).toBe("PipelineExpression")
  })

  it("parses % as a topic only inside a pipeline right-hand side", () => {
    const { program } = ok("const a = x |> f(%, 1)\nconst b = 7 % 2\n")
    expect(program.body[0].declarations[0].init.right.arguments[0].type).toBe("TopicReference")
    expect(program.body[1].declarations[0].init.operator).toBe("%")
  })
})
```

`test/fixtures/pipeline/pipes.efx`:

```ts
declare const getUserName: (id: string) => Effect.Effect<string, Error>

effect loadUser(id: string) {
  return await getUserName(id)
}

const program = effect {
  return await loadUser("1")
} |> Effect.retry({ times: 3 }) |> Effect.orElseSucceed(() => "anonymous")

const viaLocal = loadUser("2")
  |> Effect.timeout("1 second")
  |> Effect.orDie

const viaPipe = getUserName("3") |> Effect.map((name) => name.length)

const hack = getUserName("4") |> Effect.map(%, (name) => name.trim())

const twice = 21 |> % + %

const mixed = loadUser("5") |> Effect.orDie |> Effect.map(%, (s) => s.length) |> Effect.asVoid

effect awaited() {
  return await loadUser("6") |> Effect.orElseSucceed(() => "none")
}
```

`test/fixtures/pipeline/pipes.ts`:

```ts
import { Effect, pipe } from "effect"
declare const getUserName: (id: string) => Effect.Effect<string, Error>

const loadUser = Effect.fn("loadUser")(function*(id: string) {
  return yield* getUserName(id)
})

const program = Effect.gen(function*() {
  return yield* loadUser("1")
}).pipe(Effect.retry({ times: 3 }), Effect.orElseSucceed(() => "anonymous"))

const viaLocal = loadUser("2").pipe(
  Effect.timeout("1 second"),
  Effect.orDie)

const viaPipe = pipe(getUserName("3"), Effect.map((name) => name.length))

const hack = Effect.map(getUserName("4"), (name) => name.trim())

const twice = pipe(21, ($) => $ + $)

const mixed = pipe(Effect.map(loadUser("5").pipe(Effect.orDie), (s) => s.length), Effect.asVoid)

const awaited = Effect.fn("awaited")(function*() {
  return yield* loadUser("6").pipe(Effect.orElseSucceed(() => "none"))
})
```

Append to `test/diagnostics.test.ts`:

```ts
describe("pipeline diagnostics", () => {
  it("EFX5001: Hack topic in effect declaration pipes", () => {
    expect(codes("effect f() {\n  return 1\n} |> g(%)\n")).toEqual(["EFX5001"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: FAIL (parse errors at `%`, and pipelines left as `|>`).

- [ ] **Step 3: Parser changes**

In `plugin.ts`, add inside `class EfxParser`:

```ts
    // `await x |> f |> g` awaits the whole pipeline.
    parseAwait(forInit: boolean) {
      const node = super.parseAwait(forInit)
      if (this.type !== pipelineToken) return node
      let left = node.argument
      const state = this.efxState()
      while (this.type === pipelineToken) {
        const op = { start: this.start, end: this.end }
        this.next()
        state.pipeDepth++
        const rightStart = this.start
        const rightStartLoc = this.startLoc
        const right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), rightStart, rightStartLoc, pipelineToken.binop, forInit)
        state.pipeDepth--
        const pipe = this.startNodeAt(left.start, left.loc.start)
        pipe.left = left
        pipe.right = right
        pipe.op = op
        left = this.finishNode(pipe, "PipelineExpression")
      }
      node.argument = left
      return this.finishNode(node, "AwaitExpression")
    }
```

In `parseExprAtom`, before the final `super` call:

```ts
      if (this.type === tt.modulo && this.efxState().pipeDepth > 0) {
        const node = this.startNode()
        this.next()
        return this.finishNode(node, "TopicReference")
      }
```

In `efxAttachPipes`, wrap the pipe-expression parse with the topic depth, so `%` parses and can be
reported as EFX5001:

```ts
        const state = this.efxState()
        state.pipeDepth++
        pipes.push(this.parseExprOp(this.parseMaybeUnary(null, false, false, false), start, startLoc, pipelineToken.binop, false))
        state.pipeDepth--
```

- [ ] **Step 4: Record module-level effect declarations in the scope analysis**

In `analyze/scope.ts`:
- Add `readonly localEffects: Set<string>` to `ScopeAnalysis` and create it next to `localErrors`.
- In `visitFunction`, after `if (node.id) scope.values.add(node.id.name)`, add:

```ts
      if (scope === module && node.efx?.kind === "declaration" && node.id) localEffects.add(node.id.name)
```

- Return it: `return { program, module, scopeOf, constInits, localErrors, localEffects }`.

- [ ] **Step 5: Implement the pipeline transform**

`src/compiler/transform/pipeline.ts`:

```ts
/**
 * `|>`: F#-style steps become `.pipe(…)` (known pipeable heads) or `pipe(…)`; Hack-style steps
 * (with `%`) are inlined when safe, otherwise become `($) => rhs` functions inside the pipe.
 *
 * @since 0.1.0
 */
import { isValueFree } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { walk } from "../walk.ts"
import { isParenthesized } from "./await.ts"
import type { HandlerGroup } from "./index.ts"

interface Step {
  readonly op: { readonly start: number; readonly end: number }
  readonly rhs: Node
  readonly topics: ReadonlyArray<Node>
}

interface Current {
  readonly start: number
  readonly end: number
  readonly pipeable: boolean
  readonly node: Node | undefined
}

/**
 * Topic references in `node`, excluding nested pipelines' right-hand sides (they rebind `%`).
 *
 * @since 0.1.0
 * @category utils
 */
export const topicsOf = (node: Node, out: Array<Node> = []): Array<Node> => {
  if (node.type === "TopicReference") {
    out.push(node)
    return out
  }
  if (node.type === "PipelineExpression") return topicsOf(node.left, out)
  for (const child of children(node)) topicsOf(child, out)
  return out
}

const isModuleBinding = (ctx: Ctx, name: string): boolean => {
  for (let scope: typeof ctx.scope | undefined = ctx.scope; scope !== undefined; scope = scope.parent) {
    if (scope.values.has(name)) return scope === ctx.analysis.module
  }
  return false
}

/**
 * Conservative: only expressions that certainly produce a Pipeable (an Effect).
 *
 * @since 0.1.0
 * @category utils
 */
export const knownPipeable = (ctx: Ctx, node: Node, seen: ReadonlySet<string> = new Set()): boolean => {
  switch (node.type) {
    case "EffectBlock":
      return true
    case "CallExpression":
      return node.callee.type === "Identifier" && ctx.analysis.localEffects.has(node.callee.name) &&
        isModuleBinding(ctx, node.callee.name)
    case "Identifier": {
      if (seen.has(node.name) || !isModuleBinding(ctx, node.name)) return false
      const init = ctx.analysis.constInits.get(node.name)
      return init !== undefined && knownPipeable(ctx, init, new Set([...seen, node.name]))
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      return knownPipeable(ctx, node.expression, seen)
    default:
      return false
  }
}

const flatten = (node: Node): { readonly head: Node; readonly steps: Array<Step> } => {
  const steps: Array<Step> = []
  let current = node
  while (current.type === "PipelineExpression") {
    steps.unshift({ op: current.op, rhs: current.right, topics: topicsOf(current.right) })
    current = current.left
  }
  return { head: current, steps }
}

const sideEffectTypes = new Set([
  "CallExpression",
  "NewExpression",
  "AssignmentExpression",
  "UpdateExpression",
  "AwaitExpression",
  "YieldExpression",
  "TaggedTemplateExpression",
  "ImportExpression"
])

const unsafeBefore = (node: Node, topic: Node): boolean => {
  if (node.start >= topic.start) return false
  if (node.end <= topic.start && sideEffectTypes.has(node.type)) return true
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return false
  return children(node).some((child) => unsafeBefore(child, topic))
}

const inlinable = (step: Step): boolean => step.topics.length === 1 && !unsafeBefore(step.rhs, step.topics[0]!)

const simpleTypes = new Set([
  "Identifier",
  "CallExpression",
  "MemberExpression",
  "ThisExpression",
  "Literal",
  "TemplateLiteral",
  "ArrayExpression",
  "EffectBlock"
])

const needsWrapping = (ctx: Ctx, current: Current): boolean =>
  current.node !== undefined && !simpleTypes.has(current.node.type) && !isParenthesized(ctx.source, current.node)

const freshName = (ctx: Ctx): string => {
  for (const name of ["$", "$$", "$$$"]) if (isValueFree(ctx.scope, name)) return name
  return "$topic"
}

/** Replaces the whitespace + `|>` before `step` with `text`, preserving line breaks. */
const joinStep = (ctx: Ctx, previousEnd: number, step: Step, text: string): void => {
  if (ctx.source.slice(previousEnd, step.op.start).includes("\n")) {
    ctx.s.appendLeft(previousEnd, text)
    ctx.s.remove(step.op.start, ctx.source[step.op.end] === " " ? step.op.end + 1 : step.op.end)
  } else {
    ctx.s.update(previousEnd, step.rhs.start, text === "," ? ", " : text)
  }
}

const applyGroup = (ctx: Ctx, current: Current, group: ReadonlyArray<Step>): void => {
  if (current.pipeable) {
    if (needsWrapping(ctx, current)) {
      ctx.s.appendRight(current.start, "(")
      ctx.s.prependLeft(current.end, ")")
    }
  } else {
    ctx.imports.need("effect", "pipe")
    ctx.s.appendRight(current.start, "pipe(")
  }
  let previousEnd = current.end
  group.forEach((step, i) => {
    if (step.topics.length > 0) {
      const name = freshName(ctx)
      ctx.s.appendRight(step.rhs.start, `(${name}) => `)
      for (const topic of step.topics) ctx.s.update(topic.start, topic.end, name)
    }
    joinStep(ctx, previousEnd, step, i === 0 && current.pipeable ? ".pipe(" : ",")
    previousEnd = step.rhs.end
  })
  ctx.s.prependLeft(previousEnd, ")")
}

const inline = (ctx: Ctx, current: Current, step: Step): void => {
  const topic = step.topics[0]!
  if (needsWrapping(ctx, current)) {
    ctx.s.appendRight(current.start, "(")
    ctx.s.prependLeft(current.end, ")")
  }
  ctx.s.remove(current.end, step.rhs.start)
  ctx.s.remove(topic.start, topic.end)
  ctx.s.move(current.start, current.end, topic.start)
}

const pipeline: Handler = (node, _parent, ctx) => {
  const { head, steps } = flatten(node)
  let current: Current = { start: head.start, end: head.end, pipeable: knownPipeable(ctx, head), node: head }
  let i = 0
  while (i < steps.length) {
    const step = steps[i]!
    if (inlinable(step)) {
      inline(ctx, current, step)
      current = { start: step.rhs.start, end: step.rhs.end, pipeable: false, node: step.rhs }
      i++
      continue
    }
    let j = i
    while (j < steps.length && !inlinable(steps[j]!)) j++
    applyGroup(ctx, current, steps.slice(i, j))
    current = { start: current.start, end: steps[j - 1]!.rhs.end, pipeable: false, node: undefined }
    i = j
  }
  walk(head, node, ctx)
  for (const step of steps) walk(step.rhs, node, ctx)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const pipelineHandlers: HandlerGroup = {
  PipelineExpression: pipeline
}
```

In `transform/effect.ts`:
- Add `import { topicsOf } from "./pipeline.ts"`.
- Inside `attachPipesAsArguments`'s `pipes.forEach`, before `walk(pipe, node, ctx)`, add:

```ts
    if (topicsOf(pipe).length > 0) {
      ctx.diagnostics.push(
        diagnosticError("EFX5001", "Hack-style `%` is not allowed in declaration pipes", pipe.start, pipe.end, "pipes after a declaration must be functions, like `retry(…)`")
      )
    }
```

Register: `registry(effectHandlers, tryHandlers, resourceHandlers, proposalHandlers, pipelineHandlers, awaitHandlers, returnTypeHandlers)`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS, with all goldens type-checking. Pay particular attention to `mixed`, where an
edited range is moved.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): pipeline operator with F# and Hack styles"
```

---

### Task 11: Prelude: automatic imports, Effect builtins, bare types, bare service tags

**Files:**
- Create: `scripts/generate-prelude.ts`
- Create (generated, checked in): `src/compiler/prelude/tables.ts`
- Create: `src/compiler/prelude/resolve.ts`, `src/compiler/transform/prelude.ts`
- Modify: `src/compiler/analyze/scope.ts` (record binding identifier nodes)
- Modify: `src/compiler/compile.ts` (the `// @efx no-prelude` directive)
- Modify: `src/compiler/transform/index.ts` (register `preludeHandlers` **last**)
- Modify: `package.json` (`"codegen": "node scripts/generate-prelude.ts && dprint fmt src/compiler/prelude/tables.ts"`)
- Create fixtures: `test/fixtures/prelude/builtins.efx` and `test/fixtures/prelude/builtins.ts`
- Test: `test/transform.test.ts` (append), `test/prelude.test.ts` (new)

**Interfaces:**
- Consumes: `Ctx.namespace` (set to `"Effect"` by effect handlers; Plan 2 will set `"Layer"`,
  `"Schema"`, `"Atom"`, `"Command"`).
- Produces:
  - Generated tables, all keyed by name:
    - `preludeModules: ReadonlyMap<string, string>` (name → module specifier)
    - `preludeFunctions: ReadonlyMap<string, string>`
    - `namespaceExports: ReadonlyMap<string, ReadonlySet<string>>`
    - `bareTypes`, `serviceTags`, and `excludedNames`, each a `ReadonlySet<string>`
  - `resolveValue(ctx, name)` and `resolveType(ctx, name)`, both returning
    `Resolution | undefined`, where
    `Resolution = { module: string; importName: string; prefix: string }`
  - `isBareType(name)` and `isServiceTag(name)`
  - `ScopeAnalysis.bindings: Set<Node>`, the identifier nodes in binding positions
  - `isValueReference(ctx, node, parent)`
  - `preludeHandlers: HandlerGroup`

- [ ] **Step 1: Write the generator**

`scripts/generate-prelude.ts`:

```ts
/**
 * Generates src/compiler/prelude/tables.ts from the workspace `effect` package and the TypeScript
 * standard library. Run with `pnpm codegen` from packages/effectscript/core.
 */
import * as fs from "node:fs"
import * as path from "node:path"

const packageDir = path.resolve(import.meta.dirname, "..")
const effectDir = path.resolve(packageDir, "../../effect")
const read = (file: string): string => fs.readFileSync(file, "utf8")

const namespaceReexports = (indexFile: string): Array<string> =>
  [...read(indexFile).matchAll(/^export \* as (\w+) from "\.\/\w+\.ts"/gm)].map((m) => m[1]!)

const valueExports = (file: string): Set<string> => {
  const text = read(file)
  const names = new Set<string>()
  for (const m of text.matchAll(/^export (?:declare )?(?:const|let|function\*?|class|abstract class) (\w+)/gm)) {
    names.add(m[1]!)
  }
  for (const block of text.matchAll(/^export \{([^}]*)\}/gm)) {
    for (const raw of block[1]!.split(",")) {
      const spec = raw.trim()
      if (spec === "" || spec.startsWith("type ")) continue
      const parts = spec.split(/\s+as\s+/)
      names.add((parts[1] ?? parts[0]!).trim())
    }
  }
  return names
}

const typeExports = (file: string): Set<string> =>
  new Set([...read(file).matchAll(/^export (?:declare )?(?:interface|type|class|abstract class) (\w+)/gm)].map((m) => m[1]!))

// --- modules -----------------------------------------------------------------------------------

const moduleSpecifiers = new Map<string, string>()
const moduleFiles = new Map<string, string>()
for (const name of namespaceReexports(path.join(effectDir, "src/index.ts"))) {
  moduleSpecifiers.set(name, "effect")
  moduleFiles.set(name, path.join(effectDir, "src", `${name}.ts`))
}
const manifest = JSON.parse(read(path.join(effectDir, "package.json"))) as { readonly exports: Record<string, unknown> }
for (const [key, value] of Object.entries(manifest.exports)) {
  if (!/^\.\/[a-z][a-z-]*$/.test(key) || typeof value !== "string" || !value.endsWith("/index.ts")) continue
  const dir = path.dirname(path.join(effectDir, value))
  for (const name of namespaceReexports(path.join(effectDir, value))) {
    if (moduleSpecifiers.has(name)) continue
    moduleSpecifiers.set(name, `effect/${key.slice(2)}`)
    moduleFiles.set(name, path.join(dir, `${name}.ts`))
  }
}

// --- globals that must keep their JavaScript meaning ---------------------------------------------

const reserved = [
  "arguments", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
  "else", "enum", "eval", "export", "extends", "false", "finally", "for", "function", "if", "implements", "import", "in",
  "Infinity", "instanceof", "interface", "let", "NaN", "new", "null", "package", "private", "protected", "public",
  "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "undefined", "var", "void", "while",
  "with", "yield"
]
const web = [
  "AbortController", "AbortSignal", "alert", "Blob", "blur", "close", "closed", "confirm", "crypto", "document",
  "event", "Event", "EventSource", "EventTarget", "fetch", "File", "find", "focus", "FormData", "frames", "Headers",
  "history", "length", "localStorage", "location", "name", "navigator", "open", "origin", "parent", "performance",
  "print", "prompt", "requestAnimationFrame", "Request", "Response", "screen", "scroll", "self", "sessionStorage",
  "status", "stop", "TextDecoder", "TextEncoder", "top", "URL", "URLSearchParams", "WebSocket", "window", "Worker"
]
const globals = new Set<string>([...reserved, ...web])
const tsLib = path.join(packageDir, "node_modules/typescript/lib")
for (const file of fs.readdirSync(tsLib)) {
  if (!/^lib\.(es|decorators).*\.d\.ts$/.test(file)) continue
  const text = read(path.join(tsLib, file))
  for (const m of text.matchAll(/^declare (?:var|let|const|function|class|namespace) (\w+)/gm)) globals.add(m[1]!)
  for (const m of text.matchAll(/^(?:interface|type) (\w+)/gm)) globals.add(m[1]!)
}
const nodeTypes = path.join(packageDir, "node_modules/@types/node")
for (const file of fs.readdirSync(nodeTypes)) {
  if (!file.endsWith(".d.ts")) continue
  for (const block of read(path.join(nodeTypes, file)).matchAll(/declare global \{([\s\S]*?)\n\}/g)) {
    for (const m of block[1]!.matchAll(/^\s*(?:var|let|const|function|class|namespace) (\w+)/gm)) globals.add(m[1]!)
  }
}
for (const name of ["Buffer", "exports", "global", "module", "process", "require", "__dirname", "__filename"]) {
  globals.add(name)
}

// --- tables ------------------------------------------------------------------------------------

const modules = [...moduleSpecifiers].filter(([name]) => !globals.has(name)).sort(([a], [b]) => a.localeCompare(b))
const namespaces: Record<string, string> = {
  Effect: path.join(effectDir, "src/Effect.ts"),
  Layer: path.join(effectDir, "src/Layer.ts"),
  Schema: path.join(effectDir, "src/Schema.ts"),
  Atom: path.join(effectDir, "src/reactivity/Atom.ts"),
  Command: path.join(effectDir, "src/cli/Command.ts")
}
const bareTypes = modules.map(([name]) => name).filter((name) => typeExports(moduleFiles.get(name)!).has(name))
const serviceTags = modules.map(([name]) => name).filter((name) => {
  const text = read(moduleFiles.get(name)!)
  const index = text.search(new RegExp(`^export const ${name}\\b`, "m"))
  return index !== -1 && /Context\.|Service</.test(text.slice(index, index + 400))
})

const out: Array<string> = []
const doc = (text: string) => out.push("/**", ` * ${text}`, " *", " * @since 0.1.0", " */")
const list = (values: ReadonlyArray<string>) => values.map((v) => `  ${v}`).join(",\n")
out.push("/**", " * GENERATED by scripts/generate-prelude.ts from packages/effect. Do not edit by hand.", " *", " * @since 0.1.0", " */", "")
doc("Prelude modules (name → module specifier).")
out.push(`export const preludeModules: ReadonlyMap<string, string> = new Map([\n${list(modules.map(([n, m]) => `[${JSON.stringify(n)}, ${JSON.stringify(m)}]`))}\n])`, "")
doc("Prelude functions (name → module specifier).")
out.push(`export const preludeFunctions: ReadonlyMap<string, string> = new Map([\n${list(["flow", "identity", "pipe"].map((n) => `[${JSON.stringify(n)}, "effect"]`))}\n])`, "")
for (const [namespace, file] of Object.entries(namespaces)) {
  const names = [...valueExports(file)].filter((n) => !globals.has(n)).sort()
  doc(`Value exports of \`${namespace}\` usable as bare builtins.`)
  out.push(`export const ${namespace.toLowerCase()}Exports: ReadonlySet<string> = new Set([\n${list(names.map((n) => JSON.stringify(n)))}\n])`, "")
}
doc("Namespace → builtin names.")
out.push(`export const namespaceExports: ReadonlyMap<string, ReadonlySet<string>> = new Map([\n${list(Object.keys(namespaces).map((n) => `[${JSON.stringify(n)}, ${n.toLowerCase()}Exports]`))}\n])`, "")
doc("Modules whose same-named type exists (`Effect<A>` → `Effect.Effect<A>`).")
out.push(`export const bareTypes: ReadonlySet<string> = new Set([\n${list(bareTypes.map((n) => JSON.stringify(n)))}\n])`, "")
doc("Modules whose same-named export is a service tag (`await FileSystem` → `yield* FileSystem.FileSystem`).")
out.push(`export const serviceTags: ReadonlySet<string> = new Set([\n${list(serviceTags.map((n) => JSON.stringify(n)))}\n])`, "")
doc("Names that always keep their JavaScript meaning.")
out.push(`export const excludedNames: ReadonlySet<string> = new Set([\n${list([...globals].sort().map((n) => JSON.stringify(n)))}\n])`, "")

fs.writeFileSync(path.join(packageDir, "src/compiler/prelude/tables.ts"), out.join("\n"))
```

- [ ] **Step 2: Generate and sanity-check the tables**

Add to `package.json` `scripts`: `"codegen": "node scripts/generate-prelude.ts && dprint fmt src/compiler/prelude/tables.ts"`.
Then:

Run: `pnpm --filter effectscript codegen`
Expected: `src/compiler/prelude/tables.ts` is written. Check it:
- `preludeModules` contains `Effect`, `Schema`, `Layer`, `Option`, `Console`, `FileSystem`,
  `HttpClient → effect/http`, `HttpApi → effect/http-api`, `Command → effect/cli`, and
  `Atom → effect/reactivity`.
- `preludeModules` does **not** contain `Array`, `String`, `Number`, `Record`, `Iterable`, or
  `Request`.
- `serviceTags` contains `FileSystem` and `Path`.
- `bareTypes` contains `Effect`, `Option`, `Stream`, and `Layer`.

If a check fails, fix the generator regexes, not the table.

Write `test/prelude.test.ts` to pin these facts:

```ts
import { describe, expect, it } from "vitest"
import { bareTypes, effectExports, excludedNames, preludeModules, serviceTags } from "../src/compiler/prelude/tables.ts"

describe("prelude tables", () => {
  it("contains core and subpath modules but no JS globals", () => {
    for (const name of ["Effect", "Schema", "Layer", "Option", "Console", "FileSystem", "Stream", "Match", "Data"]) {
      expect(preludeModules.get(name)).toBe("effect")
    }
    expect(preludeModules.get("HttpClient")).toBe("effect/http")
    expect(preludeModules.get("HttpApi")).toBe("effect/http-api")
    expect(preludeModules.get("Command")).toBe("effect/cli")
    expect(preludeModules.get("Atom")).toBe("effect/reactivity")
    for (const name of ["Array", "String", "Number", "Record", "Iterable", "Request"]) expect(preludeModules.has(name)).toBe(false)
  })

  it("knows builtins, bare types and service tags", () => {
    for (const name of ["retry", "timeout", "succeed", "fail", "all", "sleep", "gen", "fn", "orDie"]) expect(effectExports.has(name)).toBe(true)
    for (const name of ["void", "catch", "if", "try"]) expect(effectExports.has(name)).toBe(false)
    for (const name of ["Effect", "Option", "Stream", "Layer", "Exit"]) expect(bareTypes.has(name)).toBe(true)
    for (const name of ["FileSystem", "Path"]) expect(serviceTags.has(name)).toBe(true)
    for (const name of ["fetch", "Promise", "setTimeout", "process", "console"]) expect(excludedNames.has(name)).toBe(true)
  })
})
```

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/prelude.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing transform tests and fixture**

`test/fixtures/prelude/builtins.efx`:

```ts
declare const fetchUser: (id: string) => Effect<string, Error>

export effect profile(id: string): string throws Error {
  const name = await fetchUser(id) |> retry({ times: 2 }) |> orElseSucceed(() => "anonymous")
  await sleep("10 millis")
  const [a, b] = await all([succeed(1), succeed(2)])
  return `${name}:${a + b}`
}

export const delays = Schedule.exponential("10 millis")

const local = (retry: number) => retry + 1
const map = new Map<string, number>()

export type User = { readonly id: Option<string> }
export const parsed: Effect<number> = succeed(local(1) + map.size)

export effect readConfig(path: string) {
  const fs = await FileSystem
  return await fs.readFileString(path)
}
```

`test/fixtures/prelude/builtins.ts`:

```ts
import { Effect, FileSystem, Option, Schedule, pipe } from "effect"
declare const fetchUser: (id: string) => Effect.Effect<string, Error>

export const profile = Effect.fn("profile")(function*(id: string): Effect.fn.Return<string, Error> {
  const name = yield* pipe(fetchUser(id), Effect.retry({ times: 2 }), Effect.orElseSucceed(() => "anonymous"))
  yield* Effect.sleep("10 millis")
  const [a, b] = yield* Effect.all([Effect.succeed(1), Effect.succeed(2)])
  return `${name}:${a + b}`
})

export const delays = Schedule.exponential("10 millis")

const local = (retry: number) => retry + 1
const map = new Map<string, number>()

export type User = { readonly id: Option.Option<string> }
export const parsed: Effect.Effect<number> = Effect.succeed(local(1) + map.size)

export const readConfig = Effect.fn("readConfig")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path)
})
```

Append to `test/transform.test.ts`:

```ts
describe("prelude", () => {
  it("adds no imports when nothing from the prelude is used", () => {
    const source = "export const a = [1].map((n) => n)\nexport const r = fetch(\"/\")\nexport const s = String(1)\n"
    expect(ts(source)).toBe(source)
  })

  it("respects the no-prelude directive", () => {
    const source = "// @efx no-prelude\nexport const a = succeed(1)\n"
    expect(ts(source)).toBe(source)
  })

  it("keeps shadowed names", () => {
    const source = "const succeed = (n: number) => n\nexport const a = succeed(1)\n"
    expect(ts(source)).toBe(source)
  })

  it("expands shorthand builtins", () => {
    expect(ts("export const api = { retry }\n")).toBe("import { Effect } from \"effect\"\nexport const api = { retry: Effect.retry }\n")
  })

  it("imports a module referenced only in types", () => {
    expect(ts("export declare const x: Stream.Stream<number>\n"))
      .toBe("import { Stream } from \"effect\"\nexport declare const x: Stream.Stream<number>\n")
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/transform.test.ts packages/effectscript/core/test/compile.test.ts`
Expected: FAIL for the prelude cases and `prelude/builtins.efx`.

- [ ] **Step 5: Record binding identifiers in the scope analysis**

In `analyze/scope.ts`:
- Add `readonly bindings: Set<Node>` to `ScopeAnalysis`.
- Create `const bindings = new Set<Node>()` in `analyze`.
- Change `patternNames` to also collect nodes. Give it a third parameter
  `nodes?: Set<Node>`, and in the `"Identifier"` case add `nodes?.add(pattern)`. Thread `nodes`
  through the recursive calls.
- Pass `bindings` at every declaration site in `analyze`:
  - **Variable declarators:** `patternNames(declarator.id, [], bindings)`.
  - **Function params:** `patternNames(param, [], bindings)`.
  - **Catch params:** `patternNames(node.param, [], bindings)`.
  - **Declaration names:** for function, class, `import` specifiers (`specifier.local`), enum,
    namespace, type alias, and interface ids, call `bindings.add(<id node>)` next to the existing
    `scope.values.add` / `scope.types.add` calls.
- Return `bindings` in the result object.

- [ ] **Step 6: Implement resolution and handlers**

`src/compiler/prelude/resolve.ts`:

```ts
/**
 * @since 0.1.0
 */
import { isTypeFree, isValueFree } from "../analyze/scope.ts"
import type { Ctx } from "../context.ts"
import { bareTypes, excludedNames, namespaceExports, preludeFunctions, preludeModules, serviceTags } from "./tables.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface Resolution {
  readonly module: string
  readonly importName: string
  readonly prefix: string
}

/**
 * Resolves a free value identifier against the construct namespace, prelude modules, prelude
 * functions and Effect builtins (in that order).
 *
 * @since 0.1.0
 * @category resolution
 */
export const resolveValue = (ctx: Ctx, name: string): Resolution | undefined => {
  if (!ctx.options.prelude || excludedNames.has(name) || !isValueFree(ctx.scope, name)) return undefined
  if (ctx.namespace !== "Effect" && namespaceExports.get(ctx.namespace)?.has(name) === true) {
    return { module: preludeModules.get(ctx.namespace)!, importName: ctx.namespace, prefix: `${ctx.namespace}.` }
  }
  const module = preludeModules.get(name)
  if (module !== undefined) return { module, importName: name, prefix: "" }
  const fn = preludeFunctions.get(name)
  if (fn !== undefined) return { module: fn, importName: name, prefix: "" }
  if (namespaceExports.get("Effect")!.has(name)) return { module: "effect", importName: "Effect", prefix: "Effect." }
  return undefined
}

/**
 * @since 0.1.0
 * @category resolution
 */
export const resolveType = (ctx: Ctx, name: string): Resolution | undefined => {
  if (!ctx.options.prelude || excludedNames.has(name) || !isTypeFree(ctx.scope, name)) return undefined
  const module = preludeModules.get(name)
  return module === undefined ? undefined : { module, importName: name, prefix: "" }
}

/**
 * @since 0.1.0
 * @category resolution
 */
export const isBareType = (name: string): boolean => bareTypes.has(name)

/**
 * @since 0.1.0
 * @category resolution
 */
export const isServiceTag = (name: string): boolean => serviceTags.has(name)
```

`src/compiler/transform/prelude.ts`:

```ts
/**
 * Free identifiers → prelude imports and Effect builtins; bare data types; bare service tags.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { isBareType, isServiceTag, resolveType, resolveValue } from "../prelude/resolve.ts"
import type { HandlerGroup } from "./index.ts"

const keyParents = new Set([
  "Property",
  "PropertyDefinition",
  "MethodDefinition",
  "TSDeclareMethod",
  "TSAbstractMethodDefinition",
  "TSAbstractPropertyDefinition",
  "TSPropertySignature",
  "TSMethodSignature",
  "AccessorProperty"
])
const nonReferenceParents = new Set([
  "LabeledStatement",
  "BreakStatement",
  "ContinueStatement",
  "ImportSpecifier",
  "ImportDefaultSpecifier",
  "ImportNamespaceSpecifier",
  "ExportSpecifier",
  "ExportAllDeclaration",
  "MetaProperty"
])
const tsExpressionParents = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSTypeQuery",
  "TSExportAssignment",
  "TSInstantiationExpression"
])

/**
 * @since 0.1.0
 * @category utils
 */
export const isValueReference = (ctx: Ctx, node: Node, parent: Node | undefined): boolean => {
  if (parent === undefined || ctx.analysis.bindings.has(node)) return false
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return false
  if (keyParents.has(parent.type) && parent.key === node && !parent.computed) return false
  if (nonReferenceParents.has(parent.type)) return false
  if (parent.type.startsWith("TS") && !tsExpressionParents.has(parent.type)) return false
  return true
}

const identifier: Handler = (node, parent, ctx) => {
  if (!isValueReference(ctx, node, parent)) return
  const resolution = resolveValue(ctx, node.name)
  if (resolution === undefined) return
  ctx.imports.need(resolution.module, resolution.importName)
  if (resolution.prefix !== "") {
    const shorthand = parent?.type === "Property" && parent.shorthand === true && parent.value === node
    ctx.s.appendRight(node.start, shorthand ? `${node.name}: ${resolution.prefix}` : resolution.prefix)
  } else if (
    ctx.effect !== undefined && parent?.type === "AwaitExpression" && parent.argument === node && isServiceTag(node.name)
  ) {
    ctx.s.appendLeft(node.end, `.${node.name}`)
  }
}

const typeReference: Handler = (node, _parent, ctx) => {
  const typeName: Node = node.typeName
  if (typeName.type !== "Identifier" || !isBareType(typeName.name)) return
  const resolution = resolveType(ctx, typeName.name)
  if (resolution === undefined) return
  ctx.imports.need(resolution.module, resolution.importName)
  ctx.s.appendRight(typeName.start, `${typeName.name}.`)
}

const qualifiedName: Handler = (node, _parent, ctx) => {
  let left: Node = node.left
  while (left.type === "TSQualifiedName") left = left.left
  if (left.type === "Identifier") {
    const resolution = resolveType(ctx, left.name)
    if (resolution !== undefined) ctx.imports.need(resolution.module, resolution.importName)
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const preludeHandlers: HandlerGroup = {
  Identifier: identifier,
  TSTypeReference: typeReference,
  TSQualifiedName: qualifiedName
}
```

In `compile.ts`, honor the directive. Replace `const resolved = resolveOptions(options)` with:

```ts
  const base = resolveOptions(options)
  const resolved = /^\s*\/\/\s*@efx\s+no-prelude\b/m.test(source) ? { ...base, prelude: false } : base
```

Register last:
`registry(effectHandlers, tryHandlers, resourceHandlers, proposalHandlers, pipelineHandlers, awaitHandlers, returnTypeHandlers, preludeHandlers)`.

- [ ] **Step 7: Run all tests**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS. The superset test must stay byte-identical.

If the superset test fails because a real file references a free name that the prelude now
resolves, that name is a JS/TS global missing from `excludedNames`. Add it to the generator's `web`
list (or extend the lib scan), regenerate, and re-run.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): prelude imports, Effect builtins, bare types and service tags"
```

---

### Task 12: `schema` (class, alias, ADT forms)

**Files:**
- Modify: `src/compiler/parser/plugin.ts` (class-like declarations, schema alias/ADT)
- Modify: `src/compiler/analyze/scope.ts` (bindings for alias/ADT declarations)
- Create: `src/compiler/schema/mapping.ts`, `src/compiler/transform/classLike.ts`,
  `src/compiler/transform/schema.ts`
- Modify: `src/compiler/transform/index.ts` (register `schemaHandlers` first)
- Create fixtures: `test/fixtures/schema/{basic,comments}.efx` and the matching `.ts` files
- Test: `test/parser.test.ts`, `test/diagnostics.test.ts` (append)

**Interfaces:**
- Consumes: `withNamespace`, `walk`, `isTypeFree`, and `diagnosticError`.
- Produces:
  - AST: `ClassDeclaration` with `efxKind: "schema" | "error" | "service" | "variant"` and
    `efxKeyword: {start,end}`, plus `SchemaAliasDeclaration { keyword, id, typeAnnotation }` and
    `SchemaAdtDeclaration { keyword, id, variants: Array<ClassDeclaration> }`.
  - The parser keeps a class-kind stack: `efxState().classKinds: Array<string>`.
  - `typeToSchema(ctx, typeNode): string`.
  - From `classLike.ts`: `fieldsOf(classNode) → { fields, members, tag }`,
    `rewriteField(ctx, field, isLast)`, `lineRange(source, node)`,
    `moveMembersAfter(ctx, body, members, close, trailing?)`, and `removeLine(ctx, node)`.
  - `schemaHandlers: HandlerGroup` (also used by `error`, Task 13).
  - Diagnostics:
    - EFX3001: unsupported type in a schema position
    - EFX3002: schema with `extends`/type parameters
    - EFX3003: ADT variant with methods or `=` fields
    - EFX3004: field without a type or `= schema`

- [ ] **Step 1: Write the failing tests and fixtures**

Append to `test/parser.test.ts`:

```ts
describe("schema declarations", () => {
  it("parses the class, alias and ADT forms", () => {
    const { program } = ok(
      "export schema User {\n  id: string\n  email?: string\n}\nschema Id = string & Brand<\"Id\">\nschema Shape =\n  | Circle { radius: number }\n  | Empty {}\n"
    )
    const cls = program.body[0].declaration
    expect(cls.type).toBe("ClassDeclaration")
    expect(cls.efxKind).toBe("schema")
    expect(cls.body.body[1].optional).toBe(true)
    expect(program.body[1].type).toBe("SchemaAliasDeclaration")
    expect(program.body[2].type).toBe("SchemaAdtDeclaration")
    expect(program.body[2].variants.map((v: any) => v.id.name)).toEqual(["Circle", "Empty"])
  })

  it("keeps schema as an identifier elsewhere", () => {
    ok("const schema = { parse: (x: unknown) => x }\nschema.parse(1)\n")
  })
})
```

`test/fixtures/schema/basic.efx`:

```ts
schema UserId = string & Brand<"UserId">

export schema User {
  id: UserId
  name: string
  email?: string
  tags: ReadonlyArray<string>
  role: "admin" | "member"
  manager: UserId | null
  age = Int.check(isGreaterThan(0))
  get label() {
    return `${this.name} <${this.email ?? "?"}>`
  }
}

export schema Point = { x: number; y: number }

export schema Shape =
  | Circle { radius: number }
  | Square { side: number }

schema Event {
  _tag: "Event"
  at: Date
  payload: Record<string, unknown>
}
```

`test/fixtures/schema/basic.ts`:

```ts
import { Schema } from "effect"
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String),
  role: Schema.Literals(["admin", "member"]),
  manager: Schema.NullOr(UserId),
  age: Schema.Int.check(Schema.isGreaterThan(0))
}) {
  get label() {
    return `${this.name} <${this.email ?? "?"}>`
  }
}

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
export type Point = typeof Point.Type

export class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
export class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
export const Shape = Schema.Union([Circle, Square])
export type Shape = typeof Shape.Type

class Event extends Schema.TaggedClass<Event>()("Event", {
  at: Schema.Date,
  payload: Schema.Record(Schema.String, Schema.Unknown)
}) {}
```

`test/fixtures/schema/comments.efx`:

```ts
/** A product. */
export schema Product {
  // the sku
  sku: string
  /** price in cents */
  price: Int
}
```

`test/fixtures/schema/comments.ts`:

```ts
import { Schema } from "effect"
/** A product. */
export class Product extends Schema.Class<Product>("Product")({
  // the sku
  sku: Schema.String,
  /** price in cents */
  price: Schema.Int
}) {}
```

Append to `test/diagnostics.test.ts`:

```ts
describe("schema diagnostics", () => {
  it("EFX3001: unsupported types", () => {
    expect(codes("schema A {\n  f: keyof B\n}\n")).toEqual(["EFX3001"])
  })

  it("EFX3002: extends is not supported", () => {
    expect(codes("schema A extends B {\n  x: string\n}\n")).toEqual(["EFX3002"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: FAIL (parse errors at `schema`).

- [ ] **Step 3: Parser: class-like declarations and schema alias/ADT**

In `plugin.ts`:
- Add `classKinds: Array<string>` to `EfxState` and initialize it with `classKinds: []` in
  `efxState()`.
- Add these methods:

```ts
    efxIsClassLikeStart(): boolean {
      return (this.efxIsWord("schema") || this.efxIsWord("error") || this.efxIsWord("service")) &&
        this.efxNextIsNameSameLine()
    }

    efxParseClassLike(kind: string): any {
      const node = this.startNode()
      node.efxKind = kind
      node.efxKeyword = { start: this.start, end: this.end }
      return this.parseClass(node, true)
    }

    parseClass(node: any, isStatement: unknown) {
      const state = this.efxState()
      state.classKinds.push(node.efxKind ?? "class")
      try {
        return super.parseClass(node, isStatement)
      } finally {
        state.classKinds.pop()
      }
    }

    efxParseSchema(): any {
      const name = this.lookahead()
      const after = skipSpace(this.input, name.end)
      if (this.input[after] === "=" && this.input[after + 1] !== "=" && this.input[after + 1] !== ">") {
        return this.efxParseSchemaAlias()
      }
      return this.efxParseClassLike("schema")
    }

    efxIsVariantsStart(): boolean {
      let i = this.start
      if (this.type === tt.bitwiseOR) i = skipSpace(this.input, this.end)
      const match = /^[A-Za-z_$][\w$]*/.exec(this.input.slice(i))
      return match !== null && this.input[skipSpace(this.input, i + match[0].length)] === "{"
    }

    efxParseSchemaAlias(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.id = this.parseIdent()
      this.expect(tt.eq)
      if (this.efxIsVariantsStart()) {
        node.variants = []
        this.eat(tt.bitwiseOR)
        do {
          const id = this.startNode()
          const name = this.value
          const idEnd = this.end
          const idEndLoc = this.endLoc
          const variant = this.startNode()
          variant.efxKind = "variant"
          this.parseClass(variant, "nullableID") // consumes the variant name in place of `class`
          id.name = name
          variant.id = this.finishNodeAt(id, "Identifier", idEnd, idEndLoc)
          node.variants.push(variant)
        } while (this.eat(tt.bitwiseOR))
        this.semicolon()
        return this.finishNode(node, "SchemaAdtDeclaration")
      }
      node.typeAnnotation = this.tsInType(() => this.tsParseType())
      this.semicolon()
      return this.finishNode(node, "SchemaAliasDeclaration")
    }
```

- Extend `parseStatement` (before `super`):

```ts
      if (this.efxIsWord("schema") && this.efxNextIsNameSameLine()) return this.efxParseSchema()
      if (this.efxIsClassLikeStart()) return this.efxParseClassLike(this.value)
```

- Change `shouldParseExportStatement` to
  `return this.efxIsEffectDeclarationStart() || this.efxIsClassLikeStart() || super.shouldParseExportStatement()`.

If acorn-typescript's `parseClass`/`parseClassId` rejects the `"nullableID"` trick for variants,
parse variants by hand instead: consume the name with `this.parseIdent()`. Then build a
`ClassBody` node by looping `this.parseClassElement(false)` between `tt.braceL` and `tt.braceR`,
wrapped in `this.enterClassBody()`/`this.exitClassBody()`. Keep the produced shape identical.

- [ ] **Step 4: Scope analysis for schema declarations**

In `analyze/scope.ts`, add to the `switch` in `visit`:

```ts
      case "SchemaAliasDeclaration": {
        scope.values.add(node.id.name)
        scope.types.add(node.id.name)
        bindings.add(node.id)
        return
      }
      case "SchemaAdtDeclaration": {
        for (const named of [node, ...node.variants]) {
          scope.values.add(named.id.name)
          scope.types.add(named.id.name)
          bindings.add(named.id)
        }
        return
      }
```

and, in the `ClassDeclaration` case, record errors:
`if (scope === module && node.efxKind === "error" && node.id) localErrors.add(node.id.name)`.

- [ ] **Step 5: Implement the type → Schema mapping**

`src/compiler/schema/mapping.ts`:

```ts
/**
 * TypeScript type syntax → Effect Schema expressions (spec §4.6).
 *
 * @since 0.1.0
 */
import { isTypeFree } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { Ctx } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"

const keywords: Record<string, string> = {
  TSStringKeyword: "Schema.String",
  TSNumberKeyword: "Schema.Number",
  TSBooleanKeyword: "Schema.Boolean",
  TSBigIntKeyword: "Schema.BigInt",
  TSUnknownKeyword: "Schema.Unknown",
  TSAnyKeyword: "Schema.Any",
  TSNeverKeyword: "Schema.Never",
  TSNullKeyword: "Schema.Null",
  TSUndefinedKeyword: "Schema.Undefined",
  TSVoidKeyword: "Schema.Void"
}
const vocabulary = new Set([
  "BigDecimal",
  "Date",
  "DateTimeUtc",
  "Duration",
  "Finite",
  "Int",
  "NonEmptyString",
  "Trimmed",
  "Uint8Array",
  "URL"
])
const unary: Record<string, string> = {
  Array: "Array",
  ReadonlyArray: "Array",
  Set: "ReadonlySet",
  ReadonlySet: "ReadonlySet",
  Option: "Option",
  Redacted: "Redacted"
}
const binary: Record<string, string> = { Record: "Record", Map: "ReadonlyMap", ReadonlyMap: "ReadonlyMap" }

const typeArgs = (node: Node): Array<Node> => (node.typeArguments ?? node.typeParameters)?.params ?? []
const slice = (ctx: Ctx, node: Node): string => ctx.source.slice(node.start, node.end)

const unsupported = (ctx: Ctx, node: Node): string => {
  ctx.diagnostics.push(
    diagnosticError("EFX3001", "This type is not supported in a schema position", node.start, node.end, "write the field as `name = <Schema expression>`")
  )
  return "Schema.Unknown"
}

const union = (ctx: Ctx, types: ReadonlyArray<Node>): string => {
  const isNull = (t: Node) => t.type === "TSNullKeyword"
  const isUndefined = (t: Node) => t.type === "TSUndefinedKeyword"
  const rest = types.filter((t) => !isNull(t) && !isUndefined(t))
  const hasNull = types.some(isNull)
  const hasUndefined = types.some(isUndefined)
  if (rest.length === 0) return hasNull && hasUndefined ? "Schema.Union([Schema.Null, Schema.Undefined])" : hasNull ? "Schema.Null" : "Schema.Undefined"
  const inner = rest.length === 1
    ? typeToSchema(ctx, rest[0]!)
    : rest.every((t) => t.type === "TSLiteralType")
    ? `Schema.Literals([${rest.map((t) => slice(ctx, t.literal)).join(", ")}])`
    : `Schema.Union([${rest.map((t) => typeToSchema(ctx, t)).join(", ")}])`
  return hasNull && hasUndefined
    ? `Schema.NullishOr(${inner})`
    : hasNull
    ? `Schema.NullOr(${inner})`
    : hasUndefined
    ? `Schema.UndefinedOr(${inner})`
    : inner
}

const member = (ctx: Ctx, node: Node): string => {
  if (node.type !== "TSPropertySignature" || node.typeAnnotation === undefined) return unsupported(ctx, node)
  const key = node.key.type === "Identifier" ? node.key.name : slice(ctx, node.key)
  const schema = typeToSchema(ctx, node.typeAnnotation.typeAnnotation)
  return `${key}: ${node.optional === true ? `Schema.optional(${schema})` : schema}`
}

/**
 * @since 0.1.0
 * @category schema
 */
export const typeToSchema = (ctx: Ctx, node: Node): string => {
  const keyword = keywords[node.type]
  if (keyword !== undefined) return keyword
  switch (node.type) {
    case "TSLiteralType":
      return `Schema.Literal(${slice(ctx, node.literal)})`
    case "TSArrayType":
      return `Schema.Array(${typeToSchema(ctx, node.elementType)})`
    case "TSParenthesizedType":
      return typeToSchema(ctx, node.typeAnnotation)
    case "TSTypeOperator":
      return node.operator === "readonly" ? typeToSchema(ctx, node.typeAnnotation) : unsupported(ctx, node)
    case "TSTupleType":
      return `Schema.Tuple([${node.elementTypes.map((t: Node) => typeToSchema(ctx, t)).join(", ")}])`
    case "TSTypeLiteral":
      return `Schema.Struct({ ${node.members.map((m: Node) => member(ctx, m)).join(", ")} })`
    case "TSUnionType":
      return union(ctx, node.types)
    case "TSIntersectionType": {
      const brand = node.types.find((t: Node) =>
        t.type === "TSTypeReference" && t.typeName.type === "Identifier" && t.typeName.name === "Brand"
      )
      const others = node.types.filter((t: Node) => t !== brand)
      const literal = brand !== undefined ? typeArgs(brand)[0] : undefined
      if (brand === undefined || others.length !== 1 || literal?.type !== "TSLiteralType") return unsupported(ctx, node)
      return `${typeToSchema(ctx, others[0]!)}.pipe(Schema.brand(${slice(ctx, literal.literal)}))`
    }
    case "TSTypeReference": {
      const args = typeArgs(node)
      const name: string | undefined = node.typeName.type === "Identifier" ? node.typeName.name : undefined
      if (name !== undefined && isTypeFree(ctx.scope, name)) {
        if (args.length === 0 && vocabulary.has(name)) return `Schema.${name}`
        if (args.length === 0 && name === "Defect") return "Schema.Defect()"
        if (args.length === 1 && unary[name] !== undefined) return `Schema.${unary[name]}(${typeToSchema(ctx, args[0]!)})`
        if (args.length === 2 && binary[name] !== undefined) {
          return `Schema.${binary[name]}(${typeToSchema(ctx, args[0]!)}, ${typeToSchema(ctx, args[1]!)})`
        }
      }
      if (args.length > 0) return unsupported(ctx, node)
      return slice(ctx, node.typeName)
    }
    default:
      return unsupported(ctx, node)
  }
}
```

- [ ] **Step 6: Implement class-like helpers and the schema transform**

`src/compiler/transform/classLike.ts`:

```ts
/**
 * Shared machinery for `schema`/`error`/`service` class-like declarations.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"

/**
 * @since 0.1.0
 * @category utils
 */
export const fieldsOf = (cls: Node): { fields: Array<Node>; members: Array<Node>; tag: Node | undefined } => {
  const fields: Array<Node> = []
  const members: Array<Node> = []
  let tag: Node | undefined
  for (const element of cls.body.body as Array<Node>) {
    if (element.type === "PropertyDefinition" && element.static !== true && element.computed !== true) {
      if (element.key.name === "_tag") tag = element
      else fields.push(element)
    } else {
      members.push(element)
    }
  }
  return { fields, members, tag }
}

/**
 * The full-line range of `node` (including its leading comment lines and trailing newline) when it
 * sits on its own lines; otherwise the node range.
 *
 * @since 0.1.0
 * @category utils
 */
export const lineRange = (source: string, node: Node): readonly [number, number] => {
  let start = source.lastIndexOf("\n", node.start - 1) + 1
  const lineEnd = source.indexOf("\n", node.end)
  const end = lineEnd === -1 ? source.length : lineEnd + 1
  if (source.slice(start, node.start).trim() !== "" || source.slice(node.end, end).trim() !== "") {
    return [node.start, node.end]
  }
  for (;;) {
    const previous = source.lastIndexOf("\n", start - 2) + 1
    const text = source.slice(previous, start).trim()
    if (previous >= start || !(text.startsWith("//") || text.startsWith("/*") || text.startsWith("*"))) break
    start = previous
  }
  return [start, end]
}

/**
 * @since 0.1.0
 * @category utils
 */
export const removeLine = (ctx: Ctx, node: Node): void => {
  const [start, end] = lineRange(ctx.source, node)
  ctx.s.remove(start, end)
}

/**
 * Rewrites one field (`name: Type` / `name?: Type` / `name = schema`) into an object property.
 *
 * @since 0.1.0
 * @category utils
 */
export const rewriteField = (ctx: Ctx, field: Node, isLast: boolean): void => {
  if (field.readonly === true && ctx.source.startsWith("readonly", field.start)) {
    ctx.s.remove(field.start, field.key.start)
  }
  if (field.value !== null && field.value !== undefined) {
    ctx.s.update(field.key.end, field.value.start, ": ")
    withNamespace(ctx, "Schema", () => walk(field.value, field, ctx))
  } else if (field.typeAnnotation !== undefined && field.typeAnnotation !== null) {
    const type: Node = field.typeAnnotation.typeAnnotation
    let schema = typeToSchema(ctx, type)
    if (field.optional === true) {
      schema = `Schema.optional(${schema})`
      const question = ctx.source.indexOf("?", field.key.end)
      ctx.s.remove(question, question + 1)
    }
    ctx.s.update(type.start, type.end, schema)
  } else {
    ctx.diagnostics.push(diagnosticError("EFX3004", "A field needs a type or `= <schema>`", field.start, field.end))
  }
  const endsWithSemicolon = ctx.source[field.end - 1] === ";"
  if (isLast) {
    if (endsWithSemicolon) ctx.s.remove(field.end - 1, field.end)
  } else if (endsWithSemicolon) {
    ctx.s.update(field.end - 1, field.end, ",")
  } else {
    ctx.s.appendLeft(field.end, ",")
  }
}

/**
 * Closes the first brace-delimited part with `close` and moves `members` into a new class body.
 * `trailing` is appended at the end of that class body.
 *
 * @since 0.1.0
 * @category utils
 */
export const moveMembersAfter = (
  ctx: Ctx,
  body: Node,
  members: ReadonlyArray<Node>,
  close: string,
  trailing = ""
): void => {
  const brace = body.end - 1
  if (members.length === 0) {
    if (trailing === "") ctx.s.update(brace, brace + 1, `${close} {}`)
    else ctx.s.appendRight(brace, `${close} {\n${trailing}`)
    return
  }
  const ranges = members.map((m) => lineRange(ctx.source, m))
  // Members already forming a contiguous run at the end of the body stay in place; earlier
  // members move in front of that run, preserving source order.
  let target = brace
  let suffixStart = ranges.length
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [start, end] = ranges[i]!
    if (ctx.source.slice(end, target).trim() !== "") break
    target = start
    suffixStart = i
  }
  ctx.s.appendRight(ranges[0]![0], `${close} {\n`)
  for (const [start, end] of ranges.slice(0, suffixStart)) ctx.s.move(start, end, target)
  if (trailing !== "") ctx.s.appendRight(brace, trailing)
}
```

`src/compiler/transform/schema.ts`:

```ts
/**
 * `schema` (class / alias / ADT) and `error` declarations.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"
import { fieldsOf, moveMembersAfter, removeLine, rewriteField } from "./classLike.ts"
import type { HandlerGroup } from "./index.ts"

const tagValue = (tag: Node | undefined): string | undefined => {
  const literal = tag?.typeAnnotation?.typeAnnotation
  return literal?.type === "TSLiteralType" ? String(literal.literal.value) : undefined
}

const schemaClass: Handler = (node, _parent, ctx) => {
  if (node.efxKind !== "schema" && node.efxKind !== "error") return
  if (node.superClass !== null || node.typeParameters !== undefined) {
    ctx.diagnostics.push(diagnosticError("EFX3002", "`extends` and type parameters are not supported here", node.start, node.body.start))
    return true
  }
  ctx.imports.need("effect", "Schema")
  const name: string = node.id.name
  const { fields, members, tag } = fieldsOf(node)
  const tagName = tagValue(tag)
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "class")
  const header = node.efxKind === "error"
    ? `Schema.TaggedError<${name}>()(${JSON.stringify(tagName ?? name)}, `
    : tagName !== undefined
    ? `Schema.TaggedClass<${name}>()(${JSON.stringify(tagName)}, `
    : `Schema.Class<${name}>(${JSON.stringify(name)})(`
  ctx.s.update(node.id.end, node.body.start, ` extends ${header}`)
  if (tag !== undefined) removeLine(ctx, tag)
  fields.forEach((field, i) => rewriteField(ctx, field, i === fields.length - 1))
  moveMembersAfter(ctx, node.body, members, "})")
  for (const member of members) walk(member, node.body, ctx)
  return true
}

const schemaAlias: Handler = (node, parent, ctx) => {
  ctx.imports.need("effect", "Schema")
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const name: string = node.id.name
  ctx.s.update(node.start, node.end, `const ${name} = ${typeToSchema(ctx, node.typeAnnotation)}\n${prefix}type ${name} = typeof ${name}.Type`)
  return true
}

const schemaAdt: Handler = (node, parent, ctx) => {
  ctx.imports.need("effect", "Schema")
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const lines = (node.variants as Array<Node>).map((variant, i) => {
    const variantName: string = variant.id.name
    const { fields, members } = fieldsOf(variant)
    if (members.length > 0 || fields.some((f) => f.value !== null && f.value !== undefined)) {
      ctx.diagnostics.push(
        diagnosticError("EFX3003", "ADT variants support typed fields only", variant.start, variant.end, "use a class-form schema with a `_tag` field")
      )
    }
    const struct = fields.length === 0 ? "{}" : `{ ${fields.map((f) => {
      const schema = typeToSchema(ctx, f.typeAnnotation.typeAnnotation)
      return `${f.key.name}: ${f.optional === true ? `Schema.optional(${schema})` : schema}`
    }).join(", ")} }`
    return `${i === 0 ? "" : prefix}class ${variantName} extends Schema.TaggedClass<${variantName}>()(${JSON.stringify(variantName)}, ${struct}) {}`
  })
  const name: string = node.id.name
  lines.push(`${prefix}const ${name} = Schema.Union([${(node.variants as Array<Node>).map((v) => v.id.name).join(", ")}])`)
  lines.push(`${prefix}type ${name} = typeof ${name}.Type`)
  ctx.s.update(node.start, node.end, lines.join("\n"))
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const schemaHandlers: HandlerGroup = {
  ClassDeclaration: schemaClass,
  SchemaAliasDeclaration: schemaAlias,
  SchemaAdtDeclaration: schemaAdt
}
```

Register `schemaHandlers` first:
`registry(schemaHandlers, effectHandlers, tryHandlers, resourceHandlers, proposalHandlers, pipelineHandlers, awaitHandlers, returnTypeHandlers, preludeHandlers)`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS, with the schema goldens type-checking.

If `PropertyDefinition.end` doesn't include the trailing `;`, the separator logic still works. It
only checks `source[field.end - 1]`.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): schema declarations with TS-type to Schema mapping"
```

---

### Task 13: `error` declarations

**Files:**
- Modify: nothing new in the parser (`error` is covered by `efxIsClassLikeStart`) or in the
  transform (`schemaClass` handles `efxKind === "error"`).
- Create fixtures: `test/fixtures/error/errors.efx` and `test/fixtures/error/errors.ts`
- Test: `test/runtime.test.ts` (append)

**Interfaces:**
- Consumes: Task 12's `schemaHandlers`, and `localErrors` (from Task 12, Step 4).
- Produces: `throw new E(…)` / `x ?? throw new E(…)` for a local `error E` compile to
  `return yield* new E(…)` / `(yield* new E(…))`.

- [ ] **Step 1: Write the failing fixture and runtime test**

`test/fixtures/error/errors.efx`:

```ts
export error UserNotFound { id: string }
error DbError { cause: Defect }
error Timeout {
  _tag: "RequestTimeout"
  ms: number
  get summary() { return `timed out after ${this.ms}ms` }
}

effect find(id: string): string throws UserNotFound | DbError {
  if (id === "") throw new UserNotFound({ id })
  if (id === "db") throw new DbError({ cause: new Error("down") })
  return id
}
```

`test/fixtures/error/errors.ts`:

```ts
import { Effect, Schema } from "effect"
export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}
class DbError extends Schema.TaggedError<DbError>()("DbError", { cause: Schema.Defect() }) {}
class Timeout extends Schema.TaggedError<Timeout>()("RequestTimeout", {
  ms: Schema.Number
}) {
  get summary() { return `timed out after ${this.ms}ms` }
}

const find = Effect.fn("find")(function*(id: string): Effect.fn.Return<string, UserNotFound | DbError> {
  if (id === "") return yield* new UserNotFound({ id })
  if (id === "db") return yield* new DbError({ cause: new Error("down") })
  return id
})
```

Append to `test/runtime.test.ts`:

```ts
  it("error declarations are tagged, yieldable and catchable", async () => {
    const mod = await runCompiled(`
      import { Effect } from "effect"
      error NotFound { id: string }
      effect get(id: string): string throws NotFound {
        if (id !== "ok") throw new NotFound({ id })
        return id
      }
      effect safe(id: string) {
        try {
          return await get(id)
        } catch (e: NotFound) {
          return \`missing:\${e.id}\`
        }
      }
      export const values = [Effect.runSync(safe("ok")), Effect.runSync(safe("x"))]
    `)
    expect(mod.values).toEqual(["ok", "missing:x"])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/compile.test.ts packages/effectscript/core/test/runtime.test.ts`
Expected: FAIL, unless Task 12 already made it pass. In that case confirm the output matches
exactly and move on.

- [ ] **Step 3: Make it pass**

The output should already match after Task 12. If `return yield* Effect.fail(new UserNotFound(...))`
appears instead of `return yield* new UserNotFound(...)`, then `localErrors` is not populated.
Check the `ClassDeclaration` branch in `analyze/scope.ts` (Task 12, Step 4).

- [ ] **Step 4: Run all tests, check, lint**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test && pnpm check && pnpm lint`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): error declarations as yieldable tagged errors"
```

---

### Task 14: `service` and `layer`

**Files:**
- Modify: `src/compiler/parser/plugin.ts` (`as "key"`, `layer name =` members)
- Create: `src/compiler/transform/service.ts`, `src/compiler/serviceKey.ts`
- Modify: `src/compiler/transform/index.ts` (register `serviceHandlers` right after `schemaHandlers`)
- Create fixtures: `test/fixtures/service/basic.efx` and `test/fixtures/service/basic.ts`
- Test: `test/runtime.test.ts`, `test/diagnostics.test.ts`, `test/transform.test.ts` (append)

**Interfaces:**
- Consumes: Task 12's class-like helpers (`fieldsOf` is not used; services classify their own
  members), `moveMembersAfter`, `lineRange`, `rewriteReturnType`, `withNamespace`, `walk`, and
  `flatten`-like head detection (reimplemented locally: the head of a `PipelineExpression` chain).
- Produces:
  - Parser: `ClassDeclaration.efxServiceKey: Literal | undefined`; a `PropertyDefinition` written
    as `layer <name> = …` gets `efxLayer: { keyword }`.
  - `serviceKey(options, name): string`.
  - `serviceHandlers: HandlerGroup`.
  - `EffectBlock.efxLayerConstructor = true` for layer constructors.
  - Diagnostics:
    - EFX4001: an `effect` member without a return type
    - EFX4002: an unsupported member
    - EFX4003 (warning): an accessor name that clashes with a `Context.Service` static

- [ ] **Step 1: Write the failing tests and fixture**

`test/fixtures/service/basic.efx`:

```ts
error UserNotFound { id: string }

schema User {
  id: string
  name: string
}

declare const SqlLive: Layer<never>

export service Users {
  effect find(id: string): User throws UserNotFound
  effect list(): ReadonlyArray<User>
  readonly size: number

  layer = effect {
    const cache = new Map<string, User>()
    defer Effect.log("users layer released")
    return {
      size: 0,
      effect find(id: string) {
        return cache.get(id) ?? throw new UserNotFound({ id })
      },
      list: effect () => [...cache.values()]
    }
  } |> provide(SqlLive)

  layer test = {
    size: 1,
    find: effect (id: string) => new User({ id, name: "Test" }),
    list: effect () => []
  }
}

export effect firstName(id: string) {
  const user = await Users.find(id)
  return user.name
}
```

`test/fixtures/service/basic.ts`:

```ts
import { Context, Effect, Layer, Schema } from "effect"
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: Schema.String }) {}

class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

declare const SqlLive: Layer.Layer<never>

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
  list(): Effect.Effect<ReadonlyArray<User>>
  readonly size: number

}>()("fixtures/service/Users") {
  static readonly layer = Layer.effect(Users, Effect.gen(function*() {
    const cache = new Map<string, User>()
    yield* Effect.addFinalizer(() => Effect.log("users layer released"))
    return Users.of({
      size: 0,
      find: Effect.fn("Users.find")(function*(id: string) {
        return cache.get(id) ?? (yield* new UserNotFound({ id }))
      }),
      list: Effect.fnUntraced(function*() { return [...cache.values()] })
    })
  })).pipe(Layer.provide(SqlLive))

  static readonly layerTest = Layer.succeed(Users, Users.of({
    size: 1,
    find: Effect.fnUntraced(function*(id: string) { return new User({ id, name: "Test" }) }),
    list: Effect.fnUntraced(function*() { return [] })
  }))
  static readonly find = (id: string) => Users.use((_) => _.find(id))
  static readonly list = () => Users.use((_) => _.list())
}

export const firstName = Effect.fn("firstName")(function*(id: string) {
  const user = yield* Users.find(id)
  return user.name
})
```

Append to `test/transform.test.ts`:

```ts
describe("service keys", () => {
  it("derives keys from package and path, and honors `as`", () => {
    const opts = { packageName: "acme", filename: "src/db/Database.efx" }
    expect(ts("service Database {\n  effect ping(): void\n}\n", opts)).toContain("()(\"acme/db/Database\")")
    expect(ts("service Database as \"custom/Db\" {\n  effect ping(): void\n}\n", opts)).toContain("()(\"custom/Db\")")
    expect(ts("service Database {\n  effect ping(): void\n}\n")).toContain("()(\"Database\")")
  })
})
```

Append to `test/runtime.test.ts`:

```ts
  it("services provide layers and static accessors", async () => {
    const mod = await runCompiled(`
      import { Effect } from "effect"
      service Greeter {
        effect greet(name: string): string
        layer = effect {
          return { effect greet(name: string) { return \`hi \${name}\` } }
        }
        layer test = { greet: effect (name: string) => \`test \${name}\` }
      }
      effect run() {
        return await Greeter.greet("ada")
      }
      export const live = Effect.runSync(run().pipe(Effect.provide(Greeter.layer)))
      export const test = Effect.runSync(run().pipe(Effect.provide(Greeter.layerTest)))
    `)
    expect(mod.live).toBe("hi ada")
    expect(mod.test).toBe("test ada")
  })
```

Append to `test/diagnostics.test.ts`:

```ts
describe("service diagnostics", () => {
  it("EFX4001: effect members need a return type", () => {
    expect(codes("service S {\n  effect f()\n}\n")).toEqual(["EFX4001"])
  })

  it("EFX4002: unsupported members", () => {
    expect(codes("service S {\n  helper() { return 1 }\n}\n")).toEqual(["EFX4002"])
  })

  it("EFX4003: accessor names that clash with Context.Service statics", () => {
    expect(codes("service S {\n  effect use(): void\n}\n")).toEqual(["EFX4003"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: FAIL for the service fixture, runtime test, key tests, and diagnostics.

- [ ] **Step 3: Parser support**

In `plugin.ts`, add:

```ts
    parseClassSuper(node: any) {
      if (node.efxKind === "service" && this.efxIsWord("as")) {
        this.next()
        node.efxServiceKey = this.parseExprAtom()
      }
      return super.parseClassSuper(node)
    }
```

and at the start of `parseClassElement` (before the `efxIsMethodAhead` check):

```ts
      const kinds = this.efxState().classKinds
      if (kinds[kinds.length - 1] === "service" && this.efxIsWord("layer")) {
        const next = this.lookahead()
        if (next.type === tt.name && this.efxSameLine(next)) {
          const keyword = { start: this.start, end: this.end }
          this.next()
          const element = super.parseClassElement(constructorAllowsSuper)
          element.efxLayer = { keyword }
          element.start = keyword.start
          return element
        }
      }
```

- [ ] **Step 4: Service keys**

`src/compiler/serviceKey.ts`:

```ts
/**
 * `"<package>/<dir relative to package root, minus src/>/<Name>"` (spec §4.8).
 *
 * @since 0.1.0
 */
import type { ResolvedOptions } from "./options.ts"

/**
 * @since 0.1.0
 * @category utils
 */
export const serviceKey = (options: ResolvedOptions, name: string): string => {
  if (options.packageName === undefined) return name
  let file = options.filename.replace(/\\/g, "/")
  const root = options.packageRoot?.replace(/\\/g, "/").replace(/\/$/, "")
  if (root !== undefined && file.startsWith(`${root}/`)) file = file.slice(root.length + 1)
  file = file.replace(/^\.\//, "").replace(/^src\//, "")
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""
  return [options.packageName, dir, name].filter((part) => part !== "").join("/")
}
```

- [ ] **Step 5: Implement the service transform**

`src/compiler/transform/service.ts`:

```ts
/**
 * `service` → `Context.Service` class with `static readonly layer…` and static accessors.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withNamespace } from "../context.ts"
import { diagnosticError, diagnosticWarning } from "../diagnostics.ts"
import { serviceKey } from "../serviceKey.ts"
import { walk } from "../walk.ts"
import { moveMembersAfter } from "./classLike.ts"
import type { HandlerGroup } from "./index.ts"
import { rewriteReturnType } from "./returnType.ts"

const reservedStatics = new Set([
  "arguments", "caller", "context", "Identifier", "key", "length", "name", "of", "pipe", "prototype", "Service",
  "toJSON", "toString", "use", "useSync"
])

const pipelineHead = (node: Node): Node => (node.type === "PipelineExpression" ? pipelineHead(node.left) : node)

const layerName = (member: Node): string => {
  const key: string = member.key.name
  return member.efxLayer === undefined && key === "layer" ? "layer" : `layer${key[0]!.toUpperCase()}${key.slice(1)}`
}

const isLayerMember = (member: Node): boolean =>
  member.type === "PropertyDefinition" && (member.efxLayer !== undefined || member.key?.name === "layer")

const wrapReturnedObjects = (ctx: Ctx, block: Node, name: string): void => {
  for (const statement of block.body.body as Array<Node>) {
    if (statement.type === "ReturnStatement" && statement.argument?.type === "ObjectExpression") {
      ctx.s.appendRight(statement.argument.start, `${name}.of(`)
      ctx.s.prependLeft(statement.argument.end, ")")
    }
  }
}

const rewriteLayer = (ctx: Ctx, member: Node, name: string): void => {
  ctx.s.update(member.start, member.value.start, `static readonly ${layerName(member)} = `)
  const head = pipelineHead(member.value)
  if (head.type === "EffectBlock") {
    ctx.imports.need("effect", "Layer")
    head.efxLayerConstructor = true
    ctx.s.appendRight(head.start, `Layer.effect(${name}, `)
    ctx.s.prependLeft(head.end, ")")
    wrapReturnedObjects(ctx, head, name)
  } else if (head.type === "ObjectExpression") {
    ctx.imports.need("effect", "Layer")
    ctx.s.appendRight(head.start, `Layer.succeed(${name}, ${name}.of(`)
    ctx.s.prependLeft(head.end, "))")
  }
  const previous = ctx.service
  ctx.service = name
  withNamespace(ctx, "Layer", () => walk(member.value, member, ctx))
  ctx.service = previous
}

const accessor = (ctx: Ctx, name: string, member: Node): string => {
  const key: string = member.key.name
  const typeParameters = member.typeParameters ? ctx.s.slice(member.typeParameters.start, member.typeParameters.end) : ""
  const params = (member.params as Array<Node>).map((p) => ctx.s.slice(p.start, p.end)).join(", ")
  const args = (member.params as Array<Node>).map((p) =>
    p.type === "RestElement" ? `...${p.argument.name}` : p.type === "AssignmentPattern" ? p.left.name : p.name
  ).join(", ")
  return `  static readonly ${key} = ${typeParameters}(${params}) => ${name}.use((_) => _.${key}(${args}))\n`
}

const service: Handler = (node, _parent, ctx) => {
  if (node.efxKind !== "service") return
  ctx.imports.need("effect", "Context")
  const name: string = node.id.name
  const key = node.efxServiceKey?.value ?? serviceKey(ctx.options, name)
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "class")
  ctx.s.update(node.id.end, node.body.start, ` extends Context.Service<${name}, `)

  const layers: Array<Node> = []
  const effects: Array<Node> = []
  for (const member of node.body.body as Array<Node>) {
    if (isLayerMember(member)) {
      layers.push(member)
    } else if (member.type === "TSDeclareMethod" && member.efx !== undefined) {
      if (member.returnType === undefined || member.returnType === null) {
        ctx.diagnostics.push(diagnosticError("EFX4001", "`effect` members need a return type", member.start, member.end, "write `: void` for effects without a result"))
        continue
      }
      ctx.s.remove(member.efx.keyword.start, member.key.start)
      rewriteReturnType(ctx, member.returnType, "Effect.Effect")
      for (const child of [...member.params, member.returnType]) walk(child, member, ctx)
      effects.push(member)
    } else if (
      member.type === "TSDeclareMethod" ||
      (member.type === "PropertyDefinition" && (member.value === null || member.value === undefined) && member.static !== true)
    ) {
      walk(member, node.body, ctx)
    } else {
      ctx.diagnostics.push(diagnosticError("EFX4002", "Unsupported `service` member", member.start, member.end, "services hold `effect` members, plain signatures and `layer` members"))
    }
  }

  let accessors = ""
  for (const member of effects) {
    if (reservedStatics.has(member.key.name)) {
      ctx.diagnostics.push(diagnosticWarning("EFX4003", `No static accessor for \`${member.key.name}\`: the name clashes with a Context.Service static`, member.key.start, member.key.end))
      continue
    }
    accessors += accessor(ctx, name, member)
  }
  moveMembersAfter(ctx, node.body, layers, `}>()(${JSON.stringify(key)})`, accessors)
  for (const member of layers) rewriteLayer(ctx, member, name)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const serviceHandlers: HandlerGroup = {
  ClassDeclaration: service
}
```

Register: `registry(schemaHandlers, serviceHandlers, effectHandlers, …)`. `schemaClass` returns
`undefined` for services, so `service` runs next.

Note on ordering inside `service`:
- Walk the effect members *before* building accessors, because `ctx.s.slice` returns the
  transformed parameter text.
- Call `moveMembersAfter` before `rewriteLayer`. The moves are textual, and the edits inside the
  moved ranges travel with them.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS, with the service golden type-checking and the runtime accessors working.

If `layerTest` contextual typing fails in the typecheck test, compare against the golden first.
`Users.of({...})` must wrap the object, because it supplies the contextual type for
`effect (id: string) => …`.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): services with layers, Self.of wrapping and static accessors"
```

---

### Task 15: `main`

**Files:**
- Modify: `src/compiler/parser/plugin.ts`
- Create: `src/compiler/transform/main.ts`
- Modify: `src/compiler/transform/index.ts` (register `mainHandlers` after `effectHandlers`)
- Create fixtures: `test/fixtures/main/main.efx` and `test/fixtures/main/main.ts`
- Test: `test/transform.test.ts`, `test/diagnostics.test.ts` (append)

**Interfaces:**
- Consumes: `efxParseAsyncBlock`, `efxAttachPipes`, `makeFrame`, `withEffect`, `lineRange` (from
  `classLike.ts`), and `lastEnd` (from `effect.ts`).
- Produces:
  - AST `MainStatement { keyword, body, efxPipes, efxPipeOps }`.
  - `mainHandlers: HandlerGroup`.
  - Diagnostics: EFX6001 for a second `main`, and EFX6002 for a `main` that isn't at top level.

- [ ] **Step 1: Write the failing tests and fixture**

`test/fixtures/main/main.efx`:

```ts
declare const program: Effect<void>
main {
  await program
  globalThis.console.log("done")
} |> provide(Layer.empty)

effect helper() {
  return 1
}
```

`test/fixtures/main/main.ts`:

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
declare const program: Effect.Effect<void>

const helper = Effect.fn("helper")(function*() {
  return 1
})
NodeRuntime.runMain(Effect.gen(function*() {
  yield* program
  globalThis.console.log("done")
}).pipe(Effect.provide(Layer.empty), Effect.provide(NodeServices.layer)))
```

Append to `test/transform.test.ts`:

```ts
describe("main", () => {
  it("targets the configured runtime", () => {
    expect(ts("main { await sleep(1) }\n", { runtime: "bun" })).toBe(
      "import { BunRuntime, BunServices } from \"@effect/platform-bun\"\nimport { Effect } from \"effect\"\n" +
        "BunRuntime.runMain(Effect.gen(function*() { yield* Effect.sleep(1) }).pipe(Effect.provide(BunServices.layer)))\n"
    )
    expect(ts("main { await sleep(1) }\n", { runtime: "browser" })).toBe(
      "import { BrowserRuntime } from \"@effect/platform-browser\"\nimport { Effect } from \"effect\"\n" +
        "BrowserRuntime.runMain(Effect.gen(function*() { yield* Effect.sleep(1) }))\n"
    )
  })

  it("scopes main when it uses defer", () => {
    expect(ts("main {\n  defer log(\"bye\")\n}\n", { runtime: "browser" })).toContain(
      "}).pipe(Effect.scoped))"
    )
  })
})
```

Append to `test/diagnostics.test.ts`:

```ts
describe("main diagnostics", () => {
  it("EFX6001: only one main per module", () => {
    expect(codes("main {\n}\nmain {\n}\n")).toEqual(["EFX6001"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: FAIL (`main {` parses as an identifier followed by a block → syntax error).

- [ ] **Step 3: Parse `main`**

In `plugin.ts`:

```ts
    efxIsMainStart(): boolean {
      if (!this.efxIsWord("main")) return false
      const next = this.lookahead()
      return next.type === tt.braceL && this.efxSameLine(next)
    }

    efxParseMain(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.body = this.efxParseAsyncBlock()
      this.finishNode(node, "MainStatement")
      this.efxAttachPipes(node)
      return node
    }
```

and in `parseStatement`: `if (this.efxIsMainStart()) return this.efxParseMain()`.

- [ ] **Step 4: Implement the transform**

`src/compiler/transform/main.ts`:

```ts
/**
 * `main { … } |> …` → `<Runtime>.runMain(Effect.gen(…).pipe(…, Effect.provide(<Runtime>Services.layer)))`,
 * moved to the end of the module so every declaration is initialized first.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import type { Runtime } from "../options.ts"
import { walk } from "../walk.ts"
import { lineRange } from "./classLike.ts"
import { lastEnd } from "./effect.ts"
import type { HandlerGroup } from "./index.ts"

const runtimes: Record<Runtime, { readonly module: string; readonly runtime: string; readonly services: string | undefined }> = {
  node: { module: "@effect/platform-node", runtime: "NodeRuntime", services: "NodeServices" },
  bun: { module: "@effect/platform-bun", runtime: "BunRuntime", services: "BunServices" },
  deno: { module: "@effect/platform-deno", runtime: "DenoRuntime", services: "DenoServices" },
  browser: { module: "@effect/platform-browser", runtime: "BrowserRuntime", services: undefined }
}

const joinPipe = (ctx: Ctx, previousEnd: number, op: { readonly start: number; readonly end: number }, nextStart: number, text: string): void => {
  if (ctx.source.slice(previousEnd, op.start).includes("\n")) {
    ctx.s.appendLeft(previousEnd, text)
    ctx.s.remove(op.start, ctx.source[op.end] === " " ? op.end + 1 : op.end)
  } else {
    ctx.s.update(previousEnd, nextStart, text === "," ? ", " : text)
  }
}

const mainStatement: Handler = (node, parent, ctx) => {
  if (parent?.type !== "Program") {
    ctx.diagnostics.push(diagnosticError("EFX6002", "`main` must be at the top level of a module", node.start, node.keyword.end))
  }
  const mains = (ctx.analysis.program.body as Array<Node>).filter((s) => s.type === "MainStatement")
  if (mains.indexOf(node) > 0) {
    ctx.diagnostics.push(diagnosticError("EFX6001", "Only one `main` is allowed per module", node.start, node.keyword.end))
  }
  const target = runtimes[ctx.options.runtime]
  ctx.imports.need("effect", "Effect")
  ctx.imports.need(target.module, target.runtime)
  if (target.services !== undefined) ctx.imports.need(target.module, target.services)
  ctx.s.update(node.start, node.body.start, `${target.runtime}.runMain(Effect.gen(function*() `)
  const frame = makeFrame(node, "main")
  withEffect(ctx, frame, () => walk(node.body, node, ctx))
  const provide = target.services === undefined ? undefined : `Effect.provide(${target.services}.layer)`
  const pipes: Array<Node> = node.efxPipes
  if (pipes.length === 0) {
    const extras = [...(frame.scoped ? ["Effect.scoped"] : []), ...(provide === undefined ? [] : [provide])]
    ctx.s.prependLeft(node.end, extras.length > 0 ? `).pipe(${extras.join(", ")}))` : "))")
  } else {
    let previousEnd: number = node.end
    pipes.forEach((pipe, i) => {
      joinPipe(ctx, previousEnd, node.efxPipeOps[i], pipe.start, i === 0 ? `).pipe(${frame.scoped ? "Effect.scoped, " : ""}` : ",")
      walk(pipe, node, ctx)
      previousEnd = pipe.end
    })
    ctx.s.prependLeft(previousEnd, `${provide === undefined ? "" : `, ${provide}`}))`)
  }
  const [start, end] = lineRange(ctx.source, { type: "MainStatement", start: node.start, end: lastEnd(node) })
  if (ctx.source.slice(end).trim() !== "") {
    if (!ctx.source.endsWith("\n")) ctx.s.appendLeft(ctx.source.length, "\n")
    ctx.s.move(start, end, ctx.source.length)
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const mainHandlers: HandlerGroup = {
  MainStatement: mainStatement
}
```

Register: `registry(schemaHandlers, serviceHandlers, effectHandlers, mainHandlers, tryHandlers, …)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): main blocks with runtime selection and platform services"
```

---

### Task 16: `match` (TC39 pattern-matching shape → Effect `Match`)

**Files:**
- Modify: `src/compiler/parser/plugin.ts`
- Create: `src/compiler/transform/match.ts`
- Modify: `src/compiler/transform/index.ts` (register `matchHandlers` before `awaitHandlers`)
- Create fixtures: `test/fixtures/match/match.efx` and `test/fixtures/match/match.ts`
- Test: `test/parser.test.ts`, `test/runtime.test.ts` (append)

**Interfaces:**
- Consumes: `skipBalanced`, `skipSpace`, `isEffectful` (from `try.ts`), `withEffect`, and `walk`.
- Produces:
  - AST `MatchExpression { keyword, discriminant, arms: Array<MatchArm> }`.
  - `MatchArm { pattern: TagPattern | LiteralPattern | null (default), body }`, where
    `TagPattern { tag: Identifier | MemberExpression, binding: Pattern | null }` and
    `LiteralPattern { value }`.
  - `matchHandlers: HandlerGroup`.

- [ ] **Step 1: Write the failing tests and fixture**

Append to `test/parser.test.ts`:

```ts
describe("match", () => {
  it("parses tag, literal and default arms; match() calls stay calls", () => {
    const { program } = ok(
      "const a = match (s) {\n  when Circle({ radius }): radius\n  when \"x\": 1; default: 0\n}\nconst b = match(1, 2)\n"
    )
    const m = program.body[0].declarations[0].init
    expect(m.type).toBe("MatchExpression")
    expect(m.arms.map((arm: any) => arm.pattern?.type ?? "default")).toEqual(["TagPattern", "LiteralPattern", "default"])
    expect(program.body[1].declarations[0].init.type).toBe("CallExpression")
  })
})
```

`test/fixtures/match/match.efx`:

```ts
schema Shape =
  | Circle { radius: number }
  | Square { side: number }

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const scale: (n: number) => Effect.Effect<number>

export const area = match (shape) {
  when Circle({ radius }): Math.PI * radius ** 2
  when Square({ side }): side ** 2
}

export const label = match (status) { when "active": "✓"; when "banned": "✗"; default: "?" }

export effect scaled() {
  return match (shape) {
    when Circle(c): await scale(c.radius)
    when Square: 0
  }
}
```

`test/fixtures/match/match.ts`:

```ts
import { Effect, Match, Schema } from "effect"
class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type

declare const shape: Shape
declare const status: "active" | "banned" | "pending"
declare const scale: (n: number) => Effect.Effect<number>

export const area = Match.valueTags(shape, {
  Circle: ({ radius }) => Math.PI * radius ** 2,
  Square: ({ side }) => side ** 2
})

export const label = Match.value(status).pipe(Match.when("active", () => "✓"), Match.when("banned", () => "✗"), Match.orElse(() => "?"))

export const scaled = Effect.fn("scaled")(function*() {
  return (yield* Match.valueTags(shape, {
    Circle: (c) => Effect.gen(function*() { return yield* scale(c.radius) }),
    Square: () => Effect.gen(function*() { return 0 })
  }))
})
```

Append to `test/runtime.test.ts`:

```ts
  it("match dispatches on tags and literals", async () => {
    const mod = await runCompiled(`
      schema Shape =
        | Circle { radius: number }
        | Square { side: number }
      export const areas = [new Circle({ radius: 1 }), new Square({ side: 2 })].map((s) =>
        match (s) {
          when Circle({ radius }): radius * 10
          when Square({ side }): side * side
        }
      )
      export const words = (["a", "b", "z"] as const).map((x) =>
        match (x) { when "a": "first"; when "b": "second"; default: "other" }
      )
    `)
    expect(mod.areas).toEqual([10, 4])
    expect(mod.words).toEqual(["first", "second", "other"])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: FAIL (a parse error at `{` after `match (shape)`).

- [ ] **Step 3: Parse `match`**

In `plugin.ts`:

```ts
    efxIsMatchAhead(): boolean {
      if (!this.efxIsWord("match")) return false
      const next = this.lookahead()
      if (next.type !== tt.parenL || !this.efxSameLine(next)) return false
      const end = skipBalanced(this.input, next.start)
      if (end === -1) return false
      const after = skipSpace(this.input, end)
      return this.input[after] === "{" && !lineBreak.test(this.input.slice(end, after))
    }

    efxParseMatchPattern(): any {
      const node = this.startNode()
      if (
        this.type === tt.string || this.type === tt.num || this.type === tt._true || this.type === tt._false ||
        this.type === tt._null || this.efxIsWord("undefined")
      ) {
        node.value = this.efxIsWord("undefined") ? this.parseIdent() : this.parseExprAtom()
        return this.finishNode(node, "LiteralPattern")
      }
      let tag = this.parseIdent()
      while (this.eat(tt.dot)) {
        const member = this.startNodeAt(tag.start, tag.loc.start)
        member.object = tag
        member.property = this.parseIdent(true)
        member.computed = false
        tag = this.finishNode(member, "MemberExpression")
      }
      node.tag = tag
      node.binding = null
      if (this.eat(tt.parenL)) {
        node.binding = this.parseBindingAtom()
        this.expect(tt.parenR)
      }
      return this.finishNode(node, "TagPattern")
    }

    efxParseMatch(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      this.expect(tt.parenL)
      node.discriminant = this.parseExpression()
      this.expect(tt.parenR)
      this.expect(tt.braceL)
      node.arms = []
      while (!this.eat(tt.braceR)) {
        const arm = this.startNode()
        if (this.type === tt._default) {
          this.next()
          arm.pattern = null
        } else if (this.efxIsWord("when")) {
          this.next()
          arm.pattern = this.efxParseMatchPattern()
        } else {
          this.unexpected()
        }
        this.expect(tt.colon)
        arm.body = this.parseMaybeAssign()
        if (!this.eat(tt.semi)) this.eat(tt.comma)
        node.arms.push(this.finishNode(arm, "MatchArm"))
      }
      return this.finishNode(node, "MatchExpression")
    }
```

In `parseExprAtom`, add before the `effect` checks: `if (this.efxIsMatchAhead()) return this.efxParseMatch()`.

- [ ] **Step 4: Implement the transform**

`src/compiler/transform/match.ts`:

```ts
/**
 * `match (x) { when … }` → `Match.valueTags` (all tag arms, no default) or `Match.value(x).pipe(…)`.
 * Inside `effect` code with effectful arms, every arm returns an `Effect.gen` and the match is yielded.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withEffect } from "../context.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./index.ts"
import { isEffectful } from "./try.ts"

const tagName = (tag: Node): string => (tag.type === "MemberExpression" ? tag.property.name : tag.name)

const bindingText = (ctx: Ctx, pattern: Node | null): string =>
  pattern?.type === "TagPattern" && pattern.binding !== null ? ctx.source.slice(pattern.binding.start, pattern.binding.end) : ""

const sameLine = (ctx: Ctx, from: number, to: number): boolean => !ctx.source.slice(from, to).includes("\n")

const matchExpression: Handler = (node, _parent, ctx) => {
  const arms: Array<Node> = node.arms
  ctx.imports.need("effect", "Match")
  const generator = ctx.effect !== undefined && arms.some((arm) => isEffectful(arm.body))
  if (generator) {
    ctx.imports.need("effect", "Effect")
    ctx.s.appendRight(node.start, "(yield* ")
    ctx.s.prependLeft(node.end, ")")
  }
  const tagsOnly = arms.every((arm) => arm.pattern?.type === "TagPattern")
  const hasDefault = arms.some((arm) => arm.pattern === null)
  const brace = ctx.source.indexOf("{", node.discriminant.end)
  const inline = sameLine(ctx, node.discriminant.end, arms[0]!.start)
  ctx.s.update(node.start, node.discriminant.start, tagsOnly ? "Match.valueTags(" : "Match.value(")
  ctx.s.update(
    node.discriminant.end,
    inline ? arms[0]!.start : brace + 1,
    tagsOnly ? (inline ? ", { " : ", {") : ").pipe("
  )
  arms.forEach((arm, i) => {
    const binding = bindingText(ctx, arm.pattern)
    const [open, close] = generator
      ? [`(${binding}) => Effect.gen(function*() { return `, " })"]
      : [`(${binding}) => `, ""]
    const pattern: Node | null = arm.pattern
    const head = tagsOnly
      ? `${tagName(pattern!.tag)}: ${open}`
      : pattern === null
      ? `Match.orElse(${open}`
      : pattern.type === "TagPattern"
      ? `Match.tag(${JSON.stringify(tagName(pattern.tag))}, ${open}`
      : `Match.when(${ctx.source.slice(pattern.value.start, pattern.value.end)}, ${open}`
    const tail = tagsOnly ? close : `${close})`
    const last = i === arms.length - 1
    const separator = last ? (!tagsOnly && !hasDefault ? ", Match.exhaustive" : "") : ","
    ctx.s.update(arm.start, arm.body.start, head)
    if (arm.end > arm.body.end) ctx.s.update(arm.body.end, arm.end, `${tail}${separator}`)
    else ctx.s.appendLeft(arm.body.end, `${tail}${separator}`)
  })
  const lastArm = arms[arms.length - 1]!
  if (sameLine(ctx, lastArm.end, node.end - 1)) ctx.s.update(lastArm.end, node.end, tagsOnly ? " })" : ")")
  else ctx.s.update(node.end - 1, node.end, tagsOnly ? "})" : ")")
  walk(node.discriminant, node, ctx)
  for (const arm of arms) {
    if (generator) walk(arm.body, arm, ctx)
    else withEffect(ctx, undefined, () => walk(arm.body, arm, ctx))
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const matchHandlers: HandlerGroup = {
  MatchExpression: matchExpression
}
```

Register before `awaitHandlers`:
`registry(schemaHandlers, serviceHandlers, effectHandlers, mainHandlers, tryHandlers, resourceHandlers, proposalHandlers, pipelineHandlers, matchHandlers, awaitHandlers, returnTypeHandlers, preludeHandlers)`.

- [ ] **Step 5: Update the spec to match the arm encoding**

In `docs/superpowers/specs/2026-10-02-effectscript-design.md` §4.11, replace "every arm becomes
`Effect.fnUntraced(function*(binding) { return arm })`" with "every arm becomes
`(binding) => Effect.gen(function*() { return arm })`". Arrow parameters are contextually typed by
`Match`; a generic `fnUntraced` call's parameters might not be.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test`
Expected: PASS.

Run: `pnpm check && pnpm lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core docs/superpowers/specs/2026-10-02-effectscript-design.md
git commit -m "feat(effectscript): match expressions compiled to Effect Match"
```

---

### Task 17: Import-extension rewriting, mapping guarantees, README, full verification

**Files:**
- Create: `src/compiler/transform/imports.ts` (`.efx` specifier rewriting)
- Modify: `src/compiler/transform/index.ts` (register `importRewriteHandlers`)
- Create: `packages/effectscript/core/README.md`
- Test: `test/mappings.test.ts`, `test/transform.test.ts`, `test/diagnostics.test.ts` (append)

**Interfaces:**
- Consumes: `CompileOptions.rewriteImportExtensions`.
- Produces: with `rewriteImportExtensions: "ts" | "js"`, relative `.efx` specifiers in static
  imports, re-exports, and dynamic `import()` are rewritten. Plan 4 (CLI `efx build`) uses this.

- [ ] **Step 1: Write the failing tests**

Append to `test/transform.test.ts`:

```ts
describe("import extensions", () => {
  it("rewrites relative .efx specifiers when asked", () => {
    const source = "import { a } from \"./a.efx\"\nexport * from \"../b.efx\"\nconst c = import(\"./c.efx\")\nimport \"pkg/d.efx\"\n"
    expect(ts(source, { rewriteImportExtensions: "ts" })).toBe(
      "import { a } from \"./a.ts\"\nexport * from \"../b.ts\"\nconst c = import(\"./c.ts\")\nimport \"pkg/d.efx\"\n"
    )
    expect(ts(source)).toBe(source)
  })
})
```

Append to `test/mappings.test.ts`:

```ts
  it("maps user code inside effect bodies back to its source position", () => {
    const source = "declare const value: Effect.Effect<number>\neffect f() {\n  return await value\n}\n"
    const result = toTypeScript(source)
    const generated = result.code.indexOf("yield* value") + "yield* ".length
    const original = source.indexOf("await value") + "await ".length
    const mapping = result.mappings.find((m) =>
      m.generatedOffsets[0]! <= generated &&
      generated < m.generatedOffsets[0]! + (m.generatedLengths?.[0] ?? m.lengths[0]!)
    )
    expect(mapping).toBeDefined()
    expect(mapping!.sourceOffsets[0]! + (generated - mapping!.generatedOffsets[0]!)).toBe(original)
  })
```

Append to `test/diagnostics.test.ts`:

```ts
import { formatDiagnostic } from "../src/compiler/index.ts"

describe("formatting", () => {
  it("renders a code frame", () => {
    const source = "const a = 1\nconst = 2\n"
    const [diagnostic] = toTypeScript(source).diagnostics
    expect(formatDiagnostic(source, "x.efx", diagnostic!)).toMatch(/^x\.efx:2:7 - error EFX1001: .+\n\n2 \| const = 2\n {2}\| {7}\^/)
  })
})
```

- [ ] **Step 2: Run tests to verify the import test fails**

Run: `pnpm vitest run --project effectscript packages/effectscript/core/test/transform.test.ts packages/effectscript/core/test/mappings.test.ts packages/effectscript/core/test/diagnostics.test.ts`
Expected: the import-extension test FAILS. The mapping and formatting tests should pass already. If
the mapping test fails, fix `toCodeMappings` until it passes.

- [ ] **Step 3: Implement specifier rewriting**

`src/compiler/transform/imports.ts`:

```ts
/**
 * Rewrites relative `.efx` module specifiers (for `efx build` output).
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Handler } from "../context.ts"
import type { HandlerGroup } from "./index.ts"

const rewrite: Handler = (node, _parent, ctx) => {
  const extension = ctx.options.rewriteImportExtensions
  if (extension === false) return
  const source: Node | null | undefined = node.type === "ImportExpression" ? node.source : node.source
  if (source?.type !== "Literal" || typeof source.value !== "string") return
  const value: string = source.value
  if (!value.startsWith(".") || !value.endsWith(".efx")) return
  const end = source.end - 1 // before the closing quote
  ctx.s.update(end - 4, end, `.${extension}`)
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const importRewriteHandlers: HandlerGroup = {
  ImportDeclaration: rewrite,
  ExportAllDeclaration: rewrite,
  ExportNamedDeclaration: rewrite,
  ImportExpression: rewrite
}
```

Register it (any position, because it only touches string literals):
`registry(importRewriteHandlers, schemaHandlers, …)`.

- [ ] **Step 4: Write the README**

`packages/effectscript/core/README.md`:

````md
# EffectScript

TypeScript with Effect as native syntax. `.efx` files are a superset of `.ts`/`.tsx` and
compile to idiomatic Effect v4 TypeScript.

```ts
export effect getUser(id: UserId): User throws UserNotFound {
  const users = await Users
  return await users.find(id)
} |> retry({ times: 3 })
```

compiles to

```ts
import { Effect } from "effect"
export const getUser = Effect.fn("getUser")(function*(id: UserId): Effect.fn.Return<User, UserNotFound> {
  const users = yield* Users
  return yield* users.find(id)
}, Effect.retry({ times: 3 }))
```

## Compiler API

```ts
import { toTypeScript } from "effectscript/compiler"

const { code, map, mappings, diagnostics, mode } = toTypeScript(source, {
  filename: "src/users.efx",
  packageName: "my-app",
  runtime: "node"
})
```

The compiler has no Node dependencies, so it runs in the browser. See the design spec in
`docs/superpowers/specs/2026-10-02-effectscript-design.md` for the full language.
````

- [ ] **Step 5: Full verification**

Run: `pnpm vitest run --project effectscript`
Expected: every effectscript test passes, including superset, typecheck, runtime, golden,
diagnostics, mappings, and prelude.

Run: `pnpm check`
Expected: exit 0.

Run: `pnpm lint`
Expected: exit 0. If dprint flags formatting in `src`, run `pnpm lint-fix`, re-run the tests, and
commit the formatting separately.

Run: `pnpm --filter effectscript codegen && git diff --exit-code packages/effectscript/core/src/compiler/prelude/tables.ts`
Expected: no diff, meaning the generated tables are reproducible.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core
git commit -m "feat(effectscript): import extension rewriting, mapping guarantees and README"
```

---

## Self-Review Notes (for the executor)

- **Spec coverage in this plan:** §3 parsing and modes (Tasks 2–4); §4.1–4.13 (Tasks 5–16);
  §5 architecture and API (Tasks 3, 17); §11 testing layers for the core (superset, golden,
  type-check, runtime, diagnostics, mappings).
- **Deferred to later plans (by design):**
  - §4.14–4.17 (library constructs, ambient capture, observability, strict mode) → Plan 2.
  - §6 reverse compiler → Plan 3.
  - §7 CLI and integrations → Plan 4.
  - Language tooling → Plan 5.
  - Skill → Plan 6.
  - Site and registration (§9, §10) → Plan 7.
- **Known risk areas,** each covered by a test that will fail loudly:
  - magic-string ordering at shared offsets: the `pipes`, `mixed`, `service`, and `match` fixtures.
  - acorn-typescript internals: the parser tests, plus fallbacks described in Tasks 4 and 12.
  - The globals exclusion list: the superset test.
