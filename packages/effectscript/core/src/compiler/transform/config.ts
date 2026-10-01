/**
 * `config Name { field: Type [= default] }` → `const Name = Config.all({ … })` (§4.14).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

const named = new Set([
  "Int",
  "Finite",
  "Port",
  "LogLevel",
  "Redacted",
  "Duration",
  "URL",
  "Date",
  "NonEmptyString"
])
const keywords: Record<string, string> = {
  TSStringKeyword: "String",
  TSNumberKeyword: "Number",
  TSBooleanKeyword: "Boolean"
}

/** `databaseUrl` → `DATABASE_URL`. */
const screamingSnake = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toUpperCase()

/** The `Config` constructor call for a field type, or `undefined` when there is none. */
const configFor = (ctx: Ctx, type: Node, key: string): string | undefined => {
  const C = ref(ctx, "effect", "Config")
  const name = JSON.stringify(key)
  const slice = (n: Node) => ctx.source.slice(n.start, n.end)
  const keyword = keywords[type.type]
  if (keyword !== undefined) return `${C}.${keyword}(${name})`
  if (type.type === "TSLiteralType") return `${C}.Literal(${slice(type.literal)}, ${name})`
  if (type.type === "TSUnionType" && type.types.every((t: Node) => t.type === "TSLiteralType")) {
    return `${C}.Literals([${type.types.map((t: Node) => slice(t.literal)).join(", ")}], ${name})`
  }
  if (type.type === "TSTypeReference" && type.typeName.type === "Identifier" && type.typeArguments === undefined) {
    const id: string = type.typeName.name
    return named.has(id) ? `${C}.${id}(${name})` : `${C}.schema(${id}, ${name})`
  }
  return undefined
}

const configDeclaration: Handler = (node, _parent, ctx) => {
  if (node.efxKind !== "config") return
  const C = ref(ctx, "effect", "Config")
  const fields: Array<Node> = node.body.body
  ctx.s.update(node.efxKeyword.start, node.body.start + 1, `const ${node.id.name} = ${C}.all({`)
  fields.forEach((field, i) => {
    const type: Node | undefined = field.typeAnnotation?.typeAnnotation
    if (field.type !== "PropertyDefinition" || field.computed || field.static || type === undefined) {
      ctx.diagnostics.push(
        diagnosticError("EFX3010", "A `config` field needs a name and a type", field.start, field.end)
      )
      return
    }
    const key: string = field.key.name
    let value = configFor(ctx, type, screamingSnake(key))
    if (value === undefined) {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX3010",
          "This type has no Config form",
          type.start,
          type.end,
          "use a primitive, a literal union, a Config name (Port, Redacted, …) or a schema"
        )
      )
      value = `${C}.String(${JSON.stringify(screamingSnake(key))})`
    }
    if (field.optional === true) value = `${C}.option(${value})`
    const last = i === fields.length - 1
    const separator = last ? "" : ","
    const endsWithSemicolon = ctx.source[field.end - 1] === ";"
    const fieldEnd = endsWithSemicolon ? field.end - 1 : field.end
    if (field.value !== null && field.value !== undefined) {
      ctx.s.update(field.key.start, field.value.start, `${key}: ${value}.pipe(${C}.withDefault(`)
      withNamespace(ctx, "Effect", () => walk(field.value, field, ctx))
      ctx.s.appendLeft(field.value.end, `))${separator}`)
      if (endsWithSemicolon) ctx.s.remove(fieldEnd, field.end)
    } else {
      ctx.s.update(field.key.start, fieldEnd, `${key}: ${value}${separator}`)
      if (endsWithSemicolon) ctx.s.remove(fieldEnd, field.end)
    }
  })
  ctx.s.update(node.body.end - 1, node.body.end, "})")
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const configHandlers: HandlerGroup = {
  ClassDeclaration: configDeclaration
}
