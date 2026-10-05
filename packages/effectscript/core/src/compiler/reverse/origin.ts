/**
 * Binding-origin checks for the reverse compiler (ADR-0009, ADR-0023): an API is recognized only
 * through its import, never by spelling.
 *
 * @since 4.0.0
 */
import type { ScopeAnalysis } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import { importsExport } from "../prelude/files.ts"

/**
 * The local name of a value import of `name` from `module`, named or as its module file's namespace
 * (`import * as Schema from "effect/Schema"`, ADR-0089), that no inner scope rebinds.
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
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue
    for (const specifier of statement.specifiers as Array<Node>) {
      if (specifier.importKind === "type" || !importsExport(statement, specifier, module, name)) continue
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

/**
 * The Effect module a local name is imported as (`import { Stream } from "effect"`,
 * `import * as Stream from "effect/Stream"`), when no inner scope rebinds it.
 *
 * @since 4.0.0
 * @category origin
 */
export const importedModule = (analysis: ScopeAnalysis, local: string): string | undefined => {
  if (analysis.innerBound.has(local)) return undefined
  for (const statement of analysis.program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue
    const source: string = statement.source.value
    if (source !== "effect" && !source.startsWith("effect/")) continue
    for (const specifier of statement.specifiers as Array<Node>) {
      if (specifier.local.name !== local || specifier.importKind === "type") continue
      if (specifier.type === "ImportSpecifier") {
        return specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)
      }
      if (specifier.type === "ImportNamespaceSpecifier") return source.slice(source.lastIndexOf("/") + 1)
    }
  }
  return undefined
}
