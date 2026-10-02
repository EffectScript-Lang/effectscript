/**
 * `class S extends Context.Service<S, { … }>()("key") { static … }` → `service S [as "key"] { … }`
 * (spec §4.8): the inverse of `transform/service.ts`. The class must be exactly what the forward
 * compiler produces from some `service`: signatures in the type literal, `static readonly layer…`
 * members, and the generated accessors at the end.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { serviceKey } from "../serviceKey.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import {
  commaToPipe,
  commentsIn,
  note,
  removeKeepingComments,
  replaceKeepingComments,
  type ReverseCtx,
  separatorComma,
  slice,
  within
} from "./context.ts"
import { convertReturnType, returnTypeProblem } from "./effects.ts"
import { importedLocal, isMember } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { inFrame } from "./resources.ts"

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

/** The forward `accessor` text for a signature, without indentation and line break. */
const accessorFor = (ctx: ReverseCtx, name: string, signature: Node): string => {
  const key: string = signature.key.name
  const typeParameters = signature.typeParameters ? slice(ctx, signature.typeParameters) : ""
  const params: Array<string> = []
  const args: Array<string> = []
  const annotation = (node: Node): string => (node.typeAnnotation ? slice(ctx, node.typeAnnotation) : "")
  ;((signature.params ?? signature.parameters) as Array<Node>).forEach((p, i) => {
    if (p.type === "Identifier") {
      params.push(slice(ctx, p))
      args.push(p.name)
    } else if (p.type === "RestElement") {
      const argName = p.argument.type === "Identifier" ? p.argument.name : `_a${i}`
      params.push(`...${argName}${annotation(p.argument)}${annotation(p)}`)
      args.push(`...${argName}`)
    } else if (p.type === "AssignmentPattern" && p.left.type === "Identifier") {
      params.push(slice(ctx, p))
      args.push(p.left.name)
    } else {
      const pattern = p.type === "AssignmentPattern" ? p.left : p
      params.push(`_a${i}${annotation(pattern)}${p.type === "AssignmentPattern" ? ` = ${slice(ctx, p.right)}` : ""}`)
      args.push(`_a${i}`)
    }
  })
  return `static readonly ${key} = ${typeParameters}(${params.join(", ")}) => ${name}.use((_) => _.${key}(${
    args.join(", ")
  }))`
}

/** acorn-typescript puts a method signature's return type in `typeAnnotation`. */
const returnTypeOf = (signature: Node): Node | undefined => signature.returnType ?? signature.typeAnnotation

const returnsEffect = (ctx: ReverseCtx, signature: Node): boolean => {
  const type: Node | undefined = returnTypeOf(signature)?.typeAnnotation
  return type?.type === "TSTypeReference" && type.typeName.type === "TSQualifiedName" &&
    type.typeName.left.type === "Identifier" && type.typeName.left.name === ctx.effect &&
    type.typeName.right.name === "Effect"
}

interface Layer {
  readonly member: Node
  /** `layer` or `layer <name>` */
  readonly head: string
}

/** `layer` → `layer`, `layerTest` → `layer test` (the inverse of the forward `layerName`). */
const layerHead = (key: string): string | undefined => {
  if (key === "layer") return "layer"
  const rest = key.slice("layer".length)
  if (!key.startsWith("layer") || !/^[A-Z]/.test(rest)) return undefined
  return `layer ${rest[0]!.toLowerCase()}${rest.slice(1)}`
}

const lineStart = (ctx: ReverseCtx, offset: number): number => ctx.source.lastIndexOf("\n", offset - 1) + 1

/**
 * @since 4.0.0
 * @category reverse
 */
