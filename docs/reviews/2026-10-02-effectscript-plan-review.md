# EffectScript: full plan review and agent handoff

Date: 2026-10-02, Asia/Tokyo. Repository: `effect-lang`.

Implementation snapshot rechecked for this handoff: `d35711c3c` (`feat(effectscript): import extension rewriting, mapping guarantees and README`). Implementation was advancing during the review. Revalidate findings against the receiving agent's checkout before treating them as unresolved.

## Purpose and overall assessment

This document reviews the whole EffectScript design and delivery plan. It preserves the review as an actionable handoff for another agent to assess, improve the plans, and implement fixes within the user's authorized scope. Recommendations here are proposals, not additional decisions already made with the user.

The direction is strong: a TypeScript superset, ordinary Effect TypeScript output, a browser-compatible compiler, mixed `.ts`/`.efx` projects, and conservative reverse conversion form a useful product. Keep that direction. The largest improvements concern semantic stability, generated binding hygiene, a precise reversibility contract, and proving the editor/type-checker/module-graph workflow earlier.

The most urgent observed problems are generated identifiers resolving to user bindings, topic pipelines changing evaluation order, and optional schema fields disagreeing with the stated exact-optional contract. The current `try` and catch-clause rules also expose behavior changes that deserve an explicit language decision before becoming compatibility commitments.

Do not respond to this review by expanding the language further. First make the existing semantics precise and prove the adoption path with a small real project. The wider ambition can remain in the roadmap.

## Instructions for the receiving agent

1. Read the repository's current guidance and the two primary documents linked below. Check the current branch, HEAD, and working tree; concurrent implementation may have resolved some items.
2. Reproduce R01, R04, and R06 first. Classify each finding as confirmed, fixed, accepted tradeoff, deferred, or disproved, with evidence.
3. Resolve the contracts in R02, R03, R05, and R07 before making fixes that depend on them. Record the chosen behavior in the design and mirror it in the implementation plan and tests.
4. Implement cohesive fixes with targeted verification. Follow repository validation instructions for the actual change; avoid broad rewrites or unrelated cleanup.
5. Prove the mixed-module vertical slice in R08–R10, then revisit conversion, release policy, and public claims.
6. Report what changed, what was executed, and what remains unverified. A green golden snapshot is not proof of runtime behavior, editor behavior, or host compatibility.

Use the native workflow and relevant specialist skills. The user explicitly prefers one workflow framework and requests Compound Engineering only when named. The implementation plan's mandatory `superpowers` instruction does not override the user's current instructions.

This handoff does not authorize publishing, deployment, messaging another agent's chat, or unrelated repository changes. It also does not require a new approval gate for reversible work already authorized by the user.

## Sources and evidence vocabulary

Primary repository sources:

- [EffectScript design specification](../superpowers/specs/2026-10-02-effectscript-design.md)
- [Plan 1: core compiler](../superpowers/plans/2026-10-02-effectscript-1-core-compiler.md)
- [Repository agent guidance](../../.agents/AGENTS.md)
- [Current compiler](../../packages/effectscript/core/src/compiler/)
- [Current compiler tests](../../packages/effectscript/core/test/)
- [Current Effect runtime and APIs](../../packages/effect/src/)

Plan 1 is the detailed written implementation plan reviewed here. Later phases are described in the specification; their implementation details should not be presented as if equally detailed plans already exist.

Evidence labels used below:

| Label                    | Meaning                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Observed implementation  | Inspected or reproduced in the compiler at the recorded snapshot.                                                         |
| Verified Effect behavior | Executed against this checkout's Effect implementation.                                                                   |
| Plan/design analysis     | A contradiction, missing contract, or risk established from the documents; not necessarily a reproduced compiler failure. |
| Recommendation           | The reviewer's proposed change. The receiving agent should assess it rather than blindly adopt it.                        |
| Needs verification       | A focused investigation is still required before asserting a concrete failure.                                            |

The follow-up recheck ran with Node `v24.21.0`. The temporary probe exited successfully after its fixture was corrected to avoid an unintended prelude name. It was removed afterward. This was targeted verification, not a full suite run or an editor/integration qualification.

## Preserve these user decisions

The specification records the following settled direction. This review does not reopen it:

- Name and extension: **EffectScript**, `.efx`.
- `effect` declarations and `await` as Effect binding inside effect code. The earlier `run`, `perform`, and postfix alternatives were rejected.
- Bare Effect combinators, with documented namespace and shadowing rules.
- Placement in the Effect monorepo.
- One extension with JSX detection.
- A pure JavaScript browser compiler.
- Scope covering compiler, CLI, runtime integrations, editor, site, and AI skill.

The review does recommend changing some assumptions and sequencing, especially versioning, exact round-trip claims, and the order in which integrations are proven. Do not silently reinterpret those recommendations as previously approved user choices.

## Priority map

Here, P0 means generated code can silently execute against the wrong binding. P1 means a semantic or compatibility contract should be resolved before a trustworthy public preview. P2 means a substantial delivery or usability improvement. P3 means polish or a future investigation.

