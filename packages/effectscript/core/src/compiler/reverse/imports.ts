/**
 * Prelude import cleanup, verified by recompiling (ADR-0030 amendment): an import specifier the
 * prelude would add back is removed only when the file compiles to the same output without it.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import type { Node } from "../ast.ts"
import { toTypeScript } from "../compile.ts"
import { parse } from "../parser/parse.ts"
import { preludeFunctions, preludeModules } from "../prelude/tables.ts"
import type { ConvertOptions } from "./context.ts"

interface Candidate {
  readonly statement: Node
  readonly specifier: Node
}

const importedName = (specifier: Node): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)

/** Value specifiers the prelude resolves to the same module under the same name. */
const candidatesOf = (program: Node): Array<Candidate> => {
  const candidates: Array<Candidate> = []
  for (const statement of program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue
    for (const specifier of statement.specifiers as Array<Node>) {
      if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue
      const name = importedName(specifier)
      if (specifier.local.name !== name) continue
      const module = preludeModules.get(name) ?? preludeFunctions.get(name)
      if (module === statement.source.value) candidates.push({ statement, specifier })
    }
  }
  return candidates
}

const without = (code: string, removed: ReadonlyArray<Candidate>): string => {
  const s = new MagicString(code)
  const byStatement = new Map<Node, Array<Node>>()
  for (const { specifier, statement } of removed) {
    byStatement.set(statement, [...(byStatement.get(statement) ?? []), specifier])
  }
  for (const [statement, gone] of byStatement) {
    const specifiers: Array<Node> = statement.specifiers
    if (gone.length === specifiers.length) {
      s.remove(statement.start, code[statement.end] === "\n" ? statement.end + 1 : statement.end)
      continue
    }
    for (const spec of gone) {
      const index = specifiers.indexOf(spec)
      const kept = specifiers.filter((other) => !gone.includes(other))
      const previousKept = specifiers.slice(0, index).reverse().find((other) => kept.includes(other))
      const next = specifiers[index + 1]
      // remove the specifier with the separator that leads to the next one, or after the previous kept one
      if (previousKept === undefined || (next !== undefined && !gone.includes(next))) s.remove(spec.start, next!.start)
      else s.remove(specifiers[index - 1]!.end, spec.end)
    }
  }
  return s.toString()
}

/**
 * Removes the prelude imports of `code` that the prelude restores unchanged.
 *
 * @since 4.0.0
 * @category reverse
 */
export const removePreludeImports = (code: string, options: ConvertOptions): string => {
  if (options.prelude === false) return code
  const parsed = parse(code)
  if (parsed._tag === "Failure") return code
  const candidates = candidatesOf(parsed.program)
  if (candidates.length === 0) return code
  const expected = toTypeScript(code, options)
  if (expected.diagnostics.some((d) => d.severity === "error")) return code
  const same = (removed: ReadonlyArray<Candidate>) => {
    const candidate = without(code, removed)
    const result = toTypeScript(candidate, options)
    return result.code === expected.code && !result.diagnostics.some((d) => d.severity === "error")
  }
  if (same(candidates)) return without(code, candidates)
  // the prelude appends missing names at the end of an import: try the specifiers last-first
  const accepted: Array<Candidate> = []
  for (const candidate of [...candidates].reverse()) {
    if (same([...accepted, candidate])) accepted.push(candidate)
  }
  return accepted.length === 0 ? code : without(code, accepted)
}
