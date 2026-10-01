/**
 * Loading TypeScript for `efx build`: it needs the TypeScript 6 JS compiler API (ADR-0019), and
 * `efx` must keep working without it for everything else (review I7).
 *
 * @since 4.0.0
 */
import { createRequire } from "node:module"
import * as path from "node:path"
import type * as TS from "typescript"

/**
 * @since 4.0.0
 * @category models
 */
export type TypeScript = typeof TS

/**
 * Why a loaded `typescript` module can't be used, or `undefined` when it can.
 *
 * @since 4.0.0
 * @category typescript
 */
export const typeScriptProblem = (
  ts: { readonly version?: string; readonly createProgram?: unknown } | undefined
): string | undefined => {
  if (ts === undefined) return "efx build needs TypeScript 6 (the JS compiler API): npm i -D typescript@6"
  if (ts.version?.split(".")[0] === "6" && typeof ts.createProgram === "function") return undefined
  return `efx build needs TypeScript 6 (the JS compiler API); found ${ts.version ?? "an unknown version"} (ADR-0019)`
}

/**
 * The first TypeScript 6 found from the project, then from EffectScript itself; otherwise a
 * message explaining what is missing.
 *
 * @since 4.0.0
 * @category typescript
 */
export const loadTypeScript = async (cwd: string): Promise<TypeScript | string> => {
  let problem = typeScriptProblem(undefined)!
  for (const base of [path.join(cwd, "package.json"), import.meta.url]) {
    let resolved: string
    try {
      resolved = createRequire(base).resolve("typescript")
    } catch {
      continue
    }
    const module = await import(resolved)
    const ts: TypeScript = module.default ?? module
    const found = typeScriptProblem(ts)
    if (found === undefined) return ts
    problem = found
  }
  return problem
}
