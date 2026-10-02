/**
 * `HttpApiGroup` / `HttpApi` classes → `group` / `api` declarations (spec §4.14): the inverse of
 * `transform/httpApi.ts`. The forward compiler regenerates these declarations whole, so the reverse
 * writes their canonical layout.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { defaultIdentifier } from "../transform/httpApi.ts"
import { blocker, isGenerator } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, type ReverseCtx, slice, within } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"
import { inFrame } from "./resources.ts"
import { fieldType, schemaToType } from "./types.ts"

const module = "effect/http-api"
const methods: Record<string, string> = {
  get: "get",
  post: "post",
  put: "put",
  patch: "patch",
  delete: "del",
  head: "head",
  options: "options"
}
const sections = new Set(["params", "query", "payload", "headers"])

const isString = (node: Node | undefined): node is Node => node?.type === "Literal" && typeof node.value === "string"

/** The type a schema reverses to, `undefined` without one. */
const typeOf = (ctx: ReverseCtx, node: Node): string | undefined =>
  ctx.schema === undefined
    ? (node.type === "Identifier" ? node.name : undefined)
    : schemaToType(ctx.source, ctx.schema, node)

/** A section value: a field map → `{ a: T; b?: U }`, a schema → its type. */
const sectionType = (ctx: ReverseCtx, value: Node): string | undefined => {
  if (value.type !== "ObjectExpression") return typeOf(ctx, value)
  if (ctx.schema === undefined) return undefined
  const fields: Array<string> = []
  for (const property of value.properties as Array<Node>) {
    const field = fieldType(ctx.source, ctx.schema, property)
    if (field === undefined || property.key.type !== "Identifier") return undefined
    fields.push(`${field.key}${field.optional}: ${field.type}`)
  }
  return fields.length === 0 ? "{}" : `{ ${fields.join("; ")} }`
}

/** `HttpApiEndpoint.<m>("n", "/p"[, { … }])` → `<m> n "/p" [(sections)] [: S] [throws E]` */
const endpointLine = (ctx: ReverseCtx, endpoint: string, call: Node): string | undefined => {
  if (call.type !== "CallExpression" || call.callee.type !== "MemberExpression" || !isMember(call.callee, endpoint)) {
    return undefined
  }
  const method = methods[call.callee.property.name]
  const [name, path, options]: Array<Node> = call.arguments
  if (method === undefined || !isString(name) || !/^[A-Za-z_$][\w$]*$/.test(name.value) || !isString(path)) {
    return undefined
  }
  if (call.arguments.length > 3) return undefined
  let line = `${method} ${name.value} ${slice(ctx, path)}`
  if (options === undefined) return line
  if (options.type !== "ObjectExpression" || options.properties.length === 0) return undefined
  // the forward order: sections, then `success`, then `error`
  const parts: Array<string> = []
  let stage = 0
  for (const property of options.properties as Array<Node>) {
    if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) {
      return undefined
    }
    if (property.key.type !== "Identifier") return undefined
    const key: string = property.key.name
    const value: Node = property.value
    if (sections.has(key)) {
      if (stage > 0) return undefined
      const type = sectionType(ctx, value)
      if (type === undefined) return undefined
      parts.push(`${key}: ${type}`)
    } else if (key === "success" && stage < 1) {
      stage = 1
      const type = typeOf(ctx, value)
      if (type === undefined) return undefined
      if (parts.length > 0) line += ` (${parts.join(", ")})`
      parts.length = 0
      line += `: ${type}`
    } else if (key === "error" && stage < 2) {
      if (parts.length > 0) line += ` (${parts.join(", ")})`
      parts.length = 0
      stage = 2
      const types = value.type === "ArrayExpression"
        ? (value.elements as Array<Node>).map((e) => typeOf(ctx, e))
        : [typeOf(ctx, value)]
      if (types.some((t) => t === undefined) || (value.type === "ArrayExpression" && types.length < 2)) return undefined
      line += ` throws ${types.join(" | ")}`
    } else {
      return undefined
    }
  }
  if (parts.length > 0) line += ` (${parts.join(", ")})`
  return line
}

/** `make("id")`: the identifier text, empty when it is the forward default. */
const identifier = (name: string, id: Node | undefined): string | undefined => {
  if (!isString(id)) return undefined
  return id.value === defaultIdentifier(name) ? "" : ` ${JSON.stringify(id.value)}`
}

