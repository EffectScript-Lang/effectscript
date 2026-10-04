import { type CompileOptions, toEffectScript, toTypeScript } from "effectscript/compiler"
import { compilesBackModuloImports } from "effectscript/compiler/reverse/verify"
import { expect } from "vitest"
import { tokensAndComments } from "./tokens.ts"

type Options = Pick<CompileOptions, "filename" | "packageName" | "runtime" | "ambient">

/** Notes from the ADR-0030 guard's statement-level fallback. */
export const fallbacks = (back: { readonly notes: ReadonlyArray<{ readonly message: string }> }) =>
  back.notes.filter((n) => n.message.includes("doesn't compile back"))

/**
 * Converts `ts` and checks ADR-0030: the EffectScript compiles back to the same tokens and
 * comments (its `effect` imports compared as bindings when the import cleanup canonicalized them,
 * ADR-0089), and no statement needed the guard's fallback.
 */
export const expectSafe = (ts: string, options: Options = {}) => {
  const back = toEffectScript(ts, options)
  const again = toTypeScript(back.code, options)
  expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  if (back.notes.some((n) => n.message.startsWith("canonicalized: imports"))) {
    expect(compilesBackModuloImports(ts, back.code, options)).toBe(true)
  } else {
    const before = tokensAndComments(ts)
    const after = tokensAndComments(again.code)
    expect(after.tokens.join(" ")).toBe(before.tokens.join(" "))
    expect(after.comments).toEqual(before.comments)
  }
  expect(fallbacks(back)).toEqual([])
  return back
}

/** Compiles `efx`, converts it back, and returns the EffectScript (checked with `expectSafe`). */
export const roundTrip = (efx: string, options: Options = {}): string => {
  const ts = toTypeScript(efx, options).code
  const back = expectSafe(ts, options)
  expect(toTypeScript(back.code, options).code).toBe(ts)
  return back.code
}
