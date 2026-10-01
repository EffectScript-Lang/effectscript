/**
 * `service` → `Context.Service` class with `static readonly layer…` and static accessors.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withNamespace } from "../context.ts"
import { diagnosticError, diagnosticWarning } from "../diagnostics.ts"
import { serviceKey } from "../serviceKey.ts"
import { walk } from "../walk.ts"
import { moveMembersAfter } from "./classLike.ts"
import type { HandlerGroup } from "./registry.ts"
import { rewriteReturnType } from "./returnType.ts"

const reservedStatics = new Set([
  "arguments",
  "caller",
  "context",
  "Identifier",
  "key",
  "length",
  "name",
  "of",
  "pipe",
  "prototype",
  "Service",
  "toJSON",
  "toString",
  "use",
  "useSync"
])

const pipelineHead = (node: Node): Node => (node.type === "PipelineExpression" ? pipelineHead(node.left) : node)

const layerName = (member: Node): string => {
  const key: string = member.key.name
  return member.efxLayer === undefined && key === "layer" ? "layer" : `layer${key[0]!.toUpperCase()}${key.slice(1)}`
}

// acorn-typescript: a bodiless class member is `MethodDefinition { value: TSDeclareMethod }`.
const isSignature = (member: Node): boolean =>
  member.type === "MethodDefinition" && member.value?.type === "TSDeclareMethod"

const isLayerMember = (member: Node): boolean =>
  member.type === "PropertyDefinition" && (member.efxLayer !== undefined || member.key?.name === "layer")

const wrapReturnedObjects = (ctx: Ctx, block: Node, name: string): void => {
  for (const statement of block.body.body as Array<Node>) {
    if (statement.type === "ReturnStatement" && statement.argument?.type === "ObjectExpression") {
      ctx.s.appendRight(statement.argument.start, `${name}.of(`)
      ctx.s.prependLeft(statement.argument.end, ")")
    }
  }
}

const rewriteLayer = (ctx: Ctx, member: Node, name: string): void => {
  ctx.s.update(member.start, member.value.start, `static readonly ${layerName(member)} = `)
  const head = pipelineHead(member.value)
  if (head.type === "EffectBlock") {
    ctx.imports.need("effect", "Layer")
    head.efxLayerConstructor = true
    ctx.s.appendRight(head.start, `Layer.effect(${name}, `)
    ctx.s.prependLeft(head.end, ")")
    wrapReturnedObjects(ctx, head, name)
  } else if (head.type === "ObjectExpression") {
    ctx.imports.need("effect", "Layer")
    ctx.s.appendRight(head.start, `Layer.succeed(${name}, ${name}.of(`)
    ctx.s.prependLeft(head.end, "))")
  }
  const previous = ctx.service
  ctx.service = name
  withNamespace(ctx, "Layer", () => walk(member.value, member, ctx))
  ctx.service = previous
}

const accessor = (ctx: Ctx, name: string, member: Node): string => {
  const key: string = member.key.name
  const signature: Node = member.value
  const typeParameters = signature.typeParameters
    ? ctx.s.slice(signature.typeParameters.start, signature.typeParameters.end)
    : ""
  const params: Array<string> = []
  const args: Array<string> = []
  ;(signature.params as Array<Node>).forEach((p, i) => {
    const annotation = (node: Node): string =>
      node.typeAnnotation ? ctx.s.slice(node.typeAnnotation.start, node.typeAnnotation.end) : ""
    if (p.type === "Identifier") {
      params.push(ctx.s.slice(p.start, p.end))
      args.push(p.name)
    } else if (p.type === "RestElement") {
      const argName = p.argument.type === "Identifier" ? p.argument.name : `_a${i}`
      params.push(`...${argName}${annotation(p.argument)}${annotation(p)}`)
      args.push(`...${argName}`)
    } else if (p.type === "AssignmentPattern" && p.left.type === "Identifier") {
      params.push(ctx.s.slice(p.start, p.end))
      args.push(p.left.name)
    } else {
      // destructuring patterns: forward a generated name, keeping the annotation
      const pattern = p.type === "AssignmentPattern" ? p.left : p
      params.push(
        `_a${i}${annotation(pattern)}${
          p.type === "AssignmentPattern" ? ` = ${ctx.s.slice(p.right.start, p.right.end)}` : ""
        }`
      )
      args.push(`_a${i}`)
    }
  })
  return `  static readonly ${key} = ${typeParameters}(${params.join(", ")}) => ${name}.use((_) => _.${key}(${
    args.join(", ")
  }))\n`
}

const service: Handler = (node, _parent, ctx) => {
  if (node.efxKind !== "service") return
  ctx.imports.need("effect", "Context")
  const name: string = node.id.name
  const key = node.efxServiceKey?.value ?? serviceKey(ctx.options, name)
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "class")
  ctx.s.update(node.id.end, node.body.start, ` extends Context.Service<${name}, `)

  const layers: Array<Node> = []
  const effects: Array<Node> = []
  for (const member of node.body.body as Array<Node>) {
    if (isLayerMember(member)) {
      layers.push(member)
    } else if (isSignature(member) && member.efx !== undefined) {
      if (member.value.returnType === undefined || member.value.returnType === null) {
        ctx.diagnostics.push(
          diagnosticError(
            "EFX4001",
            "`effect` members need a return type",
            member.start,
            member.end,
            "write `: void` for effects without a result"
          )
        )
        continue
      }
      ctx.s.remove(member.efx.keyword.start, member.key.start)
      rewriteReturnType(ctx, member.value.returnType, "Effect.Effect")
      for (const child of [...member.value.params, member.value.returnType]) walk(child, member.value, ctx)
      effects.push(member)
    } else if (
      isSignature(member) ||
      (member.type === "PropertyDefinition" && (member.value === null || member.value === undefined) &&
        member.static !== true)
    ) {
      walk(member, node.body, ctx)
    } else {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX4002",
          "Unsupported `service` member",
          member.start,
          member.end,
          "services hold `effect` members, plain signatures and `layer` members"
        )
      )
    }
  }

  let accessors = ""
  for (const member of effects) {
    if (reservedStatics.has(member.key.name)) {
      ctx.diagnostics.push(
        diagnosticWarning(
          "EFX4003",
          `No static accessor for \`${member.key.name}\`: the name clashes with a Context.Service static`,
          member.key.start,
          member.key.end
        )
      )
      continue
    }
    accessors += accessor(ctx, name, member)
  }
  moveMembersAfter(ctx, node.body, layers, `}>()(${JSON.stringify(key)})`, accessors)
  for (const member of layers) rewriteLayer(ctx, member, name)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const serviceHandlers: HandlerGroup = {
  ClassDeclaration: service
}
