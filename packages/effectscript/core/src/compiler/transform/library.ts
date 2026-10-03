/**
 * Library constructs (ADR-0069…0072): `rpc` groups, `tool`/`toolkit`, `entity`, `workflow`, and
 * the generic `impl Name { … }` that builds their handler layers.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { ref } from "../names.ts"
import { optionalField, typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

/** A signature line's fields as struct fields: `{ id: Schema.String, limit: Schema.optionalKey(…) }`. */
export const signatureFields = (ctx: Ctx, line: Node): string =>
  `{ ${
    (line.fields as Array<Node>).map((field) =>
      `${field.key.name}: ${
        field.optional === true ? optionalField(ctx, field.annotation) : typeToSchema(ctx, field.annotation)
      }`
    ).join(", ")
  } }`

/** `A | B` → `Schema.Union([A, B])`; one error → its schema. */
export const errorUnion = (ctx: Ctx, type: Node): string =>
  type.type === "TSUnionType"
    ? `${ref(ctx, "effect", "Schema")}.Union([${type.types.map((t: Node) => typeToSchema(ctx, t)).join(", ")}])`
    : typeToSchema(ctx, type)

/** `Stream<A>` / `Stream<A, E>` as a return type: a streaming line. */
const streamOf = (type: Node | null): { readonly element: Node; readonly error: Node | undefined } | undefined => {
  const args: Array<Node> = (type?.typeArguments ?? type?.typeParameters)?.params ?? []
  return type?.type === "TSTypeReference" && type.typeName.type === "Identifier" && type.typeName.name === "Stream" &&
      args.length >= 1 && args.length <= 2
    ? { element: args[0]!, error: args[1] }
    : undefined
}

/** `name(…): A throws E` → `Rpc.make("name", { payload, success, error[, stream: true] })`. */
export const rpcOf = (ctx: Ctx, line: Node): string => {
  const options: Array<string> = []
  if (line.fields.length > 0) options.push(`payload: ${signatureFields(ctx, line)}`)
  const stream = streamOf(line.success)
  if (stream !== undefined) options.push(`success: ${typeToSchema(ctx, stream.element)}`)
  else if (line.success !== null) options.push(`success: ${typeToSchema(ctx, line.success)}`)
  const error: Node | undefined = line.error ?? stream?.error
  if (error !== undefined && error !== null) options.push(`error: ${errorUnion(ctx, error)}`)
  if (stream !== undefined) options.push("stream: true")
  const name = JSON.stringify(line.name.name)
  return `${ref(ctx, "effect/rpc", "Rpc")}.make(${name}${options.length > 0 ? `, { ${options.join(", ")} }` : ""})`
}

/** `rpc Name { lines }` → `const Name = RpcGroup.make(Rpc.make(…), …)` (ADR-0069). */
const rpcDeclaration: Handler = (node, _parent, ctx) => {
  const lines = (node.lines as Array<Node>).map((line) => `  ${rpcOf(ctx, line)}`)
  ctx.s.update(
    node.start,
    node.end,
    `const ${node.id.name} = ${ref(ctx, "effect/rpc", "RpcGroup")}.make(${
      lines.length > 0 ? `\n${lines.join(",\n")}\n` : ""
    })`
  )
  return true
}

/** Return statements of a body, not crossing into nested functions or classes. */
const bodyReturns = (node: Node, out: Array<Node> = []): Array<Node> => {
  if (node.type === "ReturnStatement") out.push(node)
  if (/Function|Class|EffectBlock/.test(node.type) || node.efx !== undefined) return out
  for (const child of children(node)) bodyReturns(child, out)
  return out
}

/**
 * `impl Name { … }` → `Name.toLayer(Effect.gen(function*() { … return Name.of({ … }) }))`, for any
 * value with `toLayer` and `of` (`RpcGroup`, `Toolkit`, `Entity`; ADR-0069). `effect` methods are
 * spanned `Name.method`; pipes after it apply to the layer.
 */
export const genericImpl: Handler = (node, _parent, ctx) => {
  const name: string = node.api.name
  const E = ref(ctx, "effect", "Effect")
  ctx.s.update(node.start, node.body.start, `${name}.toLayer(${E}.gen(function*() `)
  ctx.s.appendLeft(node.body.end, "))")
  for (const statement of bodyReturns(node.body)) {
    if (statement.argument === null) continue
    ctx.s.appendRight(statement.argument.start, `${name}.of(`)
    ctx.s.prependLeft(statement.argument.end, ")")
  }
  node.efxPipeable = true
  node.efxStepNamespace = "Layer"
  const previous = ctx.service
  ctx.service = name
  // the layer owns the scope: never `Effect.scoped`
  withEffect(ctx, makeFrame(node, "block", true), () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  ctx.service = previous
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const libraryHandlers: HandlerGroup = {
  RpcDeclaration: rpcDeclaration
}