| ID  | Priority | Finding                                                                  | Evidence                                 | First outcome                                    |
| --- | -------- | ------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------ |
| R01 | P0       | Generated references are not hygienic                                    | Observed implementation                  | Binding-aware generated references               |
| R02 | P1       | `try` meaning changes with body syntax                                   | Observed + runtime                       | Stable failure/defect/finally contract           |
| R03 | P1       | Catch grouping changes handler behavior                                  | Verified runtime + implementation        | One catch-dispatch model                         |
| R04 | P1       | Pipelines can change evaluation order                                    | Observed implementation + runtime traces | Defined order and preserving lowering            |
| R05 | P1       | Resource lifetime and control-flow restrictions need a complete contract | Design analysis                          | Lifetime and finalizer matrix                    |
| R06 | P1       | Optional schema fields violate exact-optional expectations               | Observed + runtime                       | Correct absent/undefined mapping                 |
| R07 | P1       | Round-trip equivalence is underspecified                                 | Design analysis                          | Canonicalization and blocker rules               |
| R08 | P1       | The hardest adoption claims are validated too late                       | Delivery analysis                        | A real mixed-module/editor vertical slice        |
| R09 | P1       | Runtime and TypeScript toolchains need an explicit matrix                | Local/source evidence                    | Supported parse/check/run combinations           |
| R10 | P1       | Import extension rewriting needs module-graph information                | Observed implementation                  | Resolver-aware output paths                      |
| R11 | P2       | Lockstep versioning couples unrelated compatibility promises             | Design analysis                          | Independent language/Effect compatibility policy |
| R12 | P1       | Project conversion needs transactional safety                            | Design analysis                          | Coherent, reviewable conversion with rollback    |
| R13 | P1       | Syntactic diagnostics are being asked to provide semantic guarantees     | Design analysis                          | Split syntax checks from checker-backed rules    |
| R14 | P1       | Verification needs behavior tests beyond generated goldens               | Test analysis                            | Focused semantic and integration gates           |
| R15 | P2       | Public claims and AI benefits should track evidence                      | Design analysis                          | Qualified claims and a reproducible evaluation   |

## Detailed findings

### R01 — Make every generated binding hygienic

**Evidence: observed implementation.** [Import bookkeeping](../../packages/effectscript/core/src/compiler/imports.ts) suppresses a needed import if the same identifier is already bound at module scope. Transforms still emit literal names such as `Effect`, regardless of what that user binding represents.

This input compiled with no diagnostics:

```ts
const Effect = { fn: () => () => "wrong" }
export effect f() { return 1 }
```

The compiler emitted:

```ts
const Effect = { fn: () => () => "wrong" }
export const f = Effect.fn("f")(function*() {
  return 1
})
```

The generated declaration now calls the user's object. This is a semantic bug, not merely an unused-import or type-checking issue.

Inner shadowing also matters. This input:

```ts
export effect f(Effect: unknown) {
  return effect { return 1 }
}
```

emitted an outer import of `Effect`, but the generated inner `Effect.gen(...)` still resolves to the parameter.

**Recommended change:** introduce a binding-aware mechanism for requesting compiler references. Reuse an existing import only when its module, exported symbol, import kind, and accessibility at the use site are verified. Otherwise choose a fresh alias and consistently use it. A user-prelude lookup and a compiler-required runtime reference are different operations: user shadowing should affect the former without capturing the latter.

Apply this to every generated namespace, runtime import, service reference, and temporary. Avoid a one-off `Effect` patch.

**Acceptance criteria:**

- Module and nested bindings named `Effect`, `Schema`, `Context`, `Match`, `pipe`, and runtime namespaces cannot capture generated references.
- Named aliases, namespace imports, type-only imports, and mixed imports are handled deliberately.
- Existing verified imports are reused without duplicates.
- Output remains readable and type-checks; runtime tests prove the compiler-owned reference is the one executed.
- Reverse recognition uses binding identity rather than accepting any object named `Effect`.

### R02 — Stabilize `try` semantics and distinguish failures, defects, and exceptions

**Evidence: observed implementation and verified Effect behavior.** Specification §4.4 and [the try transform](../../packages/effectscript/core/src/compiler/transform/try.ts) choose native JavaScript `try` or Effect handlers based on whether the try block contains selected syntax such as `await` or `throw`.

Consequently, adding an unrelated Effect await can change whether an existing synchronous exception is caught:

```ts
effect f() {
  try { return JSON.parse("{") }
  catch { return "caught" }
}
```

This remains a native catch and returns `"caught"`. By contrast:

```ts
effect f() {
  try {
    JSON.parse("{")
    return await succeed(1)
  }
  catch { return "caught" }
}
```

lowers to an inner `Effect.gen(...).pipe(Effect.catch(...))`. The synchronous exception becomes a defect and the failure handler does not catch it. The direct Effect probe returned a failure whose cause contains a defect.

Classification only examines the try block. Awaiting in a catch or finally does not necessarily trigger the Effect lowering. Ambient capture may also introduce yields after the initial classification.

Native generator `finally` is insufficient as an Effect cleanup guarantee. This probe produced `finalized === false` after a failed yielded Effect:

```ts
let finalized = false
Effect.runSyncExit(Effect.gen(function*() {
  try {
    return yield* Effect.fail("failed")
  } finally {
    finalized = true
  }
}))
```

**Recommended change:** give `try` inside effect code one stable Effect-failure meaning, with explicit `Effect.try` and `Effect.tryPromise` boundaries for synchronous exceptions and Promises. This is a proposed language decision, not a claim that it has already been adopted. If retaining the hybrid model, document and justify its discontinuities and prove every relevant case.

Preserve existing explicit control-flow restrictions unless a correct lowering replaces them. In particular, partial returns and jumps across introduced generator boundaries need deliberate handling.

