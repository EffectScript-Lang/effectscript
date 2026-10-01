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
 * A name that occurs nowhere in the file and was not handed out before: `base`, `base2`, `base3`, ….
 *
 * @since 0.1.0
 * @category names
 */
export const fresh = (ctx: Ctx, base: string): string => {
  const name = unused(ctx, base)
  ctx.generatedNames.add(name)
  return name
}

/**
 * Like `fresh`, without reserving the name: for parameters of sibling generated functions, which
 * can safely share one name (each binds its own scope).
 *
 * @since 0.1.0
 * @category names
 */
export const unused = (ctx: Ctx, base: string): string => {
  const taken = (name: string) => ctx.analysis.identifierNames.has(name) || ctx.generatedNames.has(name)
  let name = base
  for (let i = 2; taken(name); i++) name = `${base}${i}`
  return name
}

/**
 * The local name to emit for `module`'s export `name`, decided once per file:
 *
 * 1. an existing import of that export whose local name no inner scope rebinds (upgraded from
 *    type-only if needed);
 * 2. otherwise the export's own name, when nothing in the file binds it;
 * 3. otherwise a fresh alias (`import { Effect as Effect$ } …`).
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
    if (local !== undefined) break
    if (statement.type !== "ImportDeclaration" || statement.source.value !== module) continue
    for (const specifier of statement.specifiers as Array<Node>) {
      if (specifier.type !== "ImportSpecifier" || importedName(specifier) !== name) continue
      if (ctx.analysis.innerBound.has(specifier.local.name)) continue
      local = specifier.local.name as string
      ctx.imports.upgrade(statement, specifier)
      break
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
