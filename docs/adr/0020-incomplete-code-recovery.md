# ADR-0020: Recover incomplete code by neutralizing failing lines

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** agent ruling for Plan 3, from review R08
- **Related:** review R08; spec §7.3 (previously "virtual code is the source verbatim")

## Context

Editors compile on every keystroke, so most compiles happen while a statement is half-typed
(`const x = n.`). A parse failure used to produce empty output, so the virtual TypeScript file
vanished and completion stopped exactly when it is needed. The TypeScript parser tolerates
errors, but the EffectScript parser (acorn) does not.

## Decision

`toTypeScript(source, { recover: true })` does the following when parsing fails:

1. **Neutralize a small region around the error.** Try these candidate line ranges in order:
   - the error's line;
   - the line before it;
   - both lines together;
   - the error's line and the line after it.

   For each candidate, replace the region with spaces of the same length and compile again.
2. **Restore the original text.** On the first successful compile, splice the original text back
   in place of those spaces in the output. Unchanged text maps verbatim, so the spaces sit at a
   known, same-length position. TypeScript's tolerant parser then sees the incomplete statement
   inside correctly compiled surroundings: `n.` sits in a generator whose parameters are typed.
3. **Report the parse error** as a diagnostic, and mark the result `recovered: true`.
4. If no candidate compiles, return the source verbatim (the previous behavior).

Recovery is off by default. Build and run paths never recover.

## Consequences

- Completion, hover and navigation keep working while the user types inside `effect` code.
- A neutralized region that contains EffectScript-only syntax (`await` in an `effect` body)
  appears raw to TypeScript, which may report extra errors on that line until it parses again.

## Alternatives considered

- **Reuse the last good output:** offsets shift with every edit, so the mappings go stale.
- **Blank the failing lines without restoring them:** the cursor's line disappears, so there is
  no completion where the user is typing.
- **An error-tolerant EffectScript parser:** the right long-term answer (roadmap), but much
  larger.