**Acceptance criteria:** publish and test a matrix for typed failure, synchronous exception, defect, interruption, catch failure, and finally failure. Cover awaits in try/catch/finally separately, ambient transformations, nested functions, success, and cancellation. A harmless added await must not silently redefine what an existing catch catches under the chosen contract.

### R03 — Use one catch-clause dispatch model

**Evidence: verified Effect behavior and observed implementation.** The plan groups several single-tag clauses into `Effect.catchTags`, but switches to sequential `Effect.catchTag` calls when unions appear. These are observably different:

```ts
const A = { _tag: "A" }
const B = { _tag: "B" }

Effect.fail(A).pipe(
  Effect.catchTags({
    A: () => Effect.fail(B),
    B: () => Effect.succeed("B caught")
  }),
  Effect.catch(() => Effect.succeed("fallback"))
)
// Result: "fallback"

Effect.fail(A).pipe(
  Effect.catchTag("A", () => Effect.fail(B)),
  Effect.catchTag("B", () => Effect.succeed("B caught")),
  Effect.catch(() => Effect.succeed("fallback"))
)
// Result: "B caught"
```

The second lowering allows a later sibling to catch a failure produced by an earlier handler. The grouped lowering does not. The final untyped fallback has its own handler-failure behavior too and must be covered by the same contract.

**Recommended change:** treat sibling clauses as alternatives over the original failure, unless the language explicitly chooses chaining. Expand unions without changing that model. Define source-order precedence and overlapping tags.

Tag inference also needs correction. The transform takes the last identifier of a type annotation as the runtime tag. An imported alias `Missing` can refer to a class tagged `NotFound`; an `error` declaration can have a custom `_tag`. Neither is resolved correctly by taking the annotation's spelling. Locally declared tags can be tracked syntactically. For arbitrary imports, require explicit tag information or use checker-backed resolution rather than pretending pure syntax knows the value.

**Acceptance criteria:** singles, unions, aliases, custom tags, overlaps, and untyped fallbacks follow the documented model. Failures produced inside handlers do not change which siblings run merely because a type annotation was rewritten as a union.

### R04 — Preserve pipeline evaluation order and lexical context

**Evidence: observed implementation and executed traces.** [The pipeline transform](../../packages/effectscript/core/src/compiler/transform/pipeline.ts) treats some member reads as safe to move. JavaScript getters and proxies make those reads observable.

```ts
const value = makeValue() |> obj.method(%)
```

currently emits:

```ts
const value = obj.method(makeValue())
```

