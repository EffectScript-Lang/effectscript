/**
 * Import bookkeeping: generated code and prelude identifiers call `need`. Only names that were
 * needed *and* are not already bound in the module are emitted, so files never gain unused imports.
 * Names are merged into an existing `import { … } from "<module>"` when there is one. Compiler-owned
 * references may be aliased (`Effect as Effect$`, ADR-0009).
 *
 * @since 0.1.0
 */
import type { MagicString } from "magic-string"
import type { ScopeAnalysis } from "./analyze/scope.ts"
import type { Node } from "./ast.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface ImportSet {
  /** Imports `imported` from `module` under `local` (default: the same name). */
  readonly need: (module: string, imported: string, local?: string) => void
  /** Turns an existing type-only import specifier into a value import. */
  readonly upgrade: (statement: Node, specifier: Node) => void
  /** module → local → imported */
  readonly entries: ReadonlyMap<string, ReadonlyMap<string, string>>
  readonly upgrades: ReadonlyMap<Node, Node>
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const makeImportSet = (): ImportSet => {
  const entries = new Map<string, Map<string, string>>()
  const upgrades = new Map<Node, Node>()
  return {
    entries,
    upgrades,
    need: (module, imported, local = imported) => {
      let names = entries.get(module)
      if (names === undefined) {
        names = new Map()
        entries.set(module, names)
      }
      names.set(local, imported)
    },
    upgrade: (statement, specifier) => {
      if (statement.importKind === "type" || specifier.importKind === "type") upgrades.set(specifier, statement)
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
  for (const [specifier, statement] of ctx.imports.upgrades) upgradeTypeOnly(ctx, statement, specifier)
  const lines: Array<string> = []
  const modules = [...ctx.imports.entries.keys()].sort()
  for (const module of modules) {
    const specifiers = [...ctx.imports.entries.get(module)!]
      .filter(([local]) => !ctx.analysis.module.values.has(local))
      .sort(([localA, importedA], [localB, importedB]) =>
        importedA === importedB ?
          compare(localA === importedA ? "" : localA, localB === importedB ? "" : localB) :
          compare(importedA, importedB)
      )
      .map(([local, imported]) => (local === imported ? imported : `${imported} as ${local}`))
    if (specifiers.length === 0) continue
    const existing = ctx.analysis.program.body.find((statement: Node) =>
      statement.type === "ImportDeclaration" && statement.source.value === module && statement.importKind !== "type" &&
      statement.specifiers.length > 0 && statement.specifiers.every((s: Node) => s.type === "ImportSpecifier")
    )
    if (existing !== undefined) {
      ctx.s.appendLeft(existing.specifiers.at(-1).end, `, ${specifiers.join(", ")}`)
    } else {
      lines.push(`import { ${specifiers.join(", ")} } from "${module}"`)
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

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Turns `specifier` (type-only by itself or through its statement) into a value import. */
const upgradeTypeOnly = (
  ctx: { readonly source: string; readonly s: MagicString },
  statement: Node,
  specifier: Node
): void => {
  if (statement.importKind === "type") {
    const typeKeyword = ctx.source.indexOf("type", statement.start + "import".length)
    ctx.s.remove(typeKeyword, ctx.source.indexOf("{", typeKeyword))
    for (const other of statement.specifiers as Array<Node>) {
      if (other !== specifier) ctx.s.appendRight(other.start, "type ")
    }
  } else if (specifier.importKind === "type") {
    ctx.s.remove(specifier.start, specifier.imported.start)
  }
}
