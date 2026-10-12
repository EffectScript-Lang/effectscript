/**
 * The conversion-time ADR-0030 check: EffectScript produced by `toEffectScript` must compile back
 * to the input's syntax tree (ADR-0306: semicolons, trailing commas and layout aside) and its
 * comments, in order.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { toTypeScript } from "../compile.ts"
import { parse } from "../parser/parse.ts"
import { importTarget } from "../prelude/files.ts"
import type { ConvertOptions } from "./context.ts"

/** The syntax tree without positions, as text: literals keep their spelling (`raw`). */
const tree = (node: unknown): string => {
  if (Array.isArray(node)) return `[${node.map(tree).join(",")}]`
  if (node === null || typeof node !== "object") {
    return typeof node === "bigint" ? `${node}n` : JSON.stringify(node) ?? "undefined"
  }
  if (node instanceof RegExp) return String(node)
  const fields: Array<string> = []
  for (const [key, value] of Object.entries(node)) {
    if (key !== "start" && key !== "end" && key !== "loc") fields.push(`${key}:${tree(value)}`)
  }
  return `{${fields.join(",")}}`
}

/** The program's syntax tree and its comments, as text; `undefined` when it doesn't parse. */
const shape = (source: string): { readonly tree: string; readonly comments: string } | undefined => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") return undefined
  return {
    tree: tree(parsed.program),
    comments: parsed.comments.map((c) => source.slice(c.start, c.end)).join("\u0000")
  }
}

/**
 * Whether `efx` compiles without errors to code equivalent to `typescript`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const compilesBack = (typescript: string, efx: string, options: ConvertOptions): boolean =>
  verdict(typescript, efx, options) > 0

/**
 * How well `efx` compiles back to `typescript`: 2 = byte for byte, 1 = the same syntax tree and
 * comments (ADR-0306), 0 = not at all (or with errors).
 *
 * @since 4.0.0
 * @category reverse
 */
export const verdict = (typescript: string, efx: string, options: ConvertOptions): 0 | 1 | 2 => {
  const result = toTypeScript(efx, options)
  if (result.diagnostics.some((d) => d.severity === "error")) return 0
  if (result.code === typescript) return 2
  const before = shape(typescript)
  const after = shape(result.code)
  return before !== undefined && after !== undefined && before.tree === after.tree &&
      before.comments === after.comments
    ? 1
    : 0
}

const importedName = (specifier: Node): string =>
  specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value)

/**
 * `source` with each run of imports from `effect` and its subpaths replaced by a marker, plus those
 * imports as sorted bindings (`local=what`), where an index import of a prelude module and a namespace import of the
 * module's file are the same binding (ADR-0089).
 */
const marker = "\u0024effectImports;"

const effectImports = (source: string): { readonly rest: string; readonly bindings: string } | undefined => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") return undefined
  const bindings: Array<string> = []
  let rest = ""
  let at = 0
  let inRun = false
  for (const statement of parsed.program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || !/^effect(\/|$)/.test(statement.source.value)) continue
    const from: string = statement.source.value
    for (const specifier of statement.specifiers as Array<Node>) {
      const type = statement.importKind === "type" || specifier.importKind === "type" ? " type" : ""
      let what: string
      if (specifier.type === "ImportSpecifier") {
        const target = importTarget(from, importedName(specifier))
        what = target.namespace ? `* ${target.from}` : `${importedName(specifier)} ${target.from}`
      } else {
        what = `${specifier.type === "ImportNamespaceSpecifier" ? "*" : "default"} ${from}`
      }
      bindings.push(`${specifier.local.name}=${what}${type}`)
    }
    // a run of effect imports stays a marker in place: it must not move across other code, such as
    // a side-effectful `import "./polyfill"` (ADR-0030)
    const between = source.slice(at, statement.start)
    if (!(inRun && between.trim() === "")) rest += `${between}${marker}`
    inRun = true
    at = statement.end
  }
  return { rest: rest + source.slice(at), bindings: bindings.sort().join("\u0000") }
}

/**
 * Whether `efx` compiles without errors to code equivalent to `typescript` once imports from
 * `effect` are compared as bindings rather than text: the ADR-0089 canonicalization, where an
 * index import of a prelude name comes back as an import of the module's own file.
 *
 * @since 4.0.0
 * @category reverse
 */
export const compilesBackModuloImports = (typescript: string, efx: string, options: ConvertOptions): boolean => {
  const result = toTypeScript(efx, options)
  if (result.diagnostics.some((d) => d.severity === "error")) return false
  const before = effectImports(typescript)
  const after = effectImports(result.code)
  if (before === undefined || after === undefined || before.bindings !== after.bindings) return false
  const a = shape(before.rest)
  const b = shape(after.rest)
  return a !== undefined && b !== undefined && a.tree === b.tree && a.comments === b.comments
}