The recorded trace is `getter, head`. A topic pipeline with head-first semantics requires `head, getter`. The [TC39 topic pipeline description](https://github.com/tc39/proposal-pipeline-operator#description) supports head evaluation before the pipeline body.

F#-style grouping needs a separate decision:

```ts
makeHead() |> stage(1) |> stage(2)
```

becomes `pipe(makeHead(), stage(1), stage(2))`, with this trace:

```text
head, make1, make2, apply1, apply2
```

A sequential stage-construction interpretation instead gives:

```text
head, make1, apply1, make2, apply2
```

The latter is a recommended interpretation, not an already established requirement for this custom F# dialect. Define the chosen behavior explicitly, then preserve it.

Additional issues:

- `freshName` tries `$`, `$$`, and `$$$`, then returns unchecked `$topic`.
- New callbacks can capture or be captured by bindings inside the right-hand side.
- Wrapping an effectful RHS in a plain arrow can place generated `yield*` in an invalid context.
- A local effect declaration call is not necessarily pipeable after its `Effect.fn` pipeables transform the return value.
- The hybrid dialect and its precedence differ from the current TC39 topic proposal. Describe those differences rather than implying identical standard semantics.

**Recommended change:** prioritize a precise F# contract and preserving lowering; add topic forms once their order and lexical rules are proven. Permit readable local temporaries where required. Preserve `this`, `arguments`, `await`, and binding semantics across any introduced boundary.

**Acceptance criteria:** runtime traces for getters, proxies, calls, constructors, stage factories, multiple topic uses, nested bindings, throws, and effectful RHSs match the chosen semantics. Collision tests exhaust the initial temporary names. `.pipe` optimization only happens with sufficient evidence.

### R05 — Define resource lifetime, finalizer behavior, and loop restrictions

**Evidence: plan/design analysis, with the generator-finally behavior in R02 verified.** Wrapping the enclosing effect in `Effect.scoped` gives `using` a function-wide lifetime. Resources acquired in a nested block or loop iteration can remain alive until the entire effect exits. That is a significant choice for a familiar resource-management keyword.

**Recommended change:** make `using` lifetime lexical to its block, or explicitly choose and explain a different lifetime. Specify `defer` independently; do not assume it must have the same lifetime as `using`.

The contract should define:

- When acquisition happens and when cleanup is registered.
- Whether a deferred expression captures a value now or evaluates it at cleanup.
- Cleanup order, partial acquisition failure, interruption during acquisition, and cancellation after registration.
- How a failing finalizer contributes to the exit cause.
- Behavior of resources returned from their scope.
- Which jumps are legal across introduced boundaries.

`Effect.addFinalizer` requires a finalizer with no typed error channel. Do not generalize that restriction to every cleanup API: this checkout's `Effect.ensuring` supports a failing finalizer. A `defer` block lowered to `Effect.sync` also needs a clear diagnostic if it contains effect awaits; silently producing invalid generated syntax is not an acceptable restriction.

The Stream lowering for `for await` introduces a callback boundary. `break`, `continue`, labels, and `return` need either a correct implementation or prominent diagnostics. Ordinary async iteration outside effect code should preserve TypeScript behavior.

**Acceptance criteria:** tests observe release before leaving the chosen scope, reverse registration order, early return, failure, interruption, and loop iteration lifetime. Every rejected control-flow form has a useful source diagnostic. Document the distinction between native disposal and Effect scoped acquisition.

### R06 — Align schema mappings with exact optional types

**Evidence: observed implementation and verified schema behavior.** The stated success criteria include `exactOptionalPropertyTypes`, but both [schema mapping](../../packages/effectscript/core/src/compiler/schema/mapping.ts) and [schema declaration emission](../../packages/effectscript/core/src/compiler/transform/schema.ts) map `?` to `Schema.optional`.

```ts
schema User { email?: string }
```

emits `email: Schema.optional(Schema.String)`. This accepts `{ email: undefined }`. The current `Schema.optionalKey(Schema.String)` rejects that object and permits absence, which matches the exact optional distinction.

**Recommended change:** use `optionalKey` for `email?: string`. Allow explicitly present `undefined` only when the source type includes it, such as `email?: string | undefined`. Verify both runtime decoding and the public generated type.

Also define the meaning of mutable/readonly arrays, `Map`/`ReadonlyMap`, and `Set`/`ReadonlySet`. A schema may deliberately produce a readonly view, but it must not be sold as exact preservation of a mutable TypeScript type without qualification.

Recursive and forward schema references require suspension or a clear diagnostic. Imported TypeScript types without corresponding runtime schema values cannot be reflected by a purely syntactic compiler.

**Acceptance criteria:** omission and explicit undefined have separate type/runtime cases; readonly choices are documented; recursive/forward references behave deliberately; unsupported type-to-schema reflection fails at the original source location with a useful alternative.

### R07 — Define reversibility as canonicalization plus semantic preservation

**Evidence: plan/design analysis.** Several source forms map to the same generated representation. `T[]`, `Array<T>`, and `ReadonlyArray<T>` can share a schema lowering; modifiers and formatting can disappear. The reverse compiler cannot recover information the forward compiler discarded.

Specification §6.4 currently defines equivalence through selected AST normalizations. That is useful but incomplete. Import sorting can hide meaningful module side-effect ordering, and moving a `runMain` statement is not generally semantics-neutral. AST equality is also separate from comment and documentation preservation.

**Recommended contract:**

```text
toEffectScript(toTypeScript(efx)) = normalizeEFX(efx)

toTypeScript(toEffectScript(ts)) = canonicalTS(ts)
  for supported shapes, preserving runtime behavior and public types

Unsupported shapes remain TypeScript with an explanation.
```

Define the normalization functions construct by construct. They must not silently permit observable order changes. Require a canonical fixed point after conversion. Keep binding-origin checks so a user-defined `Effect.gen` object is not recognized as the Effect library.

Classify schema spelling, comments, import order, span names, runtime choice, and generated aliases explicitly. A lossless fallback field preserves unsupported schema content only if the converter actually retains that content and associated comments.

**Acceptance criteria:** each shape has a supported inverse or a blocker reason; canonical fixtures reach a fixed point; semantic traces and exported declaration tests accompany structural normalization. Comments and side-effectful imports have dedicated cases. Avoid claiming arbitrary source-text recovery.

### R08 — Bring a complete adoption slice forward

**Evidence: delivery analysis.** The delivery phases put a broad compiler surface before the reverse compiler, integrations, and editor. The hardest product claims are whether people can use an `.efx` module in a real TypeScript project, get correct types and editor behavior, and leave again without damage.

**Recommended change:** keep the full scope but deliver a small end-to-end slice earlier. A minimal slice should contain:

- One `.efx` module with an effect, a schema, and a typed failure.
- A plain `.ts` consumer.
- A build and real type-check command.
- Running the result in one named runtime.
- An intentional diagnostic mapped to the original `.efx` range.
- Completion, rename, definition navigation, and displayed types in the supported editor.
- Reverse conversion of the supported subset.
- A packed package consumer that needs no EffectScript plugin to consume emitted declarations.

Malformed and incomplete editor source must be part of the early slice. Returning verbatim custom syntax after a parse failure does not give TypeScript a useful virtual document while the user is typing. Parser recovery and partial virtual code cannot be left entirely to a later roadmap if full IntelliSense is a first-release claim.

**Acceptance criteria:** a committed fixture project and scripted checks prove the build/check/run/consumer path; editor tests cover incomplete code and mapped actions. State which editor and runtime versions were actually qualified. Do not equate completion of Plan 1 with completion of the product.

### R09 — Publish a parse/check/run compatibility matrix

**Evidence: local inspection and primary documentation.** The root package uses TypeScript `^7.0.2`, while EffectScript core's development dependency uses `^6.0.3`. During the original review, the root module's `createProgram` was unavailable, while the core-resolved TypeScript 6 module supplied it. Recheck exact installed versions before implementing the language package.

Volar's [current `runTsc` implementation](https://raw.githubusercontent.com/volarjs/volar.js/master/packages/typescript/lib/quickstart/runTsc.ts) operates on the JavaScript TypeScript compiler. Do not assume a native TypeScript executable exposes the same patchable module or compiler APIs.

Node's [native TypeScript support](https://nodejs.org/api/typescript.html#type-stripping) is not a general TypeScript/TSX transpiler. In particular, JSX is unsupported, and non-erasable constructs require special handling or are unsupported; decorators and `tsconfig` behavior also need attention. Parsing every valid TypeScript file and executing it through a native stripping hook are separate promises.

**Recommended change:** explicitly select and resolve the TypeScript implementation for `efx check`, the language service, and type-test fixtures. For Node registration, either use a suitable transpilation stage or state the supported erasable subset. Keep the compiler itself browser-compatible.

Record each host path separately: Node registration, Bun plugin, Vite/Vitest, Astro, emitted TS, emitted JS, browser playground, language service, and standalone executable. Include JSX and non-erasable TypeScript constructs where relevant.

Bun supports standalone executables and bundling its runtime; that makes the proposed distribution plausible, not verified. Qualify the actual EffectScript binary and platform targets before saying it runs without an installed Node/Bun.

**Acceptance criteria:** every claimed combination has a named fixture and version; unsupported combinations produce actionable diagnostics. A TypeScript 6 JavaScript checker path and any native TypeScript path are treated as separate integrations until parity is demonstrated.

### R10 — Resolve import output paths using the module graph

**Evidence: observed implementation.** [Import rewriting](../../packages/effectscript/core/src/compiler/transform/imports.ts) blindly rewrites a relative `.efx` suffix to `.ts` or `.js`. Yet the same specification says JSX detection can emit `.tsx`. A single-file compiler cannot know the output extension of the imported module.

**Recommended change:** keep core pure, but let a graph-aware integration supply a resolver or output manifest. A syntax-only extension rewrite can remain an explicit limited option; do not mistake it for a complete project-build policy.

Define output paths for JSX preservation/transformation, ESM/CJS, declaration files, package exports, aliases, and extensionless resolution. Static imports, re-exports, and literal dynamic imports must agree. Nonliteral dynamic imports need a documented limit. Query-bearing imports require host-specific treatment.

**Acceptance criteria:** a mixed TS/TSX/EFX fixture builds, checks, and runs with all rewritten references pointing to actual output files. The `.d.ts` consumer resolves without a language plugin. Node, Bun, and Vite resolution behavior are qualified separately.

### R11 — Separate language versioning from Effect compatibility

**Evidence: design analysis.** Specification §7.6 proposes lockstep major/minor versions, `effectscript@4.0.x` for `effect@4.0.*`, and experimental `4.0.0-alpha.N` releases. Earlier sections describe an experimental `0.x` release. Those statements need reconciliation even if lockstep is retained.

**Recommended change:** version the language/compiler independently and publish a tested Effect compatibility range. Otherwise a language breaking change has no clear version signal, and an Effect minor release can appear to require a simultaneous language release even when the lowering remains compatible.

Make the implicit prelude a versioned, curated compatibility surface. Automatically exposing every new upstream export can change name resolution without a source edit. Generate candidate tables, then review exclusions and compatibility before release.

The file header can communicate a target Effect version, but a pure browser compiler cannot discover the installed project package. Supply target metadata explicitly; let Node/project integrations resolve the installed version. Distinguish language version, intended Effect version, and actually resolved Effect version.

Release automation should open a reviewable compatibility PR on both successful and failed updates. Separate upstream synchronization, table generation, validation, release approval, and publication. A passing current suite is not sufficient evidence that every new upstream export is safe to introduce as an implicit builtin.

**Acceptance criteria:** documented semver rules, explicit compatibility metadata, deterministic browser behavior, reviewed prelude updates, and release artifacts tested against the stated matrix. No automation is created or publication performed merely because this review recommends a policy.

### R12 — Make project conversion transactional and conservative

**Evidence: design analysis.** Renaming many files while changing imports, configuration, and generated output is a module-graph operation. File-by-file rollback alone cannot reliably restore a coherent project.

**Recommended change:** stage conversion in a temporary checkout or equivalent isolated working tree. Generate a manifest and complete diff, run the required project checks, then apply a coherent change. Start with selected files/directories before whole-project conversion.

Exclude declarations, dependencies, generated files, build output, and unsupported project regions by default. Define clean-tree behavior and exactly what `--force` owns. Rollback must not remove unrelated user edits. Conversion should be idempotent and work with aliases, barrel exports, configuration references, and mixed extensions.

Keep `--ai` opt-in and distinct from mechanical conversion. AI-assisted semantic refactoring can be useful, but passing checks does not prove semantic equivalence. Produce a mechanical baseline and separate reviewable AI changes rather than mixing them into a single supposedly reversible operation.

**Acceptance criteria:** dry-run manifest, coherent patch, named blocker report, idempotence, cancellation and failed-check rollback, and preservation of unrelated changes. A fixture with re-exports, path aliases, tests, and generated declarations remains usable after conversion and after rollback.

### R13 — Split syntactic guardrails from semantic checks

**Evidence: plan/design analysis.** A purely syntactic compiler cannot reliably identify every Effect value, Promise, service dependency, or floating effect. Treating any `Effect.*` call as an effect incorrectly catches pure predicates such as `Effect.isEffect`; imported functions returning Effects can be missed entirely.

**Recommended change:** keep conservative syntax-based diagnostics in the compiler, and place authoritative type-backed Effect/Promise/environment checks in the checker or language service. Label heuristic warnings as heuristic. Do not imply the compiler proves capability safety or exhaustively detects every floating effect.

Define a single configuration contract for strictness, ambient capture, observability, runtime, target Effect version, and prelude behavior. Several proposed controls are absent from the current `CompileOptions`. Specify which layer owns project-only options and which can run in the browser.

Reconcile diagnostics numbering: the design's area table does not clearly account for the proposed `8xxx` strict-rule family. Also reconcile `CompileResult`'s "diagnostics empty when successful" comment with warning-bearing successful compilation. Consumers should decide failure by severity, not merely nonempty diagnostics.

**Acceptance criteria:** pure calls avoid false floating-effect errors; imported effectful/Promise calls are checked through type information when available; warnings do not abort successful compilation unless configured. Compiler, CLI, editor, playground, and skill describe the same policy.

### R14 — Test behavior and interoperability, not just generated text

**Evidence: test/plan analysis.** Golden output is valuable for readability and canonicalization, but it cannot establish runtime order, cleanup, cancellation, public type inference, or editor mapping correctness.

Add focused verification for:

- Inferred success/error/environment types, declared `throws`/`needs`, exported declarations, and negative type cases.
- Failure versus defect versus interruption, handler-generated failures, and cleanup ordering.
- Getters, proxies, pipeline stages, and lexical binding collisions.
- Concurrency overlap, bounded concurrency, sibling cancellation, and result order. Checking only the final array is not proof of concurrency.
- TypeScript/TSX conformance: decorators, ambient declarations, global augmentation, namespaces, and contextual keyword lookalikes.
- Incomplete editor input, rename, definition navigation, hover, and diagnostic spans.
- Packed package consumers, runtime hooks, module resolution, and standalone artifacts.

Use differential runtime tests against hand-written Effect for the chosen semantic contract. Property-based event traces are useful where they expose order/capture issues; do not add arbitrary test volume without a concrete invariant.

Performance claims also need measurement. Record cold/hot compilation time, representative file sizes, worker payload, mapping memory, and host/version. Per-character high-resolution mappings can become expensive. The specification's approximate compiler size is an estimate until a real production bundle is measured.

**Acceptance criteria:** each compatibility claim links to the narrowest meaningful test or measured artifact. Tests intentionally exercise the failure mode, rather than merely restating the emitted template. Broaden testing only when changes or unresolved concerns justify it.

### R15 — Qualify product claims and evaluate AI benefits fairly

**Evidence: design analysis.** "Zero risk," blanket interoperability language, and present-tense claims that every case is tested exceed the evidence available from a core compiler implementation.

**Recommended change:** describe concrete benefits: incremental mixed-module adoption, readable output, conservative conversion, and a verified exit path for supported shapes. Maintain explicit states such as planned, implemented, locally tested, host-qualified, and released.

For token comparisons, preserve the specified named tokenizer and count real text. Compare examples with matching behavior, error handling, schemas, and resource safety; a smaller example that omits those features is not a fair comparison. Compile/type-check examples in CI. Distinguish compiler diagnostics from full project type-checking and from actual execution in the playground.

For AI evaluation, compare plain TypeScript, idiomatic Effect TypeScript, and EffectScript using the same task set, models, prompts, context budgets, and trial count. Measure correctness, repair attempts, total tokens including the skill, and latency. Shorter source does not by itself establish better model performance. Build the skill early enough for dogfooding, but keep the improvement claim a hypothesis until measured.

Keep proof-generation and ahead-of-time compilation ideas explicitly exploratory. A language that compiles to Effect does not automatically obtain a proof of arbitrary JavaScript side effects. State which pure fragments or obligations a future proof system could actually cover.

**Acceptance criteria:** site claims point to current evidence; examples remain semantically comparable; AI evaluation is reproducible; unqualified safety/performance/correctness promises are removed.

## Additional concrete details to improve

These are narrower than the findings above. Some are confirmed code properties; others need a focused test before being called a bug.

| ID  | Detail and evidence status                                                                                                                                                                         | Recommended action and verification                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Match-arm bindings need lexical scope handling. Earlier analysis found scope leakage/missing binding treatment; the current scope analyzer needs revalidation against the new match transform.     | Give every arm its own bindings; test prelude names shadowed by an arm parameter and names unavailable outside the arm.                                                                                                                   |
| D02 | The parser stores the first catch in both `handler` and `handlers[0]`; generic `children` traversal enumerates both properties. Current source retains this representation.                        | Ensure each child is visited once, through visitor keys or identity deduplication; test catch-body analysis and transformation for duplicate visits.                                                                                      |
| D03 | Service accessor synthesis must handle destructuring, overloads, defaults, rest arguments, generics, and `this`. Needs targeted coverage.                                                          | Define supported signatures and forwarding rules; reject unsupported forms at source rather than generating subtly different calls.                                                                                                       |
| D04 | Service keys omit the module filename. Rechecked: `src/a.efx` and `src/b.efx`, each declaring `Users` in package `app`, both yield `app/Users`.                                                    | Include a reproducible module identity or require explicit keys for collisions. Verify absolute/relative filenames, browser input, Windows separators, and no machine-specific paths in published keys.                                   |
| D05 | Full-node replacements in schema aliases/ADTs can drop comments, despite the readable/source-preserving story. Needs fixture verification.                                                         | Preserve comments and documentation or describe canonical comment placement. Test inline comments and comments on fields/variants.                                                                                                        |
| D06 | Custom lexical lookahead must correctly distinguish regex literals and templates from punctuation. A scanner that counts `)`/`}` in raw regex text can misdetect forms. Needs parser reproduction. | Prefer parser/tokenizer state; add regex, escaped delimiter, nested template, JSX, and generic-arrow cases.                                                                                                                               |
| D07 | `process.env.NAME ?? fallback()` lowered as `Config.withDefault(fallback())` evaluates the fallback eagerly when that pipeline is constructed. Design-level order problem.                         | Preserve the chosen lazy nullish-fallback semantics or explicitly diagnose unsupported side-effectful defaults. Test call counts with present and absent config.                                                                          |
| D08 | Ambient capture must honor binding identity and have a precise escape hatch. Needs full integration coverage.                                                                                      | Test shadowed `console`, `Date`, `Math`, and `process`; define qualified/global opt-outs and configuration behavior.                                                                                                                      |
| D09 | Parameter default timing and lexical context can change across generated functions. Needs focused semantics tests.                                                                                 | Define construction-versus-execution timing; avoid illegal yields in defaults; test defaults, generics, lexical `arguments`, `new.target`, and `super`. Preserve already chosen restrictions on effect-arrow `this`.                      |
| D10 | Current mapping code assigns verification/completion/semantic/navigation support broadly to mapped edited chunks. This is an observed code property, not a reproduced editor corruption.           | Use role-aware mappings. Permit rename/navigation on user identifiers, not generated helper syntax or whole keyword replacements. Test actual language-service edits. Keep runtime source maps and editor mappings as distinct contracts. |
| D11 | `.efx` is ignored by ordinary formatter/linter registration, while direct linting is a later roadmap item.                                                                                         | Bring a workable formatting and mapped-lint path into the adoption slice. Daily authoring quality matters before broad grammar expansion.                                                                                                 |
| D12 | `main` can run during module import; development HMR may create multiple live runtimes/fibers. Needs host tests.                                                                                   | Define entry-module versus imported-module behavior and lifecycle disposal. Test repeated HMR, cancellation, test discovery, and import side effects.                                                                                     |
| D13 | Promise/fetch examples should demonstrate cancellation correctly.                                                                                                                                  | Forward the signal supplied by `Effect.tryPromise` into `fetch`; verify cancellation reaches the request rather than only interrupting the surrounding Effect.                                                                            |
| D14 | Plan 1 line 3 mandates `superpowers` execution. This conflicts with the user's native-workflow preference.                                                                                         | Remove or neutralize the framework mandate when updating the plan. Keep concrete tasks and repository checks without adding a process framework.                                                                                          |
| D15 | "No runtime helper library" can be interpreted too broadly as banning local temporaries/IIFEs needed for correct lowering.                                                                         | Keep the no-external-helper-runtime goal while allowing transparent generated local code. Correct evaluation order takes priority over a fragile text-edit trick.                                                                         |

D01–D15 should not be reported as all reproduced failures. Preserve the evidence distinctions above when creating issues or implementation tasks.

## Suggested delivery sequence

This sequence preserves the scope but changes which risks are retired first.

| Stage                                | Work                                       | Exit evidence                                                                                                |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| A: semantics and current correctness | R01–R07; relevant D01–D10                  | Binding, order, failure, lifetime, optionality, and canonicalization contracts tested against current Effect |
| B: adoption slice                    | R08–R10; D10–D13                           | Mixed `.efx`/`.ts` project checks, builds, runs, works in the editor, and exports usable declarations        |
| C: conversion and compatibility      | R11–R13                                    | Transactional conversion, explicit configuration, tested compatibility range, and reviewed prelude policy    |
| D: expansion and release evidence    | Remaining constructs/integrations, R14–R15 | Each added claim has behavior/host/package evidence; docs and skill match the shipped implementation         |

Stages can overlap where dependencies permit. In particular, the editor slice should start before every language construct is implemented. Do not block a narrow experiment on completing the entire marketing site or all platform binaries.

Suggested immediate work packets:

1. **Compiler binding hygiene:** resolver/alias design, update all transforms, collision regression tests.
2. **Error-handling contract:** decide stable `try` and sibling catch semantics; update spec, lowering, reverse blockers, runtime/type fixtures together.
3. **Pipeline contract and preserving lowering:** event traces, safe temporaries, lexical context, `.pipe` proof boundaries.
4. **Schema optionality and resource scope:** exact optional types, recursive references, scoped release/control-flow tests.
5. **Adoption fixture:** graph-aware build, checker version, declarations, editor recovery/mappings, one runtime.
6. **Reverse conversion and project conversion:** canonicalization first, then a staged module-graph codemod with an explainable fallback.

For every packet, update the plan around the final chosen behavior. Avoid appending contradictory recommendations while leaving the original code templates as the authoritative implementation instructions.

## Verification notes and reproduction guide

### Rechecked observations

The follow-up probe at the recorded implementation snapshot produced:

| Probe                                                          | Result                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| User module binding named `Effect` plus an effect declaration  | Generated `Effect.fn` used the user binding; diagnostics `[]`            |
| Parameter named `Effect` plus a nested effect block            | Generated inner `Effect.gen` resolved to the parameter; diagnostics `[]` |
| `makeValue()                                                   | > obj.method(%)`                                                         |
| `makeHead()                                                    | > stage(1)                                                               |
| Grouped catch handlers where A's handler fails with B          | Final fallback ran                                                       |
| Sequential catch handlers where A's handler fails with B       | B's handler ran                                                          |
| Native generator finally after a yielded failure               | Finalizer flag remained false                                            |
| Native synchronous catch around `JSON.parse("{")`              | Success with `"caught"`                                                  |
| Same exception inside an Effect generator with an Effect catch | Failure containing a defect                                              |
| `Schema.optional` on an exact optional field                   | Explicit undefined accepted                                              |
| `Schema.optionalKey` on the same field                         | Explicit undefined rejected                                              |
| Two same-directory modules declaring the same service name     | Identical generated service keys                                         |

### Minimal probe setup

Follow repository guidance: place ad hoc probes under `scratchpad`, run them with plain `node`, and remove them afterward. Use a task-specific filename so another agent's probe is not overwritten. These imports work from a root `scratchpad` file in this checkout:

```ts
import * as Cause from "../packages/effect/src/Cause.ts"
import * as Effect from "../packages/effect/src/Effect.ts"
import * as Schema from "../packages/effect/src/Schema.ts"
import { toTypeScript } from "../packages/effectscript/core/src/compiler/index.ts"

const result = toTypeScript(
  "const Effect = { fn: () => () => \"wrong\" }\nexport effect f() { return 1 }\n"
)
console.log(result.code, result.diagnostics)
```

Use locally bound fixture names or `prelude: false` when isolating unrelated behavior. The prelude contains many common names; for example, a free call named `head()` can resolve to an Effect builtin instead of the intended test function.

For optionality, a minimal runtime comparison is:

```ts
const loose = Schema.Struct({ email: Schema.optional(Schema.String) })
const exact = Schema.Struct({ email: Schema.optionalKey(Schema.String) })
console.log(Schema.is(loose)({ email: undefined })) // true at reviewed snapshot
console.log(Schema.is(exact)({ email: undefined })) // false at reviewed snapshot
```

For an emitted TypeScript runtime fixture, use the repository's existing test harness rather than treating a JavaScript `Function` probe as a general TS module runner. The pipeline-order probe used only erasable, import-free JavaScript after removing the generated import and supplying `pipe`; it did not establish package resolution or TypeScript runtime interoperability.

### Test and tool guidance

Use the current repository guidance as authority. At review time, runtime changes require `pnpm lint-fix`, targeted `pnpm test --run <file>`, and `pnpm check`; type behavior uses targeted type tests as appropriate. Never invoke bare `pnpm test` or `pnpm doctest`, which start watch mode.

Useful existing test targets are:

- [Import tests](../../packages/effectscript/core/test/imports.test.ts)
- [Transform tests](../../packages/effectscript/core/test/transform.test.ts)
- [Runtime tests](../../packages/effectscript/core/test/runtime.test.ts)
- [Type-check tests](../../packages/effectscript/core/test/typecheck.test.ts)
- [Mapping tests](../../packages/effectscript/core/test/mappings.test.ts)
- [Superset tests](../../packages/effectscript/core/test/superset.test.ts)
- [Parser tests](../../packages/effectscript/core/test/parser.test.ts)

Test existence does not mean the finding is already covered. Add the smallest meaningful regression case, inspect its failure before the fix where practical, and test the intended contract rather than the current template.

## Primary external references

These were consulted during the review on 2026-10-02. Recheck them before relying on mutable host/toolchain details for implementation. They support integration constraints, not proof that EffectScript's integrations work.

- [Node: TypeScript and type stripping](https://nodejs.org/api/typescript.html#type-stripping) — erasable syntax, unsupported TSX, configuration and execution limits.
- [Volar: `runTsc` source](https://raw.githubusercontent.com/volarjs/volar.js/master/packages/typescript/lib/quickstart/runTsc.ts) — current JavaScript TypeScript compiler integration mechanism.
- [TypeScript native port](https://github.com/microsoft/typescript-go#what-works-so-far) — inspect current API/tooling status; do not assume equivalence to the JavaScript compiler module.
- [TC39 pipeline proposal](https://github.com/tc39/proposal-pipeline-operator#description) — topic evaluation order and proposal syntax/precedence.
- [Acorn TypeScript plugin](https://github.com/sveltejs/acorn-typescript) — parser capability and configuration; verify real conformance with fixtures.
- [Bun standalone executables](https://bun.com/docs/bundler/executables) — runtime bundling and distribution capabilities; actual EffectScript artifacts still require qualification.
- [Bun runtime plugins](https://bun.com/docs/runtime/plugins) — runtime integration API.
- [TC39 explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) — reference semantics for the familiar resource-management syntax; EffectScript's Effect-scoped interpretation must be documented separately.

## Completion criteria for work based on this review

- Every P0/P1 item has a recorded disposition with evidence, rather than an unchecked assumption.
- Chosen semantics are consistent across specification, implementation plan, forward compiler, reverse compiler, diagnostics, skill, and examples.
- The mixed-module adoption slice is demonstrated on named tool/runtime/editor versions.
- Public claims distinguish implementation, tests, host qualification, and release status.
- Changes preserve the settled user decisions and follow current repository instructions.
- The final report identifies remaining limitations and does not claim that packaging this review completed the implementation work.

No compiler fixes, plan rewrites, releases, or external messages are performed by the creation of this handoff itself.
