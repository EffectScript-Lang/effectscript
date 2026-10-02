/**
 * `group` and `api` declarations → `HttpApiGroup` / `HttpApi` classes (§4.14).
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref, unused } from "../names.ts"
import { optionalField, typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"
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

/** Return statements of a body, not crossing into nested functions or classes. */
const implReturns = (node: Node, out: Array<Node> = []): Array<Node> => {
  if (node.type === "ReturnStatement") out.push(node)
  // a nested `effect { … }` returns from itself, not from the impl
  if (/Function|Class|EffectBlock/.test(node.type) || node.efx !== undefined) return out
  for (const child of children(node)) implReturns(child, out)
  return out
}

/** A section type: a type literal becomes a field map, anything else a schema. */
const sectionSchema = (ctx: Ctx, type: Node): string => {
  if (type.type !== "TSTypeLiteral") return typeToSchema(ctx, type)
  const fields = (type.members as Array<Node>).map((member) => {
    if (member.type !== "TSPropertySignature" || member.typeAnnotation === undefined) {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX9002",
          "Endpoint sections take named fields only",
          member.start,
          member.end,
          "write `name: Type` fields, or use a schema: `(query: MyQuery)`"
        )
      )
      return "_: Schema.Never"
    }
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
 * `impl Api.group { … }` → `HttpApiBuilder.group(Api, "group", Effect.fn("Api.group")(function*(handlers) { … }))`.
 * Top-level `return { … }` objects become `handlers.handleAll({ … })`; `effect` methods are spanned
 * `Api.group.method`; pipes resolve in the `Layer` namespace.
 */
const implExpression: Handler = (node, _parent, ctx) => {
  const api: string = node.api.name
  const group: string = node.group.name
  const handlers = unused(ctx, "handlers")
  const E = ref(ctx, "effect", "Effect")
  ctx.s.update(
    node.start,
    node.body.start,
    `${ref(ctx, module, "HttpApiBuilder")}.group(${api}, ${JSON.stringify(group)}, ${E}.fn(${
      JSON.stringify(`${api}.${group}`)
    })(function*(${handlers}) `
  )
  ctx.s.appendLeft(node.body.end, "))")
  // every return of the impl body hands its handlers to `handleAll` (review I2)
  for (const statement of implReturns(node.body)) {
    if (statement.argument === null) continue
    ctx.s.appendRight(statement.argument.start, `${handlers}.handleAll(`)
    ctx.s.prependLeft(statement.argument.end, ")")
  }
  node.efxPipeable = true
  node.efxStepNamespace = "Layer"
  const previous = ctx.service
  ctx.service = `${api}.${group}`
  // the layer owns the scope: never `Effect.scoped`
  withEffect(ctx, makeFrame(node, "block", true), () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  ctx.service = previous
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const httpApiHandlers: HandlerGroup = {
  ImplExpression: implExpression,
  GroupDeclaration: groupDeclaration,
  ApiDeclaration: apiDeclaration
}
