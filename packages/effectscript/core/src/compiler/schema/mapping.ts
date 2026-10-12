/**
 * TypeScript type syntax → Effect Schema expressions (spec §4.6).
 *
 * @since 0.1.0
 */
import { isTypeFree, isValueFree } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import { type Ctx, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import { resolveValue } from "../prelude/resolve.ts"
import { schemaGlobalChecks } from "../prelude/tables.ts"
import { walk } from "../walk.ts"

const keywords: Record<string, string> = {
  TSStringKeyword: "String",
  TSNumberKeyword: "Number",
  TSBooleanKeyword: "Boolean",
  TSBigIntKeyword: "BigInt",
  TSUnknownKeyword: "Unknown",
  TSAnyKeyword: "Any",
  TSNeverKeyword: "Never",
  TSNullKeyword: "Null",
  TSUndefinedKeyword: "Undefined",
  TSVoidKeyword: "Void"
}
const vocabulary = new Set([
  "BigDecimal",
  "Date",
  "DateTimeUtc",
  "Duration",
  "Finite",
  "Int",
  "NonEmptyString",
  "Trimmed",
  "Uint8Array",
  "URL"
])
const unary: Record<string, string> = {
  Array: "Array",
  ReadonlyArray: "Array",
  Set: "ReadonlySet",
  ReadonlySet: "ReadonlySet",
  Option: "Option",
  Redacted: "Redacted"
}
const binary: Record<string, string> = { Record: "Record", Map: "ReadonlyMap", ReadonlyMap: "ReadonlyMap" }

/**
 * `Schema.<member>`, through the file's hygienic `Schema` reference (ADR-0009).
 *
 * @since 0.1.0
 * @category schema
 */
export const schemaRef = (ctx: Ctx, member: string): string => `${ref(ctx, "effect", "Schema")}.${member}`

const typeArgs = (node: Node): Array<Node> => (node.typeArguments ?? node.typeParameters)?.params ?? []
const slice = (ctx: Ctx, node: Node): string => ctx.source.slice(node.start, node.end)

const unsupported = (ctx: Ctx, node: Node): string => {
  ctx.diagnostics.push(
    diagnosticError(
      "EFX3001",
      "This type is not supported in a schema position",
      node.start,
      node.end,
      "write the field as `name = <Schema expression>`"
    )
  )
  return schemaRef(ctx, "Unknown")
}

const union = (ctx: Ctx, types: ReadonlyArray<Node>): string => {
  const isNull = (t: Node) => t.type === "TSNullKeyword"
  const isUndefined = (t: Node) => t.type === "TSUndefinedKeyword"
  const rest = types.filter((t) => !isNull(t) && !isUndefined(t))
  const hasNull = types.some(isNull)
  const hasUndefined = types.some(isUndefined)
  if (rest.length === 0) {
    return hasNull && hasUndefined
      ? `${schemaRef(ctx, "Union")}([${schemaRef(ctx, "Null")}, ${schemaRef(ctx, "Undefined")}])`
      : hasNull
      ? schemaRef(ctx, "Null")
      : schemaRef(ctx, "Undefined")
  }
  const inner = rest.length === 1
    ? typeToSchema(ctx, rest[0]!)
    : rest.every((t) => t.type === "TSLiteralType")
    ? `${schemaRef(ctx, "Literals")}([${rest.map((t) => slice(ctx, t.literal)).join(", ")}])`
    : `${schemaRef(ctx, "Union")}([${rest.map((t) => typeToSchema(ctx, t)).join(", ")}])`
  return hasNull && hasUndefined
    ? `${schemaRef(ctx, "NullishOr")}(${inner})`
    : hasNull
    ? `${schemaRef(ctx, "NullOr")}(${inner})`
    : hasUndefined
    ? `${schemaRef(ctx, "UndefinedOr")}(${inner})`
    : inner
}

const member = (ctx: Ctx, node: Node): string => {
  if (node.type !== "TSPropertySignature" || node.typeAnnotation === undefined) return unsupported(ctx, node)
  const key = node.key.type === "Identifier" ? node.key.name : slice(ctx, node.key)
  return `${key}: ${fieldSchema(ctx, node.typeAnnotation.typeAnnotation, node.optional === true, node.efxWhere)}`
}

/**
 * The schema of an optional field `name?: T` (ADR-0013): `Schema.optionalKey(T)`, or
 * `Schema.optional(U)` when `T` is `U | undefined` (an explicit `undefined` is then allowed).
 *
 * @since 0.1.0
 * @category schema
 */
export const optionalField = (ctx: Ctx, type: Node): string => {
  if (type.type === "TSUnionType" && type.types.some((t: Node) => t.type === "TSUndefinedKeyword")) {
    const rest: Array<Node> = type.types.filter((t: Node) => t.type !== "TSUndefinedKeyword")
    const inner = rest.length === 1 ? rest[0]! : { ...type, types: rest }
    return `${schemaRef(ctx, "optional")}(${typeToSchema(ctx, inner)})`
  }
  return `${schemaRef(ctx, "optionalKey")}(${typeToSchema(ctx, type)})`
}

/**
 * @since 0.1.0
 * @category schema
 */
export const typeToSchema = (ctx: Ctx, node: Node): string => {
  const keyword = keywords[node.type]
  if (keyword !== undefined) return schemaRef(ctx, keyword)
  switch (node.type) {
    case "TSLiteralType":
      return `${schemaRef(ctx, "Literal")}(${slice(ctx, node.literal)})`
    case "TSArrayType":
      return `${schemaRef(ctx, "Array")}(${typeToSchema(ctx, node.elementType)})`
    case "TSParenthesizedType":
      return typeToSchema(ctx, node.typeAnnotation)
    case "TSTypeOperator":
      return node.operator === "readonly" ? typeToSchema(ctx, node.typeAnnotation) : unsupported(ctx, node)
    case "TSTupleType":
      return `${schemaRef(ctx, "Tuple")}([${node.elementTypes.map((t: Node) => typeToSchema(ctx, t)).join(", ")}])`
    case "TSTypeLiteral":
      return `${schemaRef(ctx, "Struct")}({ ${node.members.map((m: Node) => member(ctx, m)).join(", ")} })`
    case "TSUnionType":
      return union(ctx, node.types)
    case "TSIntersectionType": {
      const brand = node.types.find((t: Node) =>
        t.type === "TSTypeReference" && t.typeName.type === "Identifier" && t.typeName.name === "Brand"
      )
      const others = node.types.filter((t: Node) => t !== brand)
      const literal = brand !== undefined ? typeArgs(brand)[0] : undefined
      if (brand === undefined || others.length !== 1 || literal?.type !== "TSLiteralType") return unsupported(ctx, node)
      return `${typeToSchema(ctx, others[0]!)}.pipe(${schemaRef(ctx, "brand")}(${slice(ctx, literal.literal)}))`
    }
    case "TSTypeReference": {
      const args = typeArgs(node)
      const name: string | undefined = node.typeName.type === "Identifier" ? node.typeName.name : undefined
      if (name !== undefined && isTypeFree(ctx.scope, name)) {
        if (args.length === 0 && vocabulary.has(name)) return schemaRef(ctx, name)
        if (args.length === 0 && name === "Defect") return `${schemaRef(ctx, "Defect")}()`
        if (args.length === 1 && unary[name] !== undefined) {
          return `${schemaRef(ctx, unary[name]!)}(${typeToSchema(ctx, args[0]!)})`
        }
        if (args.length === 2 && binary[name] !== undefined) {
          return `${schemaRef(ctx, binary[name]!)}(${typeToSchema(ctx, args[0]!)}, ${typeToSchema(ctx, args[1]!)})`
        }
      }
      if (args.length > 0) return unsupported(ctx, node)
      return slice(ctx, node.typeName)
    }
    default:
      return unsupported(ctx, node)
  }
}

const unparen = (type: Node): Node => (type.type === "TSParenthesizedType" ? unparen(type.typeAnnotation) : type)

const isNullish = (type: Node): boolean => type.type === "TSNullKeyword" || type.type === "TSUndefinedKeyword"

/**
 * How a check's name resolves in a `where` list: `"builtin"` for a free name the Schema namespace
 * resolves (the prelude qualifies it), `"global"` for a Schema check named like a JavaScript global
 * (`isFinite`), which only a `where` list reads as the check; `undefined` for anything else.
 */
const checkName = (ctx: Ctx, node: Node): "builtin" | "global" | undefined => {
  if (node.type !== "Identifier") return undefined
  const name: string = node.name
  if (schemaGlobalChecks.has(name)) {
    return ctx.options.prelude && isValueFree(ctx.scope, name) && isTypeFree(ctx.scope, name) ? "global" : undefined
  }
  const resolution = resolveValue(ctx, name)
  return resolution?.importName === "Schema" && resolution.prefix === "Schema." ? "builtin" : undefined
}

/**
 * A `where` clause's checks as text, `a, b` (ADR-0077). The first call walks them in place, which
 * qualifies their bare Schema builtins (`isNonEmpty(…)` → `Schema.isNonEmpty(…)`) and calls a check
 * written without its `()` (`isTrimmed` → `Schema.isTrimmed()`, ADR-0300); later calls read the same
 * text back.
 *
 * @since 4.0.0
 * @category schema
 */
export const checksText = (ctx: Ctx, clause: Node): string => {
  if (clause.efxWalked !== true) {
    clause.efxWalked = true
    withNamespace(ctx, "Schema", () => {
      for (const check of clause.checks as Array<Node>) {
        const name: Node = check.type === "CallExpression" ? check.callee : check
        const kind = checkName(ctx, name)
        if (kind === "global") ctx.s.appendRight(name.start, `${ref(ctx, "effect", "Schema")}.`)
        if (kind !== undefined && check.type === "Identifier") ctx.s.appendLeft(check.end, "()")
        walk(check, clause, ctx)
      }
    })
  }
  return (clause.checks as Array<Node>).map((check) => ctx.s.slice(check.start, check.end)).join(", ")
}

/**
 * The text around a checked type's checks (ADR-0077): `open` ends with `.check(` and `close`
 * closes it. The checks go on the type without its top-level `null` and `undefined`, which wrap the
 * checked schema; an optional field's `optionalKey`, or `optional` when it allows `undefined`
 * (ADR-0013), wraps that.
 *
 * @since 4.0.0
 * @category schema
 */
export const checkedParts = (
  ctx: Ctx,
  type: Node,
  optional: boolean,
  clause: Node
): { readonly open: string; readonly close: string } => {
  const inner = unparen(type)
  const all: Array<Node> = inner.type === "TSUnionType" ? inner.types : [inner]
  const hasNull = all.some((t) => t.type === "TSNullKeyword")
  const hasUndefined = all.some((t) => t.type === "TSUndefinedKeyword")
  const rest = all.filter((t) => !isNullish(t))
  const wrappers: Array<string> = []
  if (optional) wrappers.push(schemaRef(ctx, hasUndefined ? "optional" : "optionalKey"))
  // an optional field's `| undefined` belongs to `optional`; otherwise it wraps the checks
  const undefinedOr = hasUndefined && !optional
  if (hasNull && undefinedOr) wrappers.push(schemaRef(ctx, "NullishOr"))
  else if (hasNull) wrappers.push(schemaRef(ctx, "NullOr"))
  else if (undefinedOr) wrappers.push(schemaRef(ctx, "UndefinedOr"))
  if (rest.length === 0) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX3005",
        "`where` needs a type to check besides `null` and `undefined`",
        clause.start,
        clause.end
      )
    )
  }
  const base = rest.length === 0
    ? schemaRef(ctx, "Unknown")
    : typeToSchema(ctx, rest.length === 1 ? rest[0]! : { ...inner, types: rest })
  return {
    open: `${wrappers.map((wrapper) => `${wrapper}(`).join("")}${base}.check(`,
    close: `)${")".repeat(wrappers.length)}`
  }
}

