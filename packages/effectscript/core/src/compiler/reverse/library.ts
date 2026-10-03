/**
 * Library constructs back to EffectScript (ADR-0069…0072): `RpcGroup.make(Rpc.make(…), …)` →
 * `rpc`, and `X.toLayer(Effect.gen(… return X.of({ … }) …))` → `impl X { … }`.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, isCanonicalString, type ReverseCtx, within } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"
import { inFrame } from "./resources.ts"
import { fieldType, schemaToType } from "./types.ts"

const typeOf = (ctx: ReverseCtx, node: Node): string | undefined =>
  ctx.schema === undefined ? undefined : schemaToType(ctx.source, ctx.schema, node)

/** `{ id: Schema.String, limit: Schema.optionalKey(…) }` → `id: string, limit?: number`. */
export const fieldsText = (ctx: ReverseCtx, node: Node): string | undefined => {
  if (node.type !== "ObjectExpression" || ctx.schema === undefined) return undefined
  const fields: Array<string> = []
  for (const property of node.properties as Array<Node>) {
    const field = fieldType(ctx.source, ctx.schema, property)
    if (field === undefined || property.key.type !== "Identifier") return undefined
    fields.push(`${field.key}${field.optional}: ${field.type}`)
  }
  return fields.join(", ")
}

/** `Schema.Union([A, B])` → `A | B`; a schema → its type. */
export const errorText = (ctx: ReverseCtx, node: Node): string | undefined => {
  if (
    node.type === "CallExpression" && isMember(node.callee, ctx.schema, "Union") && node.arguments.length === 1 &&
    node.arguments[0].type === "ArrayExpression" && node.arguments[0].elements.length >= 2
  ) {
    const types = (node.arguments[0].elements as Array<Node | null>).map((
      e
    ) => (e === null ? undefined : typeOf(ctx, e)))
    return types.some((t) => t === undefined) ? undefined : types.join(" | ")
  }
  return typeOf(ctx, node)
}

/**
 * `Rpc.make("name"[, { payload, success, error, stream }])` → `name(fields): A throws E`, in the
 * forward order, or `undefined`.
 */
export const signatureLine = (ctx: ReverseCtx, rpc: string, call: Node): string | undefined => {
  if (call.type !== "CallExpression" || !isMember(call.callee, rpc, "make") || call.arguments.length > 2) {
    return undefined
  }
  const [name, options]: Array<Node> = call.arguments
  if (!isCanonicalString(ctx, name) || !/^[A-Za-z_$][\w$]*$/.test(name.value)) return undefined
  let fields = ""
  let success: string | undefined
  let error: string | undefined
  let stream = false
  if (options !== undefined) {
    if (options.type !== "ObjectExpression" || options.properties.length === 0) return undefined
    const order = ["payload", "success", "error", "stream"]
    let stage = 0
    for (const property of options.properties as Array<Node>) {
      if (property.type !== "Property" || property.computed || property.method || property.key.type !== "Identifier") {
        return undefined
      }
      const index = order.indexOf(property.key.name)
      if (index < stage) return undefined
      stage = index + 1
      const value: Node = property.value
      if (property.key.name === "payload") {
        const text = fieldsText(ctx, value)
        if (text === undefined || text === "") return undefined
        fields = text
      } else if (property.key.name === "success") {
        success = typeOf(ctx, value)
        if (success === undefined) return undefined
      } else if (property.key.name === "error") {
        error = errorText(ctx, value)
        if (error === undefined) return undefined
      } else if (value.type === "Literal" && value.value === true && success !== undefined) stream = true
      else return undefined
    }
  }
  const result = success === undefined ? "" : `: ${stream ? `Stream<${success}>` : success}`
  return `${name.value}(${fields})${result}${error === undefined ? "" : ` throws ${error}`}`
}

/**
 * `const X = RpcGroup.make(Rpc.make(…), …)` → `rpc X { … }`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertRpcGroup = (ctx: ReverseCtx, statement: Node): boolean => {
  const rpc = importedLocal(ctx.analysis, "effect/rpc", "Rpc")
  const group = importedLocal(ctx.analysis, "effect/rpc", "RpcGroup")
  if (rpc === undefined || group === undefined || statement.kind !== "const" || statement.declarations.length !== 1) {
    return false
  }
  const declarator: Node = statement.declarations[0]
  const call: Node | null = declarator.init
  if (declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || call?.type !== "CallExpression") {
    return false
  }
  if (!isMember(call.callee, group, "make") || commentsIn(ctx, statement.start, statement.end).length > 0) return false
  const lines = (call.arguments as Array<Node>).map((c) => signatureLine(ctx, rpc, c))
  if (lines.some((l) => l === undefined)) return false
  const body = lines.length === 0 ? "" : `\n${lines.map((l) => `  ${l}`).join("\n")}\n`
  ctx.s.update(statement.start, statement.end, `rpc ${declarator.id.name} {${body}}`)
  return true
}

const returnsOf = (node: Node, out: Array<Node> = []): Array<Node> => {
  if (node.type === "ReturnStatement") out.push(node)
  if (/Function|Class/.test(node.type)) return out
  for (const child of children(node)) returnsOf(child, out)
  return out
}

/**
 * `X.toLayer(Effect.gen(function*() { … return X.of({ … }) }))` → `impl X { … }`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertGenericImpl = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  if (
    call.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.computed ||
    call.callee.object.type !== "Identifier" || call.callee.property.name !== "toLayer" || call.arguments.length !== 1
  ) {
    return false
  }
  const name: string = call.callee.object.name
  const gen: Node = call.arguments[0]
  if (gen.type !== "CallExpression" || gen.arguments.length !== 1) return false
  const shape = genShape(ctx, gen, call)
  if (shape === undefined || !("fn" in shape)) return false
  const body: Node = shape.fn.body
  if (
    ctx.source.slice(call.start, body.start) !== `${name}.toLayer(${ctx.effect}.gen(function*() ` ||
    ctx.source.slice(body.end, call.end) !== "))"
  ) {
    return false
  }
  const unwrap: Array<Node> = []
  for (const statement of returnsOf(body)) {
    const argument: Node | null = statement.argument
    if (argument === null) continue
    if (
      argument.type !== "CallExpression" || argument.arguments.length !== 1 || !isMember(argument.callee, name, "of")
    ) {
      return false
    }
    unwrap.push(argument)
  }
  if (unwrap.length === 0) return false
  ctx.s.update(call.start, body.start, `impl ${name} `)
  ctx.s.remove(body.end, call.end)
  for (const of of unwrap) {
    ctx.s.remove(of.start, of.arguments[0].start)
    ctx.s.remove(of.arguments[0].end, of.end)
  }
  within(ctx, "Effect", () => inFrame(ctx, true, () => visit(body, shape.fn, true)), name)
  return true
}
