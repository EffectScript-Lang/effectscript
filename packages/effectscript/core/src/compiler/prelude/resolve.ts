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

// A name bound in either namespace (e.g. `import type * as X`, used in `typeof X` or computed keys)
// is never resolved through the prelude.
const isFree = (ctx: Ctx, name: string): boolean => isValueFree(ctx.scope, name) && isTypeFree(ctx.scope, name)

/**
 * Resolves a free value identifier against the construct namespace, prelude modules, prelude
 * functions and Effect builtins (in that order).
 *
 * @since 0.1.0
 * @category resolution
 */
export const resolveValue = (ctx: Ctx, name: string): Resolution | undefined => {
  if (!ctx.options.prelude || excludedNames.has(name) || !isFree(ctx, name)) return undefined
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
  if (!ctx.options.prelude || excludedNames.has(name) || !isFree(ctx, name)) return undefined
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
