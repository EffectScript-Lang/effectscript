/**
 * TypeScript type syntax → Effect Schema expressions (spec §4.6).
 *
 * @since 0.1.0
 */
import { isTypeFree } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { Ctx } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"

const keywords: Record<string, string> = {
  TSStringKeyword: "Schema.String",
  TSNumberKeyword: "Schema.Number",
  TSBooleanKeyword: "Schema.Boolean",
  TSBigIntKeyword: "Schema.BigInt",
  TSUnknownKeyword: "Schema.Unknown",
  TSAnyKeyword: "Schema.Any",
  TSNeverKeyword: "Schema.Never",
  TSNullKeyword: "Schema.Null",
  TSUndefinedKeyword: "Schema.Undefined",
  TSVoidKeyword: "Schema.Void"
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
  return "Schema.Unknown"
}

const union = (ctx: Ctx, types: ReadonlyArray<Node>): string => {
  const isNull = (t: Node) => t.type === "TSNullKeyword"
  const isUndefined = (t: Node) => t.type === "TSUndefinedKeyword"
  const rest = types.filter((t) => !isNull(t) && !isUndefined(t))
  const hasNull = types.some(isNull)
  const hasUndefined = types.some(isUndefined)
  if (rest.length === 0) {
    return hasNull && hasUndefined
      ? "Schema.Union([Schema.Null, Schema.Undefined])"
      : hasNull
      ? "Schema.Null"
      : "Schema.Undefined"
  }
  const inner = rest.length === 1
    ? typeToSchema(ctx, rest[0]!)
    : rest.every((t) => t.type === "TSLiteralType")
    ? `Schema.Literals([${rest.map((t) => slice(ctx, t.literal)).join(", ")}])`
    : `Schema.Union([${rest.map((t) => typeToSchema(ctx, t)).join(", ")}])`
  return hasNull && hasUndefined
    ? `Schema.NullishOr(${inner})`
    : hasNull
    ? `Schema.NullOr(${inner})`
    : hasUndefined
    ? `Schema.UndefinedOr(${inner})`
    : inner
}

const member = (ctx: Ctx, node: Node): string => {
  if (node.type !== "TSPropertySignature" || node.typeAnnotation === undefined) return unsupported(ctx, node)
  const key = node.key.type === "Identifier" ? node.key.name : slice(ctx, node.key)
  const schema = typeToSchema(ctx, node.typeAnnotation.typeAnnotation)
  return `${key}: ${node.optional === true ? `Schema.optional(${schema})` : schema}`
}

/**
 * @since 0.1.0
 * @category schema
 */
export const typeToSchema = (ctx: Ctx, node: Node): string => {
  const keyword = keywords[node.type]
  if (keyword !== undefined) return keyword
  switch (node.type) {
    case "TSLiteralType":
      return `Schema.Literal(${slice(ctx, node.literal)})`
    case "TSArrayType":
      return `Schema.Array(${typeToSchema(ctx, node.elementType)})`
    case "TSParenthesizedType":
      return typeToSchema(ctx, node.typeAnnotation)
    case "TSTypeOperator":
      return node.operator === "readonly" ? typeToSchema(ctx, node.typeAnnotation) : unsupported(ctx, node)
    case "TSTupleType":
      return `Schema.Tuple([${node.elementTypes.map((t: Node) => typeToSchema(ctx, t)).join(", ")}])`
    case "TSTypeLiteral":
      return `Schema.Struct({ ${node.members.map((m: Node) => member(ctx, m)).join(", ")} })`
    case "TSUnionType":
      return union(ctx, node.types)
    case "TSIntersectionType": {
      const brand = node.types.find((t: Node) =>
        t.type === "TSTypeReference" && t.typeName.type === "Identifier" && t.typeName.name === "Brand"
      )
      const others = node.types.filter((t: Node) => t !== brand)
      const literal = brand !== undefined ? typeArgs(brand)[0] : undefined
      if (brand === undefined || others.length !== 1 || literal?.type !== "TSLiteralType") return unsupported(ctx, node)
      return `${typeToSchema(ctx, others[0]!)}.pipe(Schema.brand(${slice(ctx, literal.literal)}))`
    }
    case "TSTypeReference": {
      const args = typeArgs(node)
      const name: string | undefined = node.typeName.type === "Identifier" ? node.typeName.name : undefined
      if (name !== undefined && isTypeFree(ctx.scope, name)) {
        if (args.length === 0 && vocabulary.has(name)) return `Schema.${name}`
        if (args.length === 0 && name === "Defect") return "Schema.Defect()"
        if (args.length === 1 && unary[name] !== undefined) {
          return `Schema.${unary[name]}(${typeToSchema(ctx, args[0]!)})`
        }
        if (args.length === 2 && binary[name] !== undefined) {
          return `Schema.${binary[name]}(${typeToSchema(ctx, args[0]!)}, ${typeToSchema(ctx, args[1]!)})`
        }
      }
      if (args.length > 0) return unsupported(ctx, node)
      return slice(ctx, node.typeName)
    }
    default:
      return unsupported(ctx, node)
  }
}
