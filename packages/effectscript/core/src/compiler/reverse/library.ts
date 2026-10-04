/**
 * Library constructs back to EffectScript (ADR-0069…0072): `RpcGroup.make(Rpc.make(…), …)` →
 * `rpc`, and `X.toLayer(Effect.gen(… return X.of({ … }) …))` → `impl X { … }`.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { jsdocBefore } from "../transform/command.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, isCanonicalString, type ReverseCtx, slice, within } from "./context.ts"
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

const constDeclarator = (statement: Node): Node | undefined =>
  statement.kind === "const" && statement.declarations.length === 1 &&
    statement.declarations[0].id.type === "Identifier" && !statement.declarations[0].id.typeAnnotation &&
    statement.declarations[0].init?.type === "CallExpression"
    ? statement.declarations[0]
    : undefined

/**
 * `const X = Tool.make("X", { description, parameters: Schema.Struct({ … }), success, failure })`
 * → `tool X(fields): A throws E`, when the description is the doc comment above it.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertTool = (ctx: ReverseCtx, statement: Node, outerStart: number): boolean => {
  const tool = importedLocal(ctx.analysis, "effect/ai", "Tool")
  const declarator = constDeclarator(statement)
  if (tool === undefined || declarator === undefined || ctx.schema === undefined) return false
  const call: Node = declarator.init
  const [name, options]: Array<Node> = call.arguments
  if (!isMember(call.callee, tool, "make") || call.arguments.length > 2 || !isCanonicalString(ctx, name)) return false
  if (name.value !== declarator.id.name || commentsIn(ctx, statement.start, statement.end).length > 0) return false
  const doc = jsdocBefore(ctx.source, 0, outerStart)
  let description: string | undefined
  let fields = ""
  let success: string | undefined
  let failure: string | undefined
  if (options !== undefined) {
    if (options.type !== "ObjectExpression" || options.properties.length === 0) return false
    const order = ["description", "parameters", "success", "failure"]
    let stage = 0
    for (const property of options.properties as Array<Node>) {
      if (property.type !== "Property" || property.computed || property.method || property.key.type !== "Identifier") {
        return false
      }
      const index = order.indexOf(property.key.name)
      if (index < stage) return false
      stage = index + 1
      const value: Node = property.value
      if (property.key.name === "description") {
        if (!isCanonicalString(ctx, value)) return false
        description = value.value
      } else if (property.key.name === "parameters") {
        const struct = value.type === "CallExpression" && isMember(value.callee, ctx.schema, "Struct") &&
            value.arguments.length === 1
          ? fieldsText(ctx, value.arguments[0])
          : undefined
        if (struct === undefined || struct === "") return false
        fields = struct
      } else if (property.key.name === "success") {
        success = typeOf(ctx, value)
        if (success === undefined) return false
      } else {
        failure = errorText(ctx, value)
        if (failure === undefined) return false
      }
    }
  }
  // the description is the doc comment's text: both, or neither
  if ((doc?.description ?? "") !== (description ?? "")) return false
  ctx.s.update(
    statement.start,
    statement.end,
    `tool ${name.value}(${fields})${success === undefined ? "" : `: ${success}`}${
      failure === undefined ? "" : ` throws ${failure}`
    }`
  )
  return true
}

/**
 * `const X = Toolkit.make(A, B)` → `toolkit X { A, B }`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertToolkit = (ctx: ReverseCtx, statement: Node): boolean => {
  const toolkit = importedLocal(ctx.analysis, "effect/ai", "Toolkit")
  const declarator = constDeclarator(statement)
  if (toolkit === undefined || declarator === undefined) return false
  const call: Node = declarator.init
  if (!isMember(call.callee, toolkit, "make") || commentsIn(ctx, statement.start, statement.end).length > 0) {
    return false
  }
  const tools = call.arguments as Array<Node>
  if (tools.some((t) => t.type !== "Identifier" && t.type !== "MemberExpression")) return false
  ctx.s.update(
    statement.start,
    statement.end,
    `toolkit ${declarator.id.name} { ${tools.map((t) => ctx.source.slice(t.start, t.end)).join(", ")} }`
  )
  return true
}

/**
 * `const X = Entity.make("X", [Rpc.make(…), …])` → `entity X { … }`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertEntity = (ctx: ReverseCtx, statement: Node): boolean => {
  const rpc = importedLocal(ctx.analysis, "effect/rpc", "Rpc")
  const entity = importedLocal(ctx.analysis, "effect/cluster", "Entity")
  const declarator = constDeclarator(statement)
  if (rpc === undefined || entity === undefined || declarator === undefined) return false
  const call: Node = declarator.init
  const [type, protocol]: Array<Node> = call.arguments
  if (
    !isMember(call.callee, entity, "make") || call.arguments.length !== 2 || !isCanonicalString(ctx, type) ||
    type.value !== declarator.id.name || protocol?.type !== "ArrayExpression" ||
    commentsIn(ctx, statement.start, statement.end).length > 0
  ) {
    return false
  }
  const lines = (protocol.elements as Array<Node | null>).map((
    e
  ) => (e === null ? undefined : signatureLine(ctx, rpc, e)))
  if (lines.some((l) => l === undefined)) return false
  const body = lines.length === 0 ? "" : `\n${lines.map((l) => `  ${l}`).join("\n")}\n`
  ctx.s.update(statement.start, statement.end, `entity ${declarator.id.name} {${body}}`)
  return true
}

/** `{ a: …, b: … }` options as a map, when every property is a plain `key: value`; `undefined` otherwise. */
const optionsOf = (node: Node | undefined): Map<string, Node> | undefined => {
  if (node?.type !== "ObjectExpression") return undefined
  const options = new Map<string, Node>()
  for (const property of node.properties as Array<Node>) {
    if (property.type !== "Property" || property.computed || property.method || property.shorthand) return undefined
    if (property.key.type !== "Identifier") return undefined
    options.set(property.key.name, property.value)
  }
  return options
}

