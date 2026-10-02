/**
 * Binding-origin checks for the reverse compiler (ADR-0009, ADR-0023): an API is recognized only
 * through its import, never by spelling.
 *
 * @since 4.0.0
 */
import type { ScopeAnalysis } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"

const importedName = (specifier: Node): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)

/**
 * The local name of a value import of `name` from `module` that no inner scope rebinds.
 *
 * @since 4.0.0
 * @category origin
 */
export const importedLocal = (
  analysis: ScopeAnalysis,
  module: string,
  name: string,
  /** Accept the import even when an inner scope rebinds its name (the caller tracks shadowing). */
  shadowed = false
): string | undefined => {
  for (const statement of analysis.program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== module) continue
    if (statement.importKind === "type") continue
    for (const specifier of statement.specifiers as Array<Node>) {
      if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue
      if (importedName(specifier) !== name) continue
      if (!shadowed && analysis.innerBound.has(specifier.local.name)) return undefined
      return specifier.local.name
    }
  }
  return undefined
}

/**
 * Whether `node` is `<local>.<member>` for the given namespace local name.
 *
 * @since 4.0.0
 * @category origin
 */
export const isMember = (node: Node | null | undefined, local: string | undefined, member?: string): boolean =>
  local !== undefined && node?.type === "MemberExpression" && !node.computed &&
  node.object.type === "Identifier" && node.object.name === local &&
  (member === undefined || node.property.name === member)
