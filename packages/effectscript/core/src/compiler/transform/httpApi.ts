/**
 * `group` and `api` declarations → `HttpApiGroup` / `HttpApi` classes (§4.14).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { ref } from "../names.ts"
import { optionalField, typeToSchema } from "../schema/mapping.ts"
import type { HandlerGroup } from "./registry.ts"

const module = "effect/http-api"

/** `UsersApi` → `"users"`: strip a trailing `Api`/`Group`, then camelCase. */
export const defaultIdentifier = (name: string): string => {
  const stripped = name.replace(/(Api|Group)$/, "") || name
  return stripped[0]!.toLowerCase() + stripped.slice(1)
}

const identifierText = (ctx: Ctx, node: Node): string =>
  node.identifier === null
    ? JSON.stringify(defaultIdentifier(node.id.name))
    : ctx.source.slice(node.identifier.start, node.identifier.end)

/** A section type: a type literal becomes a field map, anything else a schema. */
const sectionSchema = (ctx: Ctx, type: Node): string => {
  if (type.type !== "TSTypeLiteral") return typeToSchema(ctx, type)
  const fields = (type.members as Array<Node>).map((member) => {
    const key = member.key.type === "Identifier" ? member.key.name : ctx.source.slice(member.key.start, member.key.end)
    const fieldType: Node = member.typeAnnotation.typeAnnotation
    return `${key}: ${member.optional === true ? optionalField(ctx, fieldType) : typeToSchema(ctx, fieldType)}`
  })
  return `{ ${fields.join(", ")} }`
}

const errorSchema = (ctx: Ctx, type: Node): string =>
  type.type === "TSUnionType"
    ? `[${type.types.map((t: Node) => typeToSchema(ctx, t)).join(", ")}]`
    : typeToSchema(ctx, type)

const endpoint = (ctx: Ctx, line: Node): string => {
  const options: Array<string> = []
  for (const section of line.sections as Array<Node>) {
    options.push(`${section.key.name}: ${sectionSchema(ctx, section.annotation)}`)
  }
  if (line.success !== null) options.push(`success: ${typeToSchema(ctx, line.success)}`)
  if (line.error !== null) options.push(`error: ${errorSchema(ctx, line.error)}`)
  const method = line.method === "del" ? "delete" : line.method
  const path = ctx.source.slice(line.path.start, line.path.end)
  const args = [JSON.stringify(line.name.name), path, ...(options.length > 0 ? [`{ ${options.join(", ")} }`] : [])]
  return `${ref(ctx, module, "HttpApiEndpoint")}.${method}(${args.join(", ")})`
}

const groupDeclaration: Handler = (node, _parent, ctx) => {
  const endpoints = (node.endpoints as Array<Node>).map((line) => endpoint(ctx, line))
  const middlewares = (node.middlewares as Array<Node>)
    .map((m) => `.middleware(${ctx.source.slice(m.start, m.end)})`)
    .join("")
  const add = endpoints.length === 0 ? "" : `.add(\n  ${endpoints.join(",\n  ")}\n)`
  ctx.s.update(
    node.start,
    node.end,
    `class ${node.id.name} extends ${ref(ctx, module, "HttpApiGroup")}.make(${
      identifierText(ctx, node)
    })${add}${middlewares} {}`
  )
  return true
}

const apiDeclaration: Handler = (node, _parent, ctx) => {
  const groups = (node.groups as Array<Node>).map((g) => ctx.source.slice(g.start, g.end)).join(", ")
  ctx.s.update(
    node.start,
    node.end,
    `class ${node.id.name} extends ${ref(ctx, module, "HttpApi")}.make(${identifierText(ctx, node)}).add(${groups}) {}`
  )
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const httpApiHandlers: HandlerGroup = {
  GroupDeclaration: groupDeclaration,
  ApiDeclaration: apiDeclaration
}
