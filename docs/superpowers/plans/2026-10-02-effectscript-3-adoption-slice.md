# EffectScript Plan 3: Adoption Slice Implementation Plan

> **For agentic workers:** execute task by task (TDD: write the failing test, watch it fail,
> implement, watch it pass, commit). Steps use checkbox (`- [ ]`) syntax. Decisions are in
> `docs/adr/`. A ruling that changes a decision gets a new ADR (`.agents/AGENTS.md`).

**Goal:** Prove the whole adoption path on one committed fixture project, per ADR-0016:
- An `.efx` module (an effect, a schema and a typed failure) is consumed by a plain `.ts` file.
- It builds to `.js` + `.d.ts`, type-checks with real `tsc` (errors mapped to `.efx`), and runs on
  Node.
- Editing works, including on incomplete code.
- It converts back to EffectScript.
- It is consumed as a packed package with no EffectScript tooling.

**Architecture:**
- A new package, `@effectscript/language`, holds the Volar language plugin, the TypeScript server
  plugin and `efx-tsc` (ADR-0019).
- Core gains:
  - incomplete-code recovery (ADR-0020);
  - `effectscript/register` for Node (ADR-0021);
  - a minimal `efx` CLI (`build`/`check`/`run`), with a graph-aware build (ADR-0022);
  - the reverse compiler for the slice subset (ADR-0023).
- A private VS Code extension package wires the TS server plugin.

**Tech Stack:** TypeScript 6.0.3 (JS API), Volar 2.4.28 (`@volar/language-core`,
`@volar/typescript`), Node 24.21, vitest, the workspace `effect`.

**Spec:** `docs/superpowers/specs/2026-10-02-effectscript-design.md` (§6, §7.1–7.4).
**Decisions:** ADR-0016, 0019–0023. **Review:** R07–R10, R14, R15.

## Global Constraints

- `src/compiler/**` stays browser-safe. Node APIs only in `register.ts`, `cli/**` and the language
  package.
- Volar packages are pinned to `2.4.28`. `typescript` is `^6.0.3`: a dev dependency, and an
  optional peer of `effectscript` and `@effectscript/language`.
- Every claim added to READMEs names its evidence and state (planned / implemented / locally
  tested / host-qualified / released): review R15.
- Tests that spawn processes (`node`, `tsserver`, `efx`) use temp directories under `os.tmpdir()`.
  They clean up after themselves and time out at 120 s.
- Commit after each task, with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  trailer.

## Review Focus

1. **Recovery on the cursor's own line** (`const x = n.` as the last line of an `effect` body):
   completion must offer `toFixed`.
2. **A `.ts` file importing `.efx`, renamed from the `.efx` side:** the rename must update both
   files.
3. **Graph-aware build with a TSX `.efx` imported by a TS `.efx`:** the staged import must end in
   `.tsx`, and the emitted JS must import `.js`.
4. **Reverse conversion of a user object named `Effect`:** it must stay TypeScript.
5. **A packed consumer with no EffectScript dependency:** `tsc` and `node` must both succeed.

---

### Task 1: Incomplete-code recovery (ADR-0020)

**Files:** Modify `src/compiler/options.ts` (`recover?: boolean`, `CompileResult.recovered?:
boolean`) and `src/compiler/compile.ts`. Test: `test/recover.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

describe("ADR-0020: recovery", () => {
  it("keeps the half-typed line and compiles the rest", () => {
    const source = "export effect f(n: number) {\n  const x = n.\n  return 1\n}\n"
    const result = toTypeScript(source, { recover: true })
    expect(result.recovered).toBe(true)
    expect(result.diagnostics.map((d) => d.code)).toContain("EFX1001")
    expect(result.code).toContain("Effect.fn(\"f\")(function*(n: number) {\n  const x = n.\n")
    const offset = source.indexOf("n.\n") + 2
    const mapping = result.mappings.find((m) => m.sourceOffsets[0]! <= offset && offset <= m.sourceOffsets[0]! + m.lengths[0]!)
    expect(mapping?.data.completion).toBe(true)
  })

  it("does not recover unless asked", () => {
    expect(toTypeScript("effect f() {\n  const x = .\n}\n").code).toBe("")
  })
})
```

- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** the ADR-0020 algorithm in `compile.ts`. Use a `compileOnce(source,
  resolved)` helper. On `parse` failure with `recover`, take the error offset from the parse
  diagnostic and try the candidate line ranges. Blank them by replacing every non-newline character
  with a space. For the first successful compile, locate the blanked region's generated offset by
  scanning `mappings` for the one covering the region start (verbatim, same length), then splice the
  original text back into `code`. Merge the parse diagnostic into `diagnostics` and set
  `recovered: true`.