/** `success: A, error: E` options as `: A throws E`, or `undefined` when a schema has no type. */
const resultText = (ctx: ReverseCtx, options: Map<string, Node>): string | undefined => {
  const success = options.get("success")
  const error = options.get("error")
  const successType = success === undefined ? "" : typeOf(ctx, success)
  const errorType = error === undefined ? "" : errorText(ctx, error)
  if (successType === undefined || errorType === undefined) return undefined
  return `${successType === "" ? "" : `: ${successType}`}${errorType === "" ? "" : ` throws ${errorType}`}`
}

/** Line starts in `[from, to)` outside template literals and strings. */
const lineStarts = (ctx: ReverseCtx, root: Node, from: number, to: number): Array<number> => {
  const verbatim: Array<readonly [number, number]> = []
  const collect = (node: Node): void => {
    if (node.type === "TemplateLiteral" || (node.type === "Literal" && typeof node.value === "string")) {
      verbatim.push([node.start, node.end])
      return
    }
    for (const child of children(node)) collect(child)
  }
  collect(root)
  const starts: Array<number> = []
  for (let i = ctx.source.indexOf("\n", from); i !== -1 && i < to; i = ctx.source.indexOf("\n", i + 1)) {
    const start = i + 1
    if (start < to && !verbatim.some(([a, b]) => start > a && start < b)) starts.push(start)
  }
  return starts
}

