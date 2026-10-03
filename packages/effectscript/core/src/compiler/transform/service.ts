/**
 * `service` → `Context.Service` class with `static readonly layer…` and static accessors.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withNamespace } from "../context.ts"
import { diagnosticError, diagnosticWarning } from "../diagnostics.ts"
import { fresh, ref } from "../names.ts"
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
    head.efxLayerConstructor = true
    ctx.s.appendRight(head.start, `${ref(ctx, "effect", "Layer")}.effect(${name}, `)
    ctx.s.prependLeft(head.end, ")")
    wrapReturnedObjects(ctx, head, name)
  } else if (head.type === "ObjectExpression") {
    ctx.s.appendRight(head.start, `${ref(ctx, "effect", "Layer")}.succeed(${name}, ${name}.of(`)
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

const isDefaultMember = (member: Node): boolean =>
  member.type === "PropertyDefinition" && member.efxLayer === undefined && member.static !== true &&
  !member.computed && member.key?.name === "default"

/** The line range of a member, from its line's start to the end of its line. */
const memberLine = (ctx: Ctx, member: Node): readonly [number, number] => {
  const start = ctx.source.lastIndexOf("\n", member.start - 1) + 1
  const newline = ctx.source.indexOf("\n", member.end)
  return [
    /^\s*$/.test(ctx.source.slice(start, member.start)) ? start : member.start,
    newline === -1 ? member.end : newline + 1
  ]
}

/**
 * A service with a `default` (ADR-0066): an interface for its shape, a `Context.Reference` whose
 * default is the `default` value, and the layers and accessors assigned onto the reference. Code
 * that uses it without providing a layer gets the default, so it is never a requirement.
 */
const referenceService = (node: Node, parent: Node | undefined, ctx: Ctx, defaultMember: Node): boolean => {
  const name: string = node.id.name
  const key = node.efxServiceKey?.value ?? serviceKey(ctx.options, name)
  const exported = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const reference = fresh(ctx, `${name}Reference`)
  const Context = ref(ctx, "effect", "Context")
  const Layer = ref(ctx, "effect", "Layer")
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "interface")
  if (node.id.end < node.body.start) ctx.s.update(node.id.end, node.body.start, " ")
  const value: Node = defaultMember.value
  const head = pipelineHead(value)
  if (head.type === "EffectBlock" || value.type === "PipelineExpression") {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX4004",
        "A service's default is a plain value: it is built without running effects",
        defaultMember.start,
        defaultMember.end,
        "build it with effects in a `layer = effect { … }` instead"
      )
    )
    return true
  }
  const layers: Array<Node> = []
  const effects: Array<Node> = []
  for (const member of node.body.body as Array<Node>) {
    if (member === defaultMember) continue
    if (isLayerMember(member)) layers.push(member)
    else if (isSignature(member) && member.efx !== undefined) {
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
      rewriteReturnType(ctx, member.value.returnType, "Effect")
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
          "services hold `effect` members, plain signatures, `layer` members and a `default`"
        )
      )
    }
  }
  // the values are transformed in place first, then moved below the interface with their framing
  const previous = ctx.service
  ctx.service = name
  // a default is a plain value, resolved like any other expression (no `Layer` namespace)
  walk(value, defaultMember, ctx)
  for (const member of layers) {
    const layerHead = pipelineHead(member.value)
    if (layerHead.type === "EffectBlock") {
      layerHead.efxLayerConstructor = true
      ctx.s.appendRight(layerHead.start, `${Layer}.effect(${reference}, `)
      ctx.s.prependLeft(layerHead.end, ")")
      wrapReturnedObjects(ctx, layerHead, reference)
    } else if (layerHead.type === "ObjectExpression") {
      ctx.s.appendRight(layerHead.start, `${Layer}.succeed(${reference}, ${reference}.of(`)
      ctx.s.prependLeft(layerHead.end, "))")
    }
    withNamespace(ctx, "Layer", () => walk(member.value, member, ctx))
  }
  ctx.service = previous
  const end: number = node.end
  const object = value.type === "ObjectExpression"
  ctx.s.appendLeft(
    end,
    `\nconst ${reference} = ${Context}.Reference<${name}>(${JSON.stringify(key)}, {\n  defaultValue: () => ${
      object ? "(" : ""
    }`
  )
  ctx.s.move(value.start, value.end, end)
  ctx.s.appendLeft(value.end, `${object ? ")" : ""}\n})\n${exported}const ${name} = Object.assign(${reference}, {`)
  const entries: Array<string> = []
  layers.forEach((member) => {
    ctx.s.prependRight(member.value.start, `\n  ${layerName(member)}: `)
    ctx.s.move(member.value.start, member.value.end, end)
    ctx.s.appendLeft(member.value.end, ",")
  })
  for (const member of effects) {
    entries.push(accessor(ctx, reference, member).replace(/^  static readonly (\w+) = /, "  $1: ").replace(/\n$/, ""))
  }
  ctx.s.appendRight(end, `${entries.length > 0 ? `\n${entries.join(",\n")}` : ""}\n})`)
  // the members' lines leave the interface
  for (const member of [defaultMember, ...layers]) {
    let [start, stop] = memberLine(ctx, member)
    // blank lines before a member leave with it
    while (start > node.body.start + 1) {
      const previousLine = ctx.source.lastIndexOf("\n", start - 2) + 1
      if (!/^[ \t]*\n$/.test(ctx.source.slice(previousLine, start))) break
      start = previousLine
    }
    ctx.s.remove(start, member.value.start)
    ctx.s.remove(member.value.end, stop)
  }
  return true
}

const service: Handler = (node, parent, ctx) => {
  if (node.efxKind !== "service") return
  const defaultMember = (node.body.body as Array<Node>).find(isDefaultMember)
  if (defaultMember !== undefined) return referenceService(node, parent, ctx, defaultMember)
  const name: string = node.id.name
  const key = node.efxServiceKey?.value ?? serviceKey(ctx.options, name)
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "class")
  ctx.s.update(node.id.end, node.body.start, ` extends ${ref(ctx, "effect", "Context")}.Service<${name}, `)

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
      rewriteReturnType(ctx, member.value.returnType, "Effect")
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
