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

const unwrapExport = (top: Node | undefined): { readonly statement: Node | undefined; readonly exported: boolean } =>
  top?.type === "ExportNamedDeclaration" && top.declaration !== null
    ? { statement: top.declaration, exported: true }
    : { statement: top, exported: false }

/** `const <name> = <init>`, alone. */
const constOf = (statement: Node | undefined): Node | undefined =>
  statement?.type === "VariableDeclaration" && statement.kind === "const" && statement.declarations.length === 1 &&
    statement.declarations[0].id.type === "Identifier" && !statement.declarations[0].id.typeAnnotation
    ? statement.declarations[0]
    : undefined

/**
 * A service with a default (ADR-0066): `interface N { … }`, `const R = Context.Reference<N>("key", {
 * defaultValue: () => (…) })` and `const N = Object.assign(R, { layer…, accessors })` → `service N {
 * …; default = …; layer … }`. Returns how many statements it consumed.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertReferenceService = (
  ctx: ReverseCtx,
  body: ReadonlyArray<Node>,
  index: number,
  visit: Visit
): number => {
  const context = importedLocal(ctx.analysis, "effect", "Context")
  const [first, second, third] = [body[index], body[index + 1], body[index + 2]]
  const { exported, statement: iface } = unwrapExport(first)
  if (
    context === undefined || iface?.type !== "TSInterfaceDeclaration" || iface.typeParameters || iface.extends?.length
  ) {
    return 0
  }
  const name: string = iface.id.name
  const referenceDeclarator = second?.type === "VariableDeclaration" ? constOf(second) : undefined
  const assign = unwrapExport(third)
  const assignDeclarator = constOf(assign.statement)
  if (referenceDeclarator === undefined || assignDeclarator === undefined || assign.exported !== exported) return 0
  const reference: string = referenceDeclarator.id.name
  const make: Node = referenceDeclarator.init
  const typeArgs: Array<Node> = (make?.typeArguments ?? make?.typeParameters)?.params ?? []
  const [key, options]: Array<Node> = make?.arguments ?? []
  if (
    make?.type !== "CallExpression" || !isMember(make.callee, context, "Reference") || make.arguments.length !== 2 ||
    typeArgs.length !== 1 || slice(ctx, typeArgs[0]!) !== name || key?.type !== "Literal" ||
    typeof key.value !== "string" || options?.type !== "ObjectExpression" || options.properties.length !== 1
  ) {
    return 0
  }
  const defaultProperty: Node = options.properties[0]
  const thunk: Node = defaultProperty.value
  if (
    defaultProperty.type !== "Property" || defaultProperty.key?.name !== "defaultValue" ||
    thunk?.type !== "ArrowFunctionExpression" || thunk.params.length > 0 || thunk.body.type === "BlockStatement"
  ) {
    return 0
  }
  const value: Node = thunk.body
  const parenthesized = value.type === "ObjectExpression"
  const header = `const ${reference} = ${context}.Reference<${name}>(${
    JSON.stringify(key.value)
  }, {\n  defaultValue: () => ${parenthesized ? "(" : ""}`
  if (
    assignDeclarator.id.name !== name || ctx.source.slice(second.start, value.start) !== header ||
    ctx.source.slice(value.end, second.end) !== `${parenthesized ? ")" : ""}\n})`
  ) {
    return 0
  }
  const call: Node = assignDeclarator.init
  const statics: Node | undefined = call?.arguments?.[1]
  if (
    call?.type !== "CallExpression" || call.callee.type !== "MemberExpression" ||
    slice(ctx, call.callee) !== "Object.assign" || call.arguments.length !== 2 ||
    slice(ctx, call.arguments[0]) !== reference ||
    statics?.type !== "ObjectExpression"
  ) {
    return 0
  }
  if (ctx.source.slice(iface.end, second.start) !== "\n" || ctx.source.slice(second.end, third.start) !== "\n") return 0
  if (commentsIn(ctx, iface.body.end - 1, third.end).length > 0) return 0
  // the static object: layers, then one accessor per effect member, as generated
  const layers: Array<Layer> = []
  const accessors = new Map<string, Node>()
  for (const property of statics.properties as Array<Node>) {
    if (property.type !== "Property" || property.computed || property.shorthand || property.key.type !== "Identifier") {
      return 0
    }
    const head = layerHead(property.key.name)
    if (head !== undefined && accessors.size === 0) layers.push({ member: property, head })
    else accessors.set(property.key.name, property)
  }
  const members: Array<Node> = iface.body.body
  const effects: Array<Node> = []
  for (const signature of members) {
    if (
      signature.type !== "TSMethodSignature" || signature.kind !== "method" || signature.computed ||
      signature.key.type !== "Identifier" || !returnsEffect(ctx, signature) ||
      reservedStatics.has(signature.key.name) ||
      returnTypeProblem(ctx, returnTypeOf(signature), "Effect") !== undefined
    ) {
      continue
    }
    const accessor = accessors.get(signature.key.name)
    const expected = accessorFor(ctx, reference, signature).replace(/^static readonly (\w+) = /, "$1: ")
    if (accessor === undefined || slice(ctx, accessor) !== expected) return 0
    effects.push(signature)
    accessors.delete(signature.key.name)
  }
  if (accessors.size > 0) return 0
  // the generated layout: `{` then `\n  layerX: value,` lines, then `\n  accessor` lines joined by `,`
  let expectedText = "{"
  for (const layer of layers) expectedText += `\n  ${layer.member.key.name}: ${slice(ctx, layer.member.value)},`
  const accessorTexts = (statics.properties as Array<Node>).filter((p) => !layers.some((l) => l.member === p))
  if (accessorTexts.length > 0) expectedText += `\n${accessorTexts.map((p) => `  ${slice(ctx, p)}`).join(",\n")}`
  if (slice(ctx, statics) !== `${expectedText}\n}` || ctx.source.slice(statics.end, third.end) !== ")") return 0
  const layerPlans = layers.map((layer) => layerPlan(ctx, reference, layer.member.value))
  if (layerPlans.some((plan) => plan === undefined)) return 0

  // rewrite: `interface N {` → `service N [as "key"] {`
  const keyword = ctx.source.indexOf("interface", iface.start)
  const as = key.value === serviceKey(ctx.options, name) ? "" : ` as ${JSON.stringify(key.value)}`
  ctx.s.update(keyword, iface.id.end, `service ${name}${as}`)
  for (const signature of effects) {
    ctx.s.appendLeft(signature.start, "effect ")
    convertReturnType(ctx, returnTypeOf(signature), "Effect")
  }
  // the default and the layers move back into the body, before its `}`
  const close = iface.body.end - 1
  ctx.s.appendLeft(close, "\n  default = ")
  ctx.s.move(value.start, value.end, close)
  ctx.s.appendLeft(value.end, "\n")
  ctx.s.remove(iface.end, value.start)
  let previous = value.end
  layers.forEach((layer) => {
    const layerValue: Node = layer.member.value
    ctx.s.remove(previous, layerValue.start)
    ctx.s.prependRight(layerValue.start, `\n  ${layer.head} = `)
    ctx.s.move(layerValue.start, layerValue.end, close)
    ctx.s.appendLeft(layerValue.end, "\n")
    previous = layerValue.end
  })
  ctx.s.remove(previous, third.end)
  within(ctx, "Effect", () => visit(value, thunk, false), name)
  layers.forEach((_, i) => layerPlans[i]!(visit))
  return 3
}