export const convertService = (ctx: ReverseCtx, cls: Node, visit: Visit): boolean => {
  const context = importedLocal(ctx.analysis, "effect", "Context")
  const outer: Node | null = cls.superClass
  if (context === undefined || cls.id === null || outer?.type !== "CallExpression") return false
  const inner: Node = outer.callee
  if (inner.type !== "CallExpression" || !isMember(inner.callee, context, "Service") || inner.arguments.length !== 0) {
    return false
  }
  const name: string = cls.id.name
  const [self, shape]: Array<Node> = (inner.typeArguments ?? inner.typeParameters)?.params ?? []
  const key: Node | undefined = outer.arguments[0]
  const explain = (message: string) => {
    note(ctx, cls, `\`${name}\` stays TypeScript: ${message}`)
    return false
  }
  if (
    self?.type !== "TSTypeReference" || self.typeName.type !== "Identifier" || self.typeName.name !== name ||
    shape?.type !== "TSTypeLiteral" || outer.arguments.length !== 1 || key?.type !== "Literal" ||
    typeof key.value !== "string"
  ) {
    return false
  }
  // type literal members are written with line breaks or `;`, as in a class body
  const members: Array<Node> = shape.members
  for (let i = 1; i < members.length; i++) {
    if (separatorComma(ctx, members[i - 1]!.end, members[i]!.start) !== -1) {
      return explain("its members are separated by commas")
    }
  }
  // class body: `static readonly layer…` members, then the generated accessors
  const statics: Array<Node> = cls.body.body
  const accessors = new Map<string, Node>()
  const layers: Array<Layer> = []
  for (const member of statics) {
    const text = slice(ctx, member)
    const head = member.type === "PropertyDefinition" && member.static && !member.computed &&
        member.key.type === "Identifier" && text.startsWith("static readonly ")
      ? layerHead(member.key.name)
      : undefined
    if (head !== undefined && member.typeAnnotation) {
      return explain(`its \`${member.key.name}\` layer has a type annotation`)
    }
    if (head !== undefined && member.value !== null && accessors.size === 0) {
      layers.push({ member, head })
    } else if (member.type === "PropertyDefinition" && member.static && member.key.type === "Identifier") {
      accessors.set(member.key.name, member)
    } else {
      return explain("it has a member a `service` can't hold")
    }
  }
  const effects = new Set<Node>()
  for (const signature of members) {
    if (
      signature.type !== "TSMethodSignature" || signature.kind !== "method" || signature.computed ||
      signature.key.type !== "Identifier"
    ) {
      continue
    }
    if (!returnsEffect(ctx, signature) || reservedStatics.has(signature.key.name)) continue
    if (returnTypeProblem(ctx, returnTypeOf(signature), "Effect") !== undefined) continue
    const accessor = accessors.get(signature.key.name)
    if (accessor === undefined) continue
    if (slice(ctx, accessor) !== accessorFor(ctx, name, signature)) {
      return explain(`its \`${signature.key.name}\` static isn't the generated accessor`)
    }
    effects.add(signature)
    accessors.delete(signature.key.name)
  }
  if (accessors.size > 0) return explain(`its \`${[...accessors.keys()][0]}\` static isn't a layer or an accessor`)
  const accessorNodes = statics.filter((m) => !layers.some((l) => l.member === m))
  // accessors are whole lines at the end, right before the closing brace
  for (const [i, accessor] of accessorNodes.entries()) {
    const next = accessorNodes[i + 1]?.start ?? cls.body.end - 1
    if (
      ctx.source.slice(lineStart(ctx, accessor.start), accessor.start) !== "  " ||
      ctx.source.slice(accessor.end, next) !== (next === cls.body.end - 1 ? "\n" : "\n  ")
    ) {
      return explain("its accessors aren't laid out as generated")
    }
  }
  // the text between the type literal and the class body
  const literalClose = shape.end - 1
  const bodyOpen = cls.body.start
  const keyText = JSON.stringify(key.value)
  if (ctx.source.slice(literalClose, bodyOpen + 1) !== `}>()(${keyText}) {`) {
    return explain("its declaration isn't laid out as generated")
  }
  if (commentsIn(ctx, cls.start, shape.start).length > 0) return false
  // layers must convert exactly
  const layerPlans = layers.map((layer) => layerPlan(ctx, name, layer.member.value))
  if (layerPlans.some((plan) => plan === undefined)) return explain("a layer isn't in a form a `service` produces")

  // rewrite: header
  const as = key.value === serviceKey(ctx.options, name) ? "" : ` as ${keyText}`
  ctx.s.update(cls.start, shape.start, `service ${name}${as} `)
  // members
  for (const signature of effects) {
    ctx.s.appendLeft(signature.start, "effect ")
    convertReturnType(ctx, returnTypeOf(signature), "Effect")
  }
  // `}>()("key") {` (+ its line break when it opens a line) → nothing; the class brace closes the service
  if (layers.length === 0 && accessorNodes.length === 0) {
    ctx.s.remove(shape.end, cls.end - 1)
    ctx.s.remove(cls.end - 1, cls.end)
  } else {
    const opensLine = lineStart(ctx, literalClose) === literalClose && ctx.source[bodyOpen + 1] === "\n"
    ctx.s.remove(literalClose, opensLine ? bodyOpen + 2 : bodyOpen + 1)
  }
  for (const accessor of accessorNodes) ctx.s.remove(lineStart(ctx, accessor.start), accessor.end + 1)
  layers.forEach((layer, i) => {
    replaceKeepingComments(ctx, layer.member.start, layer.member.value.start, `${layer.head} = `)
    layerPlans[i]!(visit)
  })
  return true
}

