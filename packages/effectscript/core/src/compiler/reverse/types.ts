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
export const schemaToType = (source: string, schema: string, node: Node, where?: Where): string | undefined => {
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
        // literals only: `1 | 2` compiles to `Schema.Literals([1, 2])`, the other spelling, so the
        // union keeps no type form (its field becomes an `=` field)
        const elements: Array<Node> = args[0]?.type === "ArrayExpression" ? args[0].elements : []
        if (
          elements.length > 0 &&
          elements.every((e) => e?.type === "CallExpression" && isMember(e.callee, schema, "Literal"))
        ) {
          return undefined
        }
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
          const field = fieldType(source, schema, property, where)
          if (field === undefined) return undefined
          members.push(`${field.key}${field.optional}: ${field.type}`)
        }
        return members.length === 0 ? "{}" : `{ ${members.join("; ")} }`
      }
    }
    const one = generic1[name]
    if (one !== undefined && args.length === 1) {
      const inner = go(args[0]!)
      if (inner === undefined) return undefined
      // `T[]` when `T` needs no parentheses, `Array<T>` otherwise: one spelling (ADR-0092 A3)
      return one === "Array" && /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*(?:\[\])*$/.test(inner)
        ? `${inner}[]`
        : `${one}<${inner}>`
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
 * Renders `.check(…)` arguments as a `where` list (ADR-0077).
 *
 * @since 4.0.0
 * @category reverse
 */
export type Where = (checks: ReadonlyArray<Node>) => string

/** What a nullable schema adds to a field's type. */
const nullishSuffix: Record<string, string> = {
  NullOr: " | null",
  UndefinedOr: " | undefined",
  NullishOr: " | null | undefined"
}

/**
 * `S.check(a, b)`: the checked schema and its checks.
 *
 * @since 4.0.0
 * @category reverse
 */
export const checkedOf = (node: Node): { readonly base: Node; readonly checks: ReadonlyArray<Node> } | undefined =>
  node.type === "CallExpression" && node.optional !== true && node.callee.type === "MemberExpression" &&
    !node.callee.computed && node.callee.optional !== true && node.callee.property.name === "check" &&
    node.arguments.length > 0 && (node.arguments as Array<Node>).every((a) => a.type !== "SpreadElement")
    ? { base: node.callee.object, checks: node.arguments }
    : undefined

/**
 * A field's or a declaration's type, and its checks as a `where` list: one `S.check(…)`, also under
 * a `NullOr`, which the forward compiler puts outside the checks (ADR-0077).
 */
const typeParts = (
  source: string,
  schema: string,
  node: Node,
  where: Where | undefined
): { readonly type: string; readonly checks: string | undefined } | undefined => {
  if (where !== undefined) {
    const suffix = node.type === "CallExpression" && node.arguments.length === 1 && isMember(node.callee, schema)
      ? nullishSuffix[node.callee.property.name]
      : undefined
    const checked = checkedOf(suffix === undefined ? node : node.arguments[0])
    const base: Node | undefined = checked?.base
    // a check on a nullable union isn't `where`: the forward compiler puts the checks inside it
    const nullableBase = base?.type === "CallExpression" && isMember(base.callee, schema) &&
      nullishSuffix[base.callee.property.name] !== undefined
    if (checked !== undefined && !nullableBase) {
      const type = schemaToType(source, schema, checked.base, where)
      return type === undefined ? undefined : { type: `${type}${suffix ?? ""}`, checks: where(checked.checks) }
    }
  }
  const type = schemaToType(source, schema, node, where)
  return type === undefined ? undefined : { type, checks: undefined }
}

/**
 * The type that ends a field or a declaration: `T`, or `T where c, …` when `where` renders checks
 * (ADR-0077).
 *
 * @since 4.0.0
 * @category reverse
 */
export const declarationType = (source: string, schema: string, node: Node, where?: Where): string | undefined => {
  const parts = typeParts(source, schema, node, where)
  if (parts === undefined) return undefined
  return parts.checks === undefined ? parts.type : `${parts.type} where ${parts.checks}`
}

/**
 * A struct/class field: `key: T` / `key?: T` (`optionalKey`) / `key?: T | undefined` (`optional`),
 * each followed by `where …` when `where` renders the checks of a `S.check(…)` (ADR-0077).
 *
 * @since 4.0.0
 * @category reverse
 */
export const fieldType = (
  source: string,
  schema: string,
  property: Node,
  where?: Where
): { readonly key: string; readonly optional: "" | "?"; readonly type: string } | undefined => {
  if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) return undefined
  const key = property.key.type === "Identifier"
    ? property.key.name
    : source.slice(property.key.start, property.key.end)
  const value: Node = property.value
  const render = (parts: { readonly type: string; readonly checks: string | undefined }, type = parts.type) =>
    parts.checks === undefined ? type : `${type} where ${parts.checks}`
  if (value.type === "CallExpression" && value.arguments.length === 1) {
    if (isMember(value.callee, schema, "optionalKey")) {
      const parts = typeParts(source, schema, value.arguments[0], where)
      return parts === undefined ? undefined : { key, optional: "?", type: render(parts) }
    }
    if (isMember(value.callee, schema, "optional")) {
      const parts = typeParts(source, schema, value.arguments[0], where)
      return parts === undefined ? undefined : { key, optional: "?", type: render(parts, `${parts.type} | undefined`) }
    }
  }
  const parts = typeParts(source, schema, value, where)
  return parts === undefined ? undefined : { key, optional: "", type: render(parts) }
}