- [ ] **Step 4: Run** the file, then the whole project.
- [ ] **Step 5: Commit** `feat(effectscript): incomplete-code recovery for editors (ADR-0020)`.

### Task 2: `@effectscript/language` with the Volar language plugin

**Files:**
- Create `packages/effectscript/language/{package.json,tsconfig.json,README.md}`,
  `src/index.ts` (barrel, `@since` docs), `src/languagePlugin.ts`, `test/utils/harness.ts`,
  `test/languageService.test.ts`.
- Register: `tsconfig.packages.json` (reference), `vitest.config.ts`
  (`project("@effectscript/language", "packages/effectscript/language")`), `tsconfig.tests.json`
  paths (`"@effectscript/language": ["./packages/effectscript/language/src/index.ts"]`). The
  package exports follow core (`.` → `src/index.ts` in development, `dist` in publishConfig).
- Dependencies: `@volar/language-core` and `@volar/typescript` at `2.4.28`, `effectscript`
  `workspace:^`. Dev dependencies: `typescript ^6.0.3`, `@types/node`, `vitest`, `effect`
  `workspace:^`.

**Interfaces:**
- `createLanguagePlugin(ts: typeof import("typescript")): LanguagePlugin<string>`.
  `createVirtualCode` compiles with `{ filename, recover: true }` and returns
  `{ id: "root", languageId: "typescript" | "typescriptreact", snapshot, mappings }`.
  `typescript.extraFileExtensions` is
  `[{ extension: "efx", isMixedContent: true, scriptKind: 7 /* Deferred */ }]`, and
  `getServiceScript` returns the root with extension `.ts` or `.tsx` and the matching
  `ScriptKind`. Snapshots are hand-built `{ getText, getLength, getChangeRange: () => undefined }`.
- `test/utils/harness.ts`: `createHarness(files: Record<string, string>)` returns `{ service:
  ts.LanguageService, dir }`. It wires `createLanguage` + `createProxyLanguageService` +
  `decorateLanguageServiceHost` as tsserver does: the original `getScriptSnapshot` is captured
  before decoration, and the host has `resolveModuleNameLiterals` and `allowNonTsExtensions`.
  Compiler options point `effect` at the workspace source, with `lib: ["ESNext"]`.

- [ ] **Step 1: Failing tests** (`test/languageService.test.ts`)

```ts
import { describe, expect, it } from "vitest"
import { createHarness } from "./utils/harness.ts"

const a = "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\nexport schema User { name: string }\n"
const b = "import { double, User } from \"./a.efx\"\nexport const r = double(2)\nexport const u = new User({ name: 1 })\n"

describe("language service over .efx", () => {
  const { dir, service } = createHarness({ "a.efx": a, "b.ts": b })

  it("type-checks a .ts consumer of an .efx module", () => {
    const messages = service.getSemanticDiagnostics(`${dir}/b.ts`).map((d) => d.messageText)
    expect(messages).toEqual(["Type 'number' is not assignable to type 'string'."])
  })

  it("navigates from .ts to the .efx declaration", () => {
    const [definition] = service.getDefinitionAtPosition(`${dir}/b.ts`, b.indexOf("double(2)"))!
    expect(definition!.fileName).toBe(`${dir}/a.efx`)
    expect(a.slice(definition!.textSpan.start, definition!.textSpan.start + 6)).toBe("double")
  })

  it("renames across .efx and .ts", () => {
    const locations = service.findRenameLocations(`${dir}/a.efx`, a.indexOf("double"), false, false, {})!
    expect(locations.map((l) => l.fileName.split("/").pop()).sort()).toEqual(["a.efx", "b.ts", "b.ts"])
  })

  it("hovers and completes inside effect code", () => {
    const hover = service.getQuickInfoAtPosition(`${dir}/a.efx`, a.indexOf("x * 2"))!
    expect(hover.displayParts!.map((p) => p.text).join("")).toBe("const x: number")
    const names = service.getCompletionsAtPosition(`${dir}/a.efx`, a.indexOf("x * 2"), {})!.entries.map((e) => e.name)
    expect(names).toEqual(expect.arrayContaining(["n", "x"]))
  })

  it("completes members on a half-typed line (ADR-0020)", () => {
    const source = "export effect f(n: number) {\n  const x = n.\n  return 1\n}\n"
    const harness = createHarness({ "c.efx": source })
    const names = harness.service.getCompletionsAtPosition(`${harness.dir}/c.efx`, source.indexOf("n.\n") + 2, {})!
      .entries.map((e) => e.name)
    expect(names).toContain("toFixed")
  })
})
```