/**
 * How a layer value converts: `Layer.effect(S, Effect.gen(…))[.pipe(…)]` → `effect {…} [|> …]`,
 * `Layer.succeed(S, S.of({…}))` → `{…}`. Any other value is left as written.
 */
const layerPlan = (ctx: ReverseCtx, name: string, value: Node): ((visit: Visit) => void) | undefined => {
  const isOf = (node: Node | undefined): node is Node =>
    node?.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed &&
    node.callee.object.type === "Identifier" && node.callee.object.name === name &&
    node.callee.property.name === "of" && node.arguments.length === 1
  let head = value
  const pipe = value.type === "CallExpression" && value.callee.type === "MemberExpression" &&
      !value.callee.computed && value.callee.property.name === "pipe"
    ? value
    : undefined
  if (pipe !== undefined) head = pipe.callee.object
  if (head.type !== "CallExpression" || head.arguments.length !== 2) return () => {}
  const [service, inner]: Array<Node> = head.arguments
  if (service.type !== "Identifier" || service.name !== name) return () => {}
  // `Layer.effect(S, Effect.gen(…))`
  if (isMember(head.callee, ctx.layer, "effect")) {
    const shape = genShape(ctx, inner, head)
    if (shape === undefined || !("fn" in shape)) return undefined
    const returns = (shape.fn.body.body as Array<Node>).filter((s) => s.type === "ReturnStatement")
    // the forward compiler wraps every top-level `return { … }` in `S.of(…)`
    if (returns.some((r) => r.argument?.type === "ObjectExpression")) return undefined
    // every step must read the same after `|>`
    if (pipe !== undefined && !(pipe.arguments as Array<Node>).every((a) => isPlainStep(a))) return undefined
    return (visit) => {
      ctx.s.remove(head.start, inner.start)
      ctx.s.update(inner.start, shape.fn.body.start, "effect ")
      ctx.s.remove(shape.fn.body.end, head.end)
      for (const r of returns) {
        if (isOf(r.argument)) {
          ctx.s.remove(r.argument.start, r.argument.arguments[0].start)
          ctx.s.remove(r.argument.arguments[0].end, r.argument.end)
        }
      }
      within(ctx, "Effect", () => inFrame(ctx, true, () => visit(shape.fn.body, shape.fn, true)), name)
      if (pipe !== undefined) layerPipes(ctx, pipe, head, visit)
    }
  }
  // `Layer.succeed(S, S.of({ … }))`
  if (
    isMember(head.callee, ctx.layer, "succeed") && isOf(inner) && inner.arguments[0].type === "ObjectExpression" &&
    pipe === undefined
  ) {
    const object: Node = inner.arguments[0]
    return (visit) => {
      ctx.s.remove(head.start, object.start)
      ctx.s.remove(object.end, head.end)
      within(ctx, "Layer", () => visit(object, inner, false), name)
    }
  }
  return () => {}
}

/**
 * `.pipe(a, b)` after a layer constructor → `|> a |> b`, resolving in the `Layer` namespace.
 *
 * @since 4.0.0
 * @category reverse
 */
export const layerPipes = (
  ctx: ReverseCtx,
  pipe: Node,
  head: Node,
  visit: Visit,
  namespace: ReverseCtx["namespace"] = "Layer"
): void => {
  const args: Array<Node> = pipe.arguments
  const open = ctx.source.indexOf("(", pipe.callee.property.end)
  const dot = ctx.source.lastIndexOf(".", pipe.callee.property.start)
  const first = args[0]!
  if (ctx.source.slice(open + 1, first.start).includes("\n")) {
    ctx.s.remove(dot, open + 1)
    ctx.s.appendLeft(first.start, "|> ")
  } else {
    ctx.s.update(dot, first.start, " |> ")
  }
  let previous = head
  args.forEach((step, i) => {
    if (i > 0) commaToPipe(ctx, separatorComma(ctx, previous.end, step.start), step)
    within(ctx, namespace, () => visit(step, pipe, false))
    previous = step
  })
  removeKeepingComments(ctx, previous.end, pipe.end)
}