/**
 * `const NWorkflow = Workflow.make("N", { payload, success, error, idempotencyKey: ({ … }) => K })`
 * and `const N = Object.assign(NWorkflow, { layer: NWorkflow.toLayer(Effect.fn("N")(function*({ … })
 * { … })) })` → `workflow N(fields): A throws E key K { … }`. Returns how many statements it
 * consumed.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertWorkflow = (
  ctx: ReverseCtx,
  body: ReadonlyArray<Node>,
  index: number,
  visit: Visit
): number => {
  const Workflow = importedLocal(ctx.analysis, "effect/workflow", "Workflow")
  const first = body[index]
  const second: Node | undefined = body[index + 1]
  if (Workflow === undefined || first?.type !== "VariableDeclaration" || second === undefined) return 0
  const exported = second.type === "ExportNamedDeclaration" && second.declaration !== null
  const assignment: Node = exported ? second.declaration : second
  const make = constDeclarator(first)
  const assign = assignment.type === "VariableDeclaration" ? constDeclarator(assignment) : undefined
  if (make === undefined || assign === undefined) return 0
  const call: Node = make.init
  const [tag, optionsNode]: Array<Node> = call.arguments
  if (!isMember(call.callee, Workflow, "make") || call.arguments.length !== 2 || !isCanonicalString(ctx, tag)) return 0
  const name: string = tag.value
  const workflow: string = make.id.name
  const options = optionsOf(optionsNode)
  if (assign.id.name !== name || options === undefined || commentsIn(ctx, first.start, second.end).length > 0) return 0
  const order = [...options.keys()]
  const expectedOrder = ["payload", ...["success", "error"].filter((k) => options.has(k)), "idempotencyKey"]
  if (order.join() !== expectedOrder.join()) return 0
  const fields = fieldsText(ctx, options.get("payload")!)
  const result = resultText(ctx, options)
  const key: Node = options.get("idempotencyKey")!
  if (fields === undefined || fields === "" || result === undefined || key.type !== "ArrowFunctionExpression") return 0
  const names = `{ ${(options.get("payload")!.properties as Array<Node>).map((p) => p.key.name).join(", ")} }`
  if (key.params.length !== 1 || ctx.source.slice(key.params[0].start, key.params[0].end) !== names) return 0
  if (key.body.type === "BlockStatement" || ctx.source.slice(key.start, key.body.start) !== `(${names}) => `) return 0
  // the second statement: the layer built from the body
  const object: Node = assign.init
  const layer = object.callee?.type === "MemberExpression" && slice(ctx, object.callee) === "Object.assign" &&
      object.arguments.length === 2 && slice(ctx, object.arguments[0]) === workflow
    ? optionsOf(object.arguments[1])?.get("layer")
    : undefined
  const fnCall: Node | undefined = layer?.type === "CallExpression" && isMember(layer.callee, workflow, "toLayer")
    ? layer.arguments[0]
    : undefined
  const fn: Node | undefined = fnCall?.type === "CallExpression" && fnCall.arguments.length === 1
    ? fnCall.arguments[0]
    : undefined
  if (fn === undefined || fn.type !== "FunctionExpression" || !fn.generator || fn.params.length !== 1) return 0
  const head = `${ctx.effect}.fn(${JSON.stringify(name)})(function*(${names}) `
  if (
    ctx.source.slice(key.body.end, fn.body.start) !==
      ` })\n${
        exported ? "export " : ""
      }const ${name} = Object.assign(${workflow}, {\n  layer: ${workflow}.toLayer(${head}` ||
    ctx.source.slice(fn.body.end, second.end) !== "))\n})"
  ) {
    return 0
  }
  ctx.s.update(
    first.start,
    key.body.start,
    `${exported ? "export " : ""}workflow ${name}(${fields})${result} key `
  )
  ctx.s.update(key.body.end, fn.body.start, " ")
  for (const start of lineStarts(ctx, fn.body, fn.body.start, fn.body.end)) {
    if (ctx.source.startsWith("  ", start)) ctx.s.remove(start, start + 2)
  }
  ctx.s.remove(fn.body.end, second.end)
  visit(key.body, key, false)
  within(ctx, "Effect", () => inFrame(ctx, false, () => visit(fn.body, fn, true)))
  return 2
}

/**
 * `Activity.make({ name: "x", success, error, execute: Effect.gen(function*() { … }) })` →
 * `activity x(): A throws E { … }`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertActivity = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  const Activity = importedLocal(ctx.analysis, "effect/workflow", "Activity")
  if (Activity === undefined || call.type !== "CallExpression" || !isMember(call.callee, Activity, "make")) return false
  const options = optionsOf(call.arguments[0])
  if (call.arguments.length !== 1 || options === undefined) return false
  const order = ["name", ...["success", "error"].filter((k) => options.has(k)), "execute"]
  if ([...options.keys()].join() !== order.join()) return false
  const name = options.get("name")!
  const gen = options.get("execute")!
  if (!isCanonicalString(ctx, name) || !/^[A-Za-z_$][\w$]*$/.test(name.value) || gen.type !== "CallExpression") {
    return false
  }
  const shape = genShape(ctx, gen, call)
  const result = resultText(ctx, options)
  if (shape === undefined || !("fn" in shape) || gen.arguments.length !== 1 || result === undefined) return false
  const body: Node = shape.fn.body
  if (
    ctx.source.slice(gen.start, body.start) !== `${ctx.effect}.gen(function*() ` ||
    ctx.source.slice(body.end, call.end) !== ") })" || commentsIn(ctx, call.start, body.start).length > 0
  ) {
    return false
  }
  ctx.s.update(call.start, body.start, `activity ${name.value}()${result} `)
  ctx.s.remove(body.end, call.end)
  within(ctx, "Effect", () => inFrame(ctx, false, () => visit(body, shape.fn, true)))
  return true
}
