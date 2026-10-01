/**
 * Import bookkeeping: generated code and prelude identifiers call `need`. Only names that were
 * needed *and* are not already bound in the module are emitted, so files never gain unused imports.
 * Names are merged into an existing `import { … } from "<module>"` when there is one.
 *
 * @since 0.1.0
 */
import type { MagicString } from "magic-string"
import { isValueFree, type ScopeAnalysis } from "./analyze/scope.ts"
import type { Node } from "./ast.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface ImportSet {
  readonly need: (module: string, name: string) => void
  readonly entries: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const makeImportSet = (): ImportSet => {
  const entries = new Map<string, Set<string>>()
  return {
    entries,
    need: (module, name) => {
      let names = entries.get(module)
      if (names === undefined) {
        names = new Set()
        entries.set(module, names)
      }
      names.add(name)
    }
  }
}

/**
 * @since 0.1.0
 * @category emit
 */
export const emitImports = (ctx: {
  readonly source: string
  readonly s: MagicString
  readonly imports: ImportSet
  readonly analysis: ScopeAnalysis
}): void => {
  const lines: Array<string> = []
  const modules = [...ctx.imports.entries.keys()].sort()
  for (const module of modules) {
    const names = [...ctx.imports.entries.get(module)!]
      .filter((name) => isValueFree(ctx.analysis.module, name) && !upgradeTypeOnly(ctx, module, name))
      .sort()
    if (names.length === 0) continue
    const existing = ctx.analysis.program.body.find((statement: Node) =>
      statement.type === "ImportDeclaration" && statement.source.value === module && statement.importKind !== "type" &&
      statement.specifiers.length > 0 && statement.specifiers.every((s: Node) => s.type === "ImportSpecifier")
    )
    if (existing !== undefined) {
      ctx.s.appendLeft(existing.specifiers.at(-1).end, `, ${names.join(", ")}`)
    } else {
      lines.push(`import { ${names.join(", ")} } from "${module}"`)
    }
  }
  if (lines.length === 0) return
  const text = `${lines.join("\n")}\n`
  if (ctx.source.startsWith("#!")) {
    const lineEnd = ctx.source.indexOf("\n")
    ctx.s.appendLeft(lineEnd === -1 ? ctx.source.length : lineEnd + 1, text)
  } else {
    ctx.s.prepend(text)
  }
}

/**
 * If `name` is already imported from `module` as type-only, turn that into a value import (keeping the
 * other specifiers type-only) and report success.
 */
const upgradeTypeOnly = (
  ctx: { readonly source: string; readonly s: MagicString; readonly analysis: ScopeAnalysis },
  module: string,
  name: string
): boolean => {
  for (const statement of ctx.analysis.program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== module) continue
    const specifier: Node | undefined = statement.specifiers.find((s: Node) =>
      s.type === "ImportSpecifier" && s.local.name === name
    )
    if (specifier === undefined) continue
    if (statement.importKind === "type") {
      const typeKeyword = ctx.source.indexOf("type", statement.start + "import".length)
      ctx.s.remove(typeKeyword, ctx.source.indexOf("{", typeKeyword))
      for (const other of statement.specifiers as Array<Node>) {
        if (other !== specifier) ctx.s.appendRight(other.start, "type ")
      }
      return true
    }
    if (specifier.importKind === "type") {
      ctx.s.remove(specifier.start, specifier.imported.start)
      return true
    }
  }
  return false
}
