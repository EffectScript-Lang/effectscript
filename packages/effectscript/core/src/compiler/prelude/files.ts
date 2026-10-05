/**
 * Where compiler-added imports point (ADR-0089): a prelude module is imported as a namespace from
 * its own file (`import * as Schema from "effect/Schema"`), and `pipe`, `flow` and `identity` from
 * `effect/Function`, so consumers never load the package index for them.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { preludeFunctions, preludeModuleFiles, preludeModules } from "./tables.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface ImportTarget {
  /** The module specifier to import from. */
  readonly from: string
  /** `import * as <local> from …` rather than `import { <name> } from …`. */
  readonly namespace: boolean
}

/**
 * The import that brings in `module`'s export `name`.
 *
 * @since 0.1.0
 * @category files
 */
export const importTarget = (module: string, name: string): ImportTarget => {
  const file = preludeModules.get(name) === module ? preludeModuleFiles.get(name) : undefined
  if (file !== undefined) return { from: file, namespace: true }
  if (preludeFunctions.get(name) === module) return { from: "effect/Function", namespace: false }
  return { from: module, namespace: false }
}

const importedName = (specifier: Node): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)

/**
 * Whether `specifier` of the import declaration `statement` imports `module`'s export `name`,
 * either from `module` itself or from the target of `importTarget`.
 *
 * @since 0.1.0
 * @category files
 */
export const importsExport = (statement: Node, specifier: Node, module: string, name: string): boolean => {
  const source = statement.source.value
  const target = importTarget(module, name)
  if (specifier.type === "ImportSpecifier") {
    // `import { Schema } from "effect/Schema"` names a member of the module, not the module
    return importedName(specifier) === name && (source === module || (source === target.from && !target.namespace))
  }
  return specifier.type === "ImportNamespaceSpecifier" && target.namespace && source === target.from
}
