/**
 * Prelude sugar that depends on the whole file, verified by recompiling (ADR-0030 amendment). Per
 * prelude name `X`, one group holds:
 *
 * - its import specifier (`import { X } from "<prelude module>"`);
 * - its bare types (`X.X<…>` → `X<…>`, spec §4.5);
 * - its awaited service tags (`await X.X` → `await X`).
 *
 * The forward compiler restores all of them only when `X` is free, so a group is applied only when
 * the file compiles to the same output with and without it.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import { analyze } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import { toTypeScript } from "../compile.ts"
import { parse } from "../parser/parse.ts"
import { bareTypes, excludedNames, preludeFunctions, preludeModules, serviceTags } from "../prelude/tables.ts"
import type { ConvertOptions } from "./context.ts"

interface Group {
  readonly name: string
  /** The import specifier and its declaration, when the name is imported. */
  readonly specifier: { readonly statement: Node; readonly node: Node } | undefined
  /** Text ranges removed by the group (`X.` of a bare type, `.X` of a service tag). */
  readonly ranges: Array<readonly [number, number]>
}

const importedName = (specifier: Node): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)

const groupsOf = (program: Node): Array<Group> => {
  const analysis = analyze(program)
  const groups = new Map<string, Group>()
  const imported = new Set<string>()
  const group = (name: string) => {
    let found = groups.get(name)
    if (found === undefined) {
      found = { name, specifier: undefined, ranges: [] }
      groups.set(name, found)
    }
    return found
  }
  for (const statement of program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration") continue
    for (const specifier of statement.specifiers as Array<Node>) {
      imported.add(specifier.local.name)
      if (statement.importKind === "type" || specifier.type !== "ImportSpecifier") continue
      if (specifier.importKind === "type") continue
      const name = importedName(specifier)
      if (specifier.local.name !== name) continue
      if ((preludeModules.get(name) ?? preludeFunctions.get(name)) !== statement.source.value) continue
      groups.set(name, { ...group(name), specifier: { statement, node: specifier } })
    }
  }
  // a name declared by the module itself (not through an import) is never the prelude's
  const declared = (name: string) =>
    analysis.innerBound.has(name) ||
    ((analysis.module.values.has(name) || analysis.module.types.has(name)) && !imported.has(name))
  const prelude = (name: string) =>
    !excludedNames.has(name) && preludeModules.has(name) && !declared(name) &&
    (!imported.has(name) || groups.get(name)?.specifier !== undefined)
  const visit = (node: Node, parent: Node | undefined): void => {
    if (node.type === "TSTypeReference" && node.typeName.type === "TSQualifiedName") {
      const { left, right } = node.typeName
      if (left.type === "Identifier" && left.name === right.name && bareTypes.has(left.name) && prelude(left.name)) {
        group(left.name).ranges.push([left.start, right.start])
      }
    }
    if (
      node.type === "MemberExpression" && !node.computed && parent?.type === "AwaitExpression" &&
      parent.argument === node && node.object.type === "Identifier" && node.object.name === node.property.name &&
      serviceTags.has(node.object.name) && prelude(node.object.name)
    ) {
      group(node.object.name).ranges.push([node.object.end, node.end])
    }
    for (const child of children(node)) visit(child, node)
  }
  visit(program, undefined)
  return [...groups.values()]
}

const apply = (code: string, chosen: ReadonlyArray<Group>): string => {
  const s = new MagicString(code)
  const byStatement = new Map<Node, Array<Node>>()
  for (const { ranges, specifier } of chosen) {
    for (const [start, end] of ranges) s.remove(start, end)
    if (specifier !== undefined) {
      byStatement.set(specifier.statement, [...(byStatement.get(specifier.statement) ?? []), specifier.node])
    }
  }
  for (const [statement, gone] of byStatement) {
    const specifiers: Array<Node> = statement.specifiers
    if (gone.length === specifiers.length) {
      s.remove(statement.start, code[statement.end] === "\n" ? statement.end + 1 : statement.end)
      continue
    }
    for (const spec of gone) {
      const index = specifiers.indexOf(spec)
      const previousKept = specifiers.slice(0, index).reverse().find((other) => !gone.includes(other))
      const next = specifiers[index + 1]
      // remove the specifier with the separator before the next one, or after the previous kept one
      if (previousKept === undefined || (next !== undefined && !gone.includes(next))) s.remove(spec.start, next!.start)
      else s.remove(specifiers[index - 1]!.end, spec.end)
    }
  }
  return s.toString()
}

/**
 * Applies the prelude groups of `code` that the forward compiler restores unchanged.
 *
 * @since 4.0.0
 * @category reverse
 */
export const applyPrelude = (code: string, options: ConvertOptions): string => {
  if (options.prelude === false) return code
  const parsed = parse(code)
  if (parsed._tag === "Failure") return code
  const groups = groupsOf(parsed.program)
  if (groups.length === 0) return code
  const expected = toTypeScript(code, options)
  if (expected.diagnostics.some((d) => d.severity === "error")) return code
  const same = (chosen: ReadonlyArray<Group>) => {
    const result = toTypeScript(apply(code, chosen), options)
    return result.code === expected.code && !result.diagnostics.some((d) => d.severity === "error")
  }
  if (same(groups)) return apply(code, groups)
  // the prelude appends missing names at the end of an import: try the groups last-first
  const ordered = [...groups].sort((a, b) => (b.specifier?.node.start ?? -1) - (a.specifier?.node.start ?? -1))
  const accepted: Array<Group> = []
  for (const group of ordered) {
    if (same([...accepted, group])) accepted.push(group)
  }
  return accepted.length === 0 ? code : apply(code, accepted)
}
