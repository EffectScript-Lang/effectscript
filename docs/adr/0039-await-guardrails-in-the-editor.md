# ADR-0039: The `await` guardrails in the editor

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** agent ruling for Plan 11
- **Related:** spec §7.3, §7.4; ADR-0006, ADR-0019, ADR-0020

## Context

ADR-0006 makes `await` inside `effect` code an effect bind (`yield*`). It promises guardrails in
the editor:

- effect `await`s look different;
- hovering one explains it;
- awaiting a Promise inside `effect` gives a plain-English error.

Editors need to know which `await`s are binds. Only the compiler knows that: `async` functions
nested in `effect` code, `effect { }` blocks and top-level `await` all look alike in the source.

TypeScript reports `yield*` over a Promise as TS2488, "Type 'Promise<T>' must have a
'[Symbol.iterator]()' method that returns an iterator", positioned at the operand.

VS Code serves `.efx` through the built-in TypeScript server (ADR-0019). Semantic tokens there
come from TypeScript's fixed classification set, which has no keyword type, and a second semantic
token provider for the same language replaces TypeScript's tokens rather than adding to them.

## Decision

- **Compiler:** `CompileResult.binds` lists the source range of each `await` keyword lowered to
  `yield*`, in source order. It covers concurrent `await [..]`/`await {..}` and `using x = await`,
  and leaves out `await` in `async` code and top-level `await`. It is plain data, so the compiler
  stays browser-safe.
- **Hover:** on a bind, "Effect bind (`yield*`): runs this effect here and short-circuits on
  failure". The tsserver plugin replaces the quick info at that position; the language server
  returns it from an EffectScript service.
- **Promise-await errors:** a TS2488 whose type starts with `Promise<` or `PromiseLike<` and
  whose start follows a bind (only whitespace between them) keeps its code and range. Its message
  becomes "Cannot `await` a Promise inside `effect`: use `await tryPromise(() => …)`". It is
  rewritten in tsserver's semantic diagnostics and in the language server's diagnostics.
- **Styling:**
  - **VS Code:** the extension decorates binds with the themable color `effectscript.effectAwait`
    (italic, in the keyword's color family by default).
  - **The language server:** it returns a semantic token for each bind: type `keyword`, modifier
    `effect`. Editors theme `@lsp.typemod.keyword.effect` (Neovim) or the equivalent.

## Consequences

- One compiler pass feeds every host. The guardrails can't disagree with the compiled code, and
  they work on recovered code (ADR-0020), because binds outside the neutralized lines survive.
- `CompileResult` gains a required field. Code that builds compile results by hand (tests,
  mocks) must add `binds`.
- Checker-backed Promise detection in `effect` code (EFX8111 covers only visible Promises) is
  now visible in the editor for every Promise type TypeScript can see.

## Alternatives considered

- **Find binds in the editor by re-parsing:** it duplicates the compiler's scoping rules (`async`
  boundaries, `effect { }` blocks, `main`, `test`) and would drift.
- **Semantic tokens in VS Code through tsserver:** TypeScript's classifications have no keyword
  type, and a separate provider would drop TypeScript's own tokens.
- **Rewrite every TS2488:** the same code reports non-iterables in ordinary `for…of` and spread.
  Only those that follow a bind and name a Promise are about `await`.
