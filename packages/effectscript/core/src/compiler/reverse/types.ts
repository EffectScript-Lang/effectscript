/**
 * Schema expressions → TypeScript type syntax: the inverse of `schema/mapping.ts` (spec §4.6).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { isMember } from "./origin.ts"

const keywords: Record<string, string> = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
  BigInt: "bigint",
  Unknown: "unknown",
  Any: "any",
  Never: "never",
  Null: "null",
  Undefined: "undefined",
  Void: "void"
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
const generic1: Record<string, string> = {
  Array: "Array",
  ReadonlySet: "ReadonlySet",
  Option: "Option",
  Redacted: "Redacted"
}
const generic2: Record<string, string> = { Record: "Record", ReadonlyMap: "ReadonlyMap" }

/** Schemas whose type is a union: a brand on them doesn't distribute. */
const unions = ["Union", "Literals", "NullOr", "UndefinedOr", "NullishOr"]

/** A literal a type can spell: a string, number, boolean, `null`, or a negative number. */
const isLiteral = (node: Node | null): boolean =>
  node !== null && (
    (node.type === "Literal" && node.regex === undefined && node.bigint === undefined) ||
    (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal" &&
      typeof node.argument.value === "number")
  )

/**
 * The TypeScript type for a schema expression, or `undefined` when it has no table entry.
 *
 * @since 4.0.0
 * @category reverse
 */
export const schemaToType = (source: string, schema: string, node: Node): string | undefined => {
  const slice = (n: Node) => source.slice(n.start, n.end)
  const go = (n: Node): string | undefined => {
    if (isMember(n, schema)) {
      const name: string = n.property.name
      return keywords[name] ?? (vocabulary.has(name) ? name : undefined)
    }
    if (n.type === "Identifier") return n.name
    if (n.type !== "CallExpression") return undefined
    const args: Array<Node> = n.arguments
    // T.pipe(Schema.brand("X")); a union can't be branded as `A | B & Brand<…>` (it would brand B)
    if (
      n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.property.name === "pipe" &&
      args.length === 1 && args[0]!.type === "CallExpression" && isMember(args[0]!.callee, schema, "brand")
    ) {
      const object: Node = n.callee.object
      if (object.type === "CallExpression" && unions.some((u) => isMember(object.callee, schema, u))) return undefined
      const inner = go(object)
      const literal = args[0]!.arguments[0]
      return inner === undefined || literal?.type !== "Literal" ? undefined : `${inner} & Brand<${slice(literal)}>`
    }
    if (!isMember(n.callee, schema)) return undefined
    const name: string = n.callee.property.name
    const all = (nodes: Array<Node>) => {
      const types = nodes.map(go)
      return types.every((t) => t !== undefined) ? (types as Array<string>) : undefined
    }
    const list = (n: Node | undefined) => (n?.type === "ArrayExpression" ? all(n.elements) : undefined)
    switch (name) {
      case "Literal":
        return args.length === 1 && isLiteral(args[0]!) ? slice(args[0]!) : undefined
      case "Literals":
        return args[0]?.type === "ArrayExpression" && args[0].elements.length > 1 &&
            (args[0].elements as Array<Node>).every(isLiteral)
          ? args[0].elements.map(slice).join(" | ")
          : undefined
      case "Union": {
        const members = list(args[0])
        return members === undefined || members.length < 2 ? undefined : members.join(" | ")
      }
      case "Tuple": {
        const types = list(args[0])
        return types === undefined ? undefined : `[${types.join(", ")}]`
      }
      case "NullOr":
      case "UndefinedOr":
      case "NullishOr": {
        const inner = args.length === 1 ? go(args[0]!) : undefined
        if (inner === undefined) return undefined
        return name === "NullOr" ? `${inner} | null` : name === "UndefinedOr" ?
          `${inner} | undefined` :
          `${inner} | null | undefined`
      }
      case "Defect":
        return args.length === 0 ? "Defect" : undefined
      case "Struct": {
        if (args[0]?.type !== "ObjectExpression") return undefined
        const members: Array<string> = []
        for (const property of args[0].properties as Array<Node>) {
          const field = fieldType(source, schema, property)
          if (field === undefined) return undefined
          members.push(`${field.key}${field.optional}: ${field.type}`)
        }
        return members.length === 0 ? "{}" : `{ ${members.join("; ")} }`
      }
    }
    const one = generic1[name]
    if (one !== undefined && args.length === 1) {
      const inner = go(args[0]!)
      return inner === undefined ? undefined : `${one}<${inner}>`
    }
    const two = generic2[name]
    if (two !== undefined && args.length === 2) {
      const types = all(args)
      return types === undefined ? undefined : `${two}<${types.join(", ")}>`
    }
    return undefined
  }
  return go(node)
}

/**
 * A struct/class field: `key: T` / `key?: T` (`optionalKey`) / `key?: T | undefined` (`optional`).
 *
 * @since 4.0.0
 * @category reverse
 */
export const fieldType = (
  source: string,
  schema: string,
  property: Node
): { readonly key: string; readonly optional: "" | "?"; readonly type: string } | undefined => {
  if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) return undefined
  const key = property.key.type === "Identifier"
    ? property.key.name
    : source.slice(property.key.start, property.key.end)
  const value: Node = property.value
  if (value.type === "CallExpression" && value.arguments.length === 1) {
    if (isMember(value.callee, schema, "optionalKey")) {
      const type = schemaToType(source, schema, value.arguments[0])
      return type === undefined ? undefined : { key, optional: "?", type }
    }
    if (isMember(value.callee, schema, "optional")) {
      const type = schemaToType(source, schema, value.arguments[0])
      return type === undefined ? undefined : { key, optional: "?", type: `${type} | undefined` }
    }
  }
  const type = schemaToType(source, schema, value)
  return type === undefined ? undefined : { key, optional: "", type }
}