/**
 * Rewrites an `HttpApiGroup` or `HttpApi` class. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertHttpApi = (ctx: ReverseCtx, cls: Node): boolean => {
  if (cls.id === null || cls.body.body.length > 0 || cls.superClass === null || cls.typeParameters) return false
  if (cls.abstract === true || (cls.implements?.length ?? 0) > 0) return false
  if (commentsIn(ctx, cls.start, cls.end).length > 0) return false
  const name: string = cls.id.name
  const Group = importedLocal(ctx.analysis, module, "HttpApiGroup")
  const Api = importedLocal(ctx.analysis, module, "HttpApi")
  const endpoint = importedLocal(ctx.analysis, module, "HttpApiEndpoint")
  // peel `.middleware(M)` and `.add(…)` calls off `make(…)`
  let node: Node = cls.superClass
  const middlewares: Array<Node> = []
  while (
    node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed &&
    node.callee.property.name === "middleware" && node.arguments.length === 1
  ) {
    middlewares.unshift(node.arguments[0])
    node = node.callee.object
  }
  let added: Array<Node> | undefined
  if (
    node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed &&
    node.callee.property.name === "add"
  ) {
    added = node.arguments
    node = node.callee.object
  }
  if (node.type !== "CallExpression" || node.arguments.length !== 1) return false
  const id = identifier(name, node.arguments[0])
  if (id === undefined) return false
  let text: string
  if (isMember(node.callee, Group) && endpoint !== undefined) {
    const lines = (added ?? []).map((call) => endpointLine(ctx, endpoint, call))
    if (lines.some((l) => l === undefined) || (added !== undefined && added.length === 0)) return false
    const body = [...lines, ...middlewares.map((m) => `middleware ${slice(ctx, m)}`)]
    text = `group ${name}${id} {${body.length === 0 ? "" : `\n${body.map((l) => `  ${l}`).join("\n")}\n`}}`
  } else if (isMember(node.callee, Api) && added !== undefined && middlewares.length === 0) {
    text = `api ${name}${id} { ${added.map((g) => slice(ctx, g)).join(", ")} }`
  } else {
    return false
  }
  ctx.s.update(cls.start, cls.end, text)
  return true
}

interface ImplShape {
  readonly api: string
  readonly group: string
  readonly fn: Node
  readonly unwrap: ReadonlyArray<Node>
}

/** Return statements of a body, not crossing into nested functions or classes. */
const returnsOf = (node: Node, out: Array<Node> = []): Array<Node> => {
  if (node.type === "ReturnStatement") out.push(node)
  if (/Function|Class/.test(node.type)) return out
  for (const child of children(node)) returnsOf(child, out)
  return out
}

/**
 * `HttpApiBuilder.group(Api, "g", Effect.fn("Api.g")(function*(handlers) {…}))` with every return
 * `handlers.handleAll(…)`, or `undefined`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const implShape = (ctx: ReverseCtx, call: Node): ImplShape | undefined => {
  const builder = importedLocal(ctx.analysis, module, "HttpApiBuilder")
  if (call.type !== "CallExpression" || !isMember(call.callee, builder, "group") || call.arguments.length !== 3) {
    return undefined
  }
  const [api, group, handler]: Array<Node> = call.arguments
  if (api?.type !== "Identifier" || !isString(group) || !/^[A-Za-z_$][\w$]*$/.test(group.value)) return undefined
  if (handler?.type !== "CallExpression" || handler.arguments.length !== 1) return undefined
  const head: Node = handler.callee
  const span: Node | undefined = head.type === "CallExpression" ? head.arguments[0] : undefined
  if (head.type !== "CallExpression" || !isMember(head.callee, ctx.effect, "fn") || head.arguments.length !== 1) {
    return undefined
  }
  if (!isString(span) || span.value !== `${api.name}.${group.value}`) return undefined
  const fn: Node = handler.arguments[0]
  if (!isGenerator(fn) || fn.returnType || fn.params.length !== 1 || fn.params[0].type !== "Identifier") {
    return undefined
  }
  // the forward compiler names the parameter `unused(ctx, "handlers")`
  const handlers: string = fn.params[0].name
  if (handlers !== "handlers" || blocker(fn, "block", ctx) !== undefined) return undefined
  const unwrap: Array<Node> = []
  for (const statement of returnsOf(fn.body)) {
    const argument: Node | null = statement.argument
    if (argument === null) continue
    if (
      argument.type !== "CallExpression" || argument.arguments.length !== 1 ||
      !isMember(argument.callee, handlers, "handleAll")
    ) {
      return undefined
    }
    unwrap.push(argument)
  }
  // `handlers` may appear only in those calls: the parameter goes away
  let uses = 0
  const count = (node: Node): void => {
    if (node.type === "Identifier" && node.name === handlers) uses++
    for (const child of children(node)) count(child)
  }
  count(fn.body)
  return uses === unwrap.length ? { api: api.name, group: group.value, fn, unwrap } : undefined
}

/**
 * Rewrites an `impl` lowering. Returns false when `call` isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertImpl = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  const shape = implShape(ctx, call)
  if (shape === undefined || commentsIn(ctx, call.start, shape.fn.body.start).length > 0) return false
  if (ctx.source.slice(shape.fn.end, call.end) !== "))") return false
  ctx.s.update(call.start, shape.fn.body.start, `impl ${shape.api}.${shape.group} `)
  ctx.s.remove(shape.fn.body.end, call.end)
  for (const handleAll of shape.unwrap) {
    ctx.s.remove(handleAll.start, handleAll.arguments[0].start)
    ctx.s.remove(handleAll.arguments[0].end, handleAll.end)
  }
  // the layer owns the scope; members are named `Api.g.member`
  within(
    ctx,
    "Effect",
    () => inFrame(ctx, true, () => visit(shape.fn.body, shape.fn, true)),
    `${shape.api}.${shape.group}`
  )
  return true
}