/**
 * Lowers a `where` clause where it stands (ADR-0077): `open` replaces the text from `from` to the
 * first check, the checks are joined by `, ` on one line and walked in place (so the editor maps
 * them), and `close` follows the last one.
 *
 * @since 4.0.0
 * @category schema
 */
export const lowerChecks = (ctx: Ctx, from: number, clause: Node, open: string, close: string): void => {
  const checks: Array<Node> = clause.checks
  ctx.s.update(from, checks[0]!.start, open)
  for (let i = 1; i < checks.length; i++) ctx.s.update(checks[i - 1]!.end, checks[i]!.start, ", ")
  checksText(ctx, clause)
  ctx.s.appendLeft(clause.end, close)
}

/**
 * The schema of a field `name[?]: T [where …]` as text (ADR-0013, ADR-0077), for fields that are
 * written out whole: type-literal members, ADT variants, signature lines and endpoint sections.
 *
 * @since 4.0.0
 * @category schema
 */
export const fieldSchema = (ctx: Ctx, type: Node, optional: boolean, clause: Node | null | undefined): string => {
  if (clause === null || clause === undefined) return optional ? optionalField(ctx, type) : typeToSchema(ctx, type)
  const { close, open } = checkedParts(ctx, type, optional, clause)
  return `${open}${checksText(ctx, clause)}${close}`
}
