# ADR-0028: Strict-mode rules are syntactic; warnings never affect the superset guarantee

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 4
- **Related:** spec §4.17; ADR-0017; review R13

## Context

§4.17 lists errors (EFX8001–8005, 8111) that apply only inside `effect` code, and warnings
(EFX8101–8110) that apply anywhere in `.efx`. ADR-0017 puts type-backed checks in the checker. The
superset test requires plain TypeScript to compile with no diagnostics at all, but a warning such
as EFX8104 (explicit `any`) fires on ordinary TypeScript.

## Decision

- **The compiler implements syntactic versions only.** Each rule matches source shapes, never
  types:
  - **EFX8001 (floating effect, heuristic):** an expression statement in `effect` code whose value
    is a call to a module-level `effect` declaration, a call to a bare Effect builtin, or a call
    to `Effect.<member>` (through the file's `Effect` binding). Pure helpers are excluded: `is*`,
    `run*`, and `log*` are not, since logs are effects. The message says "heuristic".
  - **EFX8111 (visible Promise):** `await` in `effect` code on `fetch(…)`, `new Promise(…)`,
    `Promise.*(…)`, `….then(…)`/`.catch(…)`/`.finally(…)`, or a call to a module-level `async`
    function.
  - The others match their §4.17 descriptions literally.
- **`strict`** (option `strict: true` or the directive `// @efx strict`) promotes warnings to errors.
- **The superset guarantee is about meaning:** plain TypeScript compiles to itself with no
  *errors*. Warnings may appear. The superset test asserts identical output and no errors.
- Type-backed versions (imported functions returning Effects or Promises) belong to the checker
  (a later plan).

## Consequences

- Fast, predictable rules that run in the browser and on every keystroke.
- Floating effects from imported functions are missed until the checker version exists.

## Alternatives considered

- **Warnings only inside `effect` code:** quieter, but the spec wants `.efx` held to a stricter
  standard everywhere.
- **No warnings on renamed plain TypeScript:** would need to know whether a file is "really"
  EffectScript, which a superset can't tell.
