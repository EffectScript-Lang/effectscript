/**
 * Import bookkeeping: generated code and prelude identifiers call `need`. Only names that were
 * needed *and* are not already bound in the module are emitted, so files never gain unused imports.
 * Prelude modules are imported from their own files (`import * as Schema from "effect/Schema"`,
 * ADR-0089), slotted in order among the file's own imports from `effect/…`. Names are
 * merged into an existing `import { … } from "<module>"` when there is one.
 * Compiler-owned references may be aliased (`Effect as Effect$`, ADR-0009).
 *
 * @since 0.1.0
 */
import type { MagicString } from "magic-string"
import type { ScopeAnalysis } from "./analyze/scope.ts"
import type { Node } from "./ast.ts"
import { importTarget } from "./prelude/files.ts"

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
  const named = new Map<string, Array<readonly [local: string, imported: string]>>()
  const namespaces: Array<readonly [from: string, local: string]> = []
  for (const [module, names] of ctx.imports.entries) {
    for (const [local, imported] of names) {
      if (ctx.analysis.module.values.has(local)) continue
      // the user already loads the package index: add to that import (ADR-0089)
      const target = existingImport(ctx, module) !== undefined ?
        { from: module, namespace: false } :
        importTarget(module, imported)
      if (target.namespace) namespaces.push([target.from, local])
      else named.set(target.from, [...(named.get(target.from) ?? []), [local, imported]])
    }
  }
  const lines: Array<readonly [from: string, line: string]> = namespaces.map((
    [from, local]
  ) => [from, `import * as ${local} from "${from}"`])
  for (const [from, names] of named) {
    const specifiers = names
      .sort(([localA, importedA], [localB, importedB]) =>
        importedA === importedB ?
          compare(localA === importedA ? "" : localA, localB === importedB ? "" : localB) :
          compare(importedA, importedB)
      )
      .map(([local, imported]) => (local === imported ? imported : `${imported} as ${local}`))
    const existing = existingImport(ctx, from)
    if (existing !== undefined) {
      ctx.s.appendLeft(existing.specifiers.at(-1).end, `, ${specifiers.join(", ")}`)
    } else {
      lines.push([from, `import { ${specifiers.join(", ")} } from "${from}"`])
    }
  }
  lines.sort(([a, x], [b, y]) => compare(a, b) || compare(x, y))
  // the file already imports module files: slot new ones in among them, in order
  const block = moduleFileImports(ctx)
  const prepended = lines.filter(([from, line]) => {
    if (block.length === 0 || !from.startsWith("effect/")) return true
    const after = block.find((statement) => compare(statement.source.value, from) > 0)
    if (after !== undefined) ctx.s.appendLeft(after.start, `${line}\n`)
    else ctx.s.appendLeft(block.at(-1)!.end, `\n${line}`)
    return false
  })
  if (prepended.length === 0) return
  const text = `${prepended.map(([, line]) => line).join("\n")}\n`
  if (ctx.source.startsWith("#!")) {
    const lineEnd = ctx.source.indexOf("\n")
    ctx.s.appendLeft(lineEnd === -1 ? ctx.source.length : lineEnd + 1, text)
  } else {
    ctx.s.prepend(text)
  }
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A value import of `module` with named specifiers only, which new names can join. */
const existingImport = (ctx: { readonly analysis: ScopeAnalysis }, module: string): Node | undefined =>
  ctx.analysis.program.body.find((statement: Node) =>
    statement.type === "ImportDeclaration" && statement.source.value === module && statement.importKind !== "type" &&
    statement.specifiers.length > 0 && statement.specifiers.every((s: Node) => s.type === "ImportSpecifier")
  )

/** Value imports from `effect/…` (`import * as Schema from "effect/Schema"`). */
const moduleFileImports = (ctx: { readonly analysis: ScopeAnalysis }): Array<Node> =>
  ctx.analysis.program.body.filter((statement: Node) =>
    statement.type === "ImportDeclaration" && statement.source.value.startsWith("effect/") &&
    statement.importKind !== "type" && statement.specifiers.length > 0
  )

/** Turns `specifier` (type-only by itself or through its statement) into a value import. */
const upgradeTypeOnly = (
  ctx: { readonly source: string; readonly s: MagicString },
  statement: Node,
  specifier: Node
): void => {
  if (statement.importKind === "type") {
    const typeKeyword = ctx.source.indexOf("type", statement.start + "import".length)
    const first: Node = statement.specifiers[0]
    ctx.s.remove(
      typeKeyword,
      first.type === "ImportNamespaceSpecifier" ? first.start : ctx.source.indexOf("{", typeKeyword)
    )
    for (const other of statement.specifiers as Array<Node>) {
      if (other !== specifier) ctx.s.appendRight(other.start, "type ")
    }
  } else if (specifier.importKind === "type") {
    ctx.s.remove(specifier.start, specifier.imported.start)
  }
}