- [ ] **Step 2: Run:** FAIL (the module doesn't exist).
- [ ] **Step 3: Implement** the package, the plugin and the harness (they mirror the 2026-10-02
  spike). Run `pnpm install` after adding the package.
- [ ] **Step 4: Run** the language project, the core project, `pnpm check` and `pnpm lint`.
- [ ] **Step 5: Commit** `feat(effectscript): @effectscript/language Volar plugin (ADR-0019)`.

### Task 3: TypeScript server plugin, tested through a real tsserver

**Files:** Create `src/typescriptPlugin.ts` (`createLanguageServicePlugin((ts) => ({
languagePlugins: [createLanguagePlugin(ts)] }))`, exported as `module.exports`-compatible default
and as a named export). Tests: `test/tsserver.test.ts` and a fixture project under
`test/fixtures/tsserver/` (`tsconfig.json` with `plugins: [{ name: "@effectscript/language" }]`,
`a.efx`, `b.ts`).

- [ ] **Step 1: Failing test.** Spawn `node <typescript6>/lib/tsserver.js --useInferredProjectPerProjectRoot
  --pluginProbeLocations <language package dir> --globalPlugins @effectscript/language`. Send
  `open` for `b.ts` and `a.efx` (`scriptKindName: "TS"`), then a `definition` request on `double` in
  `b.ts`. Parse the `Content-Length`-framed JSON responses. Expect the definition `file` to end
  with `a.efx`, and the `completionInfo` at `x * 2` to include `n`.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** the plugin entry. If tsserver can't `require` the ESM entry on Node 24,
  add a small CommonJS shim `typescriptPlugin.cjs`, with `"main"` pointing at it, that `require`s
  the built ESM through `require(esm)`. Record the outcome in ADR-0019's Consequences via a new
  ADR, if the decision changes.
- [ ] **Step 4: Run** the test (120 s timeout).
- [ ] **Step 5: Commit** `feat(effectscript): TypeScript server plugin for .efx`.

### Task 4: `efx-tsc` (ADR-0019)

**Files:** Create `src/efxTsc.ts` (calls `runTsc(require.resolve("typescript/lib/tsc"), {
extraSupportedExtensions: [".efx"], extraExtensionsToRemove: [] }, (ts) =>
[createLanguagePlugin(ts)])`), `bin/efx-tsc.js` (imports it), the package.json `bin`, and the
test `test/efxTsc.test.ts` with a fixture project `test/fixtures/check/`.

- [ ] **Step 1: Failing test.** Spawn `node bin/efx-tsc.js -p test/fixtures/check/tsconfig.json`.
  Expect exit code 2, and stdout containing exactly the two mapped errors
  `src/bad.efx(2,9): error TS2322` and `src/use.ts(3,29): error TS2322`, with no error from
  `effect` sources. The fixture tsconfig uses `lib: ["ESNext"]` and `paths` to the workspace
  `effect`.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement.** **Step 4: Run.**
- [ ] **Step 5: Commit** `feat(effectscript): efx-tsc type-checks .efx with mapped diagnostics`.

### Task 5: `effectscript/register` for Node (ADR-0021)

**Files:** Create `packages/effectscript/core/src/register.ts` (the hooks from the spike, plus a
TSX rejection). Export `./register` in package.json (`src/register.ts`; publish
`dist/register.js`). Test: `test/register.test.ts` with a fixture `test/fixtures-node/register/`
(`main.ts` imports `lib.efx`, which uses an `enum` and imports `./util.ts`).

- [ ] **Step 1: Failing test.** Spawn `node --import <core>/src/register.ts main.ts` in a temp
  copy of the fixture, with a `node_modules/effect` symlink to the workspace package. Expect stdout
  `hi ada (3) Green`. A second case with a TSX `.efx` expects a non-zero exit and stderr containing
  `EFX1101`.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement.** **Step 4: Run.**
- [ ] **Step 5: Commit** `feat(effectscript): run .efx on Node with effectscript/register (ADR-0021)`.

### Task 6: Minimal `efx` CLI: `build`, `check`, `run` (ADR-0022)

**Files:**
- Create `packages/effectscript/core/src/cli/{main.ts,build.ts,check.ts,run.ts}` and
  `bin/efx.js`, plus the package.json `bin` and the optional peers `typescript ^6`,
  `@effectscript/language`.
- `build.ts` exports `build(options: { project: string }): BuildResult`, which reads the tsconfig
  with TS 6 (`ts.getParsedCommandLineOfConfigFile`).
  1. Compile every `.efx` under the config's root directory into a manifest (`Map<abs path,
     { mode, code }>`), and stop on error diagnostics.
  2. Write the staging tree (`<outDir>/.efx-staging`). Rewrite relative `.efx` specifiers
     (`ImportDeclaration`, `ExportNamedDeclaration`/`ExportAllDeclaration` with a source,
     `ImportExpression` with a literal source) to the target's staged extension. Use the compiler's
     AST through `parse` plus `MagicString`, not regexes.
  3. Run `ts.createProgram` on the staged files with the original options plus
     `rewriteRelativeImportExtensions: true`, `rootDir: staging`, and `outDir`, then `emit()`.
  4. Report diagnostics mapped back to `.efx` lines with `formatDiagnostic`.
- `check.ts` spawns `efx-tsc` from `@effectscript/language` with the given arguments. If the
  package is missing, it explains how to install it. `run.ts` spawns
  `node --import effectscript/register <file>`.
- Test: `test/cli.test.ts`, on a temp copy of fixture `test/fixtures-node/build/`, which contains
  `src/view.efx` (TSX mode, `<div />` with `jsx: "preserve"`… use `react-jsx` with a local
  `jsx-runtime` stub), `src/users.efx` importing `./view.efx`, and `src/index.ts`.

- [ ] **Step 1: Failing test.** After `efx build -p <tmp>/tsconfig.json`:
  - `dist/users.js` imports `./view.js`;
  - `dist/users.d.ts` exists;
  - the staged `users.ts` imports `./view.tsx`;
  - `node dist/index.js` prints the expected value.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement.** **Step 4: Run.**
- [ ] **Step 5: Commit** `feat(effectscript): efx build/check/run with graph-aware imports (ADR-0022)`.

### Task 7: Reverse compiler subset (ADR-0023)

**Files:** Create `packages/effectscript/core/src/compiler/reverse/{index.ts,effect.ts,schema.ts,
origin.ts}`. Export `toEffectScript` and `ConvertResult` (`{ code, notes: Array<{ start, end,
message }> }`) from `src/compiler/index.ts`. Test: `test/reverse.test.ts`.

**Interfaces:** `origin.ts`: `effectBinding(program, module, name): string | undefined` returns
the local name bound by an import of `name` from `module` (any alias), or `undefined`.

- [ ] **Step 1: Failing tests**

```ts
import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const roundTrip = (efx: string) => toEffectScript(toTypeScript(efx).code).code

describe("ADR-0023: reverse compiler subset", () => {
  it.each([
    "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\n",
    "error NotFound { id: string }\n\nexport effect find(id: string): string throws NotFound {\n  if (id === \"\") throw new NotFound({ id })\n  return id\n}\n",
    "export schema User {\n  name: string\n  email?: string\n}\n"
  ])("round-trips %s", (efx) => {
    const back = roundTrip(efx)
    expect(back).toBe(efx)
    expect(toEffectScript(toTypeScript(back).code).code).toBe(back) // fixed point
  })

  it("never re-sugars a user object named Effect", () => {
    const ts = "const Effect = { fn: (_: string) => (f: unknown) => f }\nexport const f = Effect.fn(\"f\")(function*() { return 1 })\n"
    expect(toEffectScript(ts).code).toBe(ts)
  })

  it("recognizes an aliased import and explains near misses", () => {
    const result = toEffectScript("import { Effect as E } from \"effect\"\nexport const g = E.fn(\"other\")(function*() { return 1 })\n")
    expect(result.code).toContain("E.fn(\"other\")")
    expect(result.notes.map((n) => n.message).join()).toMatch(/span name/)
  })
})
```

`roundTrip` works on the compiled output, which carries the generated `import { Effect } from
"effect"`. The reverse step removes imports it made unused, so the original `.efx` (which had no
imports) is reproduced. If a builtin was qualified (`succeed` → `Effect.succeed`), the reverse
step un-qualifies it when it is free and not excluded (§4.13).

- [ ] **Step 2: Run:** FAIL. **Step 3: Implement** with `parse` + `MagicString` edits, mirroring
  the forward transforms. **Step 4: Run** the file, the core project, check and lint.
- [ ] **Step 5: Commit** `feat(effectscript): reverse compiler for the adoption-slice subset (ADR-0023)`.

### Task 8: The adoption fixture project, end to end

**Files:**
- Create `packages/effectscript/examples/adoption/`:
  - `package.json`: private; `"name": "effectscript-adoption"`; `exports` → `dist/index.js` with
    `types`.
  - `tsconfig.json`.
  - `src/users.efx`: an `error UserNotFound`, a `schema User`, an `effect findUser` that throws, and
    an `effect describeUser` with a typed catch.
  - `src/index.ts`: re-exports and a `runDemo()` using `Effect.runSync`.
  - `src/main.ts`: prints `runDemo()`.
- Test: `packages/effectscript/language/test/adoption.test.ts`, which copies the project to a temp
  directory and checks:
  1. `efx check` passes. After injecting an error into `users.efx`, it fails with the mapped
     line and column.
  2. `node --import effectscript/register src/main.ts` prints the demo line.
  3. `efx build` succeeds, and `node dist/main.js` prints the same line.
  4. `npm pack` produces a tarball. A temp consumer (`package.json` depending on the tarball plus
     `effect` linked from the workspace) runs plain TypeScript 6 `tsc --noEmit` on a `.ts` file
     importing the package (no EffectScript plugin) and `node` running it. Both succeed.
  5. `toEffectScript` applied to the built `.ts` staging output of `users.efx` reproduces the
     source modulo the §6.4 normalizations (imports).
  6. The language-service harness gives completion and definition across `index.ts` ↔
     `users.efx`.

- [ ] **Step 1: Write the test.** **Step 2: Run:** FAIL until the fixture exists. **Step 3:**
  Create the fixture. **Step 4: Run** (allow 240 s).
- [ ] **Step 5: Commit** `test(effectscript): end-to-end adoption slice fixture`.

### Task 9: VS Code extension package (private)

**Files:**
- Create `packages/effectscript/vscode/`:
  - `package.json`: `name: "effectscript-vscode"`, private, `engines.vscode: "^1.95.0"`.
  - `contributes.languages`: `effectscript`, `.efx`, `language-configuration.json`.
  - `contributes.grammars`: `source.efx`, which includes `source.tsx`, plus an injection grammar
    for EffectScript keywords, `|>` and `%`.
  - `contributes.typescriptServerPlugins`:
    `[{ name: "@effectscript/language", enableForWorkspaceTypeScriptVersions: true, languages: ["effectscript"] }]`.
  - `contributes.commands`: `effectscript.showCompiledTypeScript` (the implementation lands in
    Plan 7).
  - Also `language-configuration.json`, `syntaxes/effectscript.tmLanguage.json` and `README.md`.
- Test: `packages/effectscript/language/test/vscode-manifest.test.ts`. It validates the manifest
  references: files exist, grammar scope names match, and the plugin name equals the language
  package name. It also tokenizes a sample with `vscode-textmate` + `vscode-oniguruma` (dev
  dependencies of the language package) and checks that `effect`, `await` and `|>` get their
  scopes.

- [ ] Steps 1–5 as in the other tasks. Commit
  `feat(effectscript): VS Code extension manifest, grammar and TS plugin wiring`.

### Task 10: Compatibility matrix and qualified docs (R09, R15)

**Files:**
- Create `packages/effectscript/COMPATIBILITY.md`. One row per host path, with version, state,
  evidence (test file) and limits:
  - TS 6 checker, TS server plugin, Node register, `efx build`, packed consumer, the browser
    compiler;
  - TS 7 native, Bun, Vite and Astro: planned or unsupported.
- Update `packages/effectscript/core/README.md` and `language/README.md` to link it. Update spec
  §7.2/§7.3 and §13 (Plan 3 done), and fix the Node register requirement to what ADR-0021
  qualified.
- Test: none (docs only). Run `pnpm lint-fix`.
- [ ] Commit `docs(effectscript): compatibility matrix with evidence`.

---

## Final review

Run a whole-branch review from the Plan 3 base commit on the most capable model. Give it this
plan, ADRs 0016 and 0019–0023, and review sections R07–R10, R14 and R15. Fix Critical/Important
findings in one pass, each with a failing test first. Record deferred minors here.

## Rulings during execution

- **Task 6:** the slice `efx` CLI parses its few arguments by hand instead of using
  `effect/unstable/cli` with `.efx` handlers (spec §7.1). The dogfooded CLI arrives with the full
  CLI/distribution plan. Cost if wrong: one rewrite of `src/cli/main.ts`. Staging lives in
  `node_modules/.cache/effectscript/build`, so it is never packed with `dist/`.
