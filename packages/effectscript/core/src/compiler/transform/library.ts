/**
 * Library constructs (ADR-0069…0072): `rpc` groups, `tool`/`toolkit`, `entity`, `workflow`, and
 * the generic `impl Name { … }` that builds their handler layers.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { fresh, ref } from "../names.ts"
import { optionalField, typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"
import { jsdocBefore } from "./command.ts"
import { lineStartsToIndent } from "./effect.ts"
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
  // a stream's own error and the line's `throws` both fail the RPC (Plan 23 review)
  const errors = [stream?.error, line.error].filter((e): e is Node => e !== undefined && e !== null)
  if (errors.length === 1) options.push(`error: ${errorUnion(ctx, errors[0]!)}`)
  else if (errors.length === 2) {
    const members = errors.flatMap((e) => (e.type === "TSUnionType" ? e.types as Array<Node> : [e]))
    options.push(
      `error: ${ref(ctx, "effect", "Schema")}.Union([${members.map((t) => typeToSchema(ctx, t)).join(", ")}])`
    )
  }
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

/**
 * `entity Name { lines }` → `const Name = Entity.make("Name", [Rpc.make(…), …])` (ADR-0071). Its
 * handlers, written with `impl Name`, get each message's envelope (`{ payload }`).
 */
const entityDeclaration: Handler = (node, _parent, ctx) => {
  const lines = (node.lines as Array<Node>).map((line) => `  ${rpcOf(ctx, line)}`)
  ctx.s.update(
    node.start,
    node.end,
    `const ${node.id.name} = ${ref(ctx, "effect/cluster", "Entity")}.make(${JSON.stringify(node.id.name)}, [${
      lines.length > 0 ? `\n${lines.join(",\n")}\n` : ""
    }])`
  )
  return true
}

/**
 * `workflow Name(fields): A throws E key K { … }` → `const NameWorkflow = Workflow.make("Name", {
 * payload, success, error, idempotencyKey: ({ fields }) => K })` and `Name = Object.assign(…, {
 * layer: NameWorkflow.toLayer(Effect.fn("Name")(function*({ fields }) { … })) })` (ADR-0072): the
 * body is the workflow's layer, kept on it as a service keeps its layers.
 */
const workflowDeclaration: Handler = (node, parent, ctx) => {
  const line: Node = node.line
  const name: string = line.name.name
  const exported = parent?.type === "ExportNamedDeclaration"
  const workflow = fresh(ctx, `${name}Workflow`)
  const E = ref(ctx, "effect", "Effect")
  // only the fields the key or the body read: unused bindings would be errors under
  // `noUnusedParameters`, and a reserved word can't be one (Plan 23 review)
  const used = (node: Node): string => {
    const names = referencedNames(node)
    const read = (line.fields as Array<Node>).map((f) => f.key.name as string).filter((n) => names.has(n))
    return read.length === 0 ? "" : `{ ${read.join(", ")} }`
  }
  const keyFields = used(node.key)
  const bodyFields = used(node.body)
  checkActivities(ctx, node.body)
  const options = [`payload: ${signatureFields(ctx, line)}`]
  if (line.success !== null) options.push(`success: ${typeToSchema(ctx, line.success)}`)
  if (line.error !== null) options.push(`error: ${errorUnion(ctx, line.error)}`)
  // the workflow constant isn't exported: the `Object.assign` below is
  ctx.s.update(
    exported ? parent!.start : node.start,
    node.key.start,
    `const ${workflow} = ${ref(ctx, "effect/workflow", "Workflow")}.make(${JSON.stringify(name)}, { ${
      options.join(", ")
    }, idempotencyKey: (${keyFields}) => `
  )
  ctx.s.update(
    node.key.end,
    node.body.start,
    ` })\n${
      exported ? "export " : ""
    }const ${name} = Object.assign(${workflow}, {\n  layer: ${workflow}.toLayer(${E}.fn(${
      JSON.stringify(name)
    })(function*(${bodyFields}) `
  )
  for (const start of lineStartsToIndent(ctx, node.body, node.body.start, node.body.end)) {
    ctx.s.prependRight(start, "  ")
  }
  withEffect(ctx, undefined, () => walk(node.key, node, ctx))
  withEffect(ctx, makeFrame(node, "declaration"), () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  ctx.s.appendLeft(node.body.end, "))\n})")
  return true
}

/**
 * `activity name(): A throws E { … }` → `Activity.make({ name: "name", success, error, execute:
 * Effect.gen(function*() { … }) })` (ADR-0072): a durable step, awaited in a workflow.
 */
const activityExpression: Handler = (node, _parent, ctx) => {
  const options: Array<string> = []
  if (node.success !== null) options.push(`success: ${typeToSchema(ctx, node.success)}`)
  if (node.error !== null) options.push(`error: ${errorUnion(ctx, node.error)}`)
  const E = ref(ctx, "effect", "Effect")
  const rest = `${options.map((o) => `, ${o}`).join("")}, execute: ${E}.gen(function*() `
  const make = `${ref(ctx, "effect/workflow", "Activity")}.make({ name: `
  const key: Node | null = node.key
  if (key === null) ctx.s.update(node.start, node.body.start, `${make}${JSON.stringify(node.name.name)}${rest}`)
  else {
    // `activity send(id)` is named `send/${id}`: one recorded result per key (Plan 23 review)
    ctx.s.update(node.start, key.start, `${make}\`${node.name.name}/\${`)
    ctx.s.update(key.end, node.body.start, `}\`${rest}`)
    withEffect(ctx, undefined, () => walk(key, node, ctx))
  }
  withEffect(ctx, makeFrame(node, "block"), () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  ctx.s.appendLeft(node.body.end, ") })")
  return true
}

/**
 * `tool Name(fields): A throws E` → `const Name = Tool.make("Name", { description, parameters:
 * Schema.Struct({ … }), success, failure })` (ADR-0070). The doc comment above it is the
 * description the model reads.
 */
const toolDeclaration: Handler = (node, parent, ctx) => {
  const line: Node = node.line
  const options: Array<string> = []
  // the doc comment sits before `export`, when there is one
  const doc = jsdocBefore(ctx.source, 0, parent?.type === "ExportNamedDeclaration" ? parent.start : node.start)
  if (doc !== undefined && doc.description !== "") options.push(`description: ${JSON.stringify(doc.description)}`)
  if (line.fields.length > 0) {
    options.push(`parameters: ${ref(ctx, "effect", "Schema")}.Struct(${signatureFields(ctx, line)})`)
  }
  if (line.success !== null) options.push(`success: ${typeToSchema(ctx, line.success)}`)
  if (line.error !== null) options.push(`failure: ${errorUnion(ctx, line.error)}`)
  const name: string = line.name.name
  ctx.s.update(
    node.start,
    node.end,
    `const ${name} = ${ref(ctx, "effect/ai", "Tool")}.make(${JSON.stringify(name)}${
      options.length > 0 ? `, { ${options.join(", ")} }` : ""
    })`
  )
  return true
}

/** `toolkit Name { A, B }` → `const Name = Toolkit.make(A, B)` (ADR-0070). */
const toolkitDeclaration: Handler = (node, _parent, ctx) => {
  const tools = (node.tools as Array<Node>).map((t) => ctx.source.slice(t.start, t.end)).join(", ")
  ctx.s.update(node.start, node.end, `const ${node.id.name} = ${ref(ctx, "effect/ai", "Toolkit")}.make(${tools})`)
  return true
}

/** Identifier names read under `node` (not property names or member properties). */
const referencedNames = (node: Node): Set<string> => {
  const names = new Set<string>()
  const visit = (n: Node, parent: Node | undefined, key: string): void => {
    if (n === null || typeof n !== "object") return
    if (n.type === "Identifier") {
      const property = parent?.type === "MemberExpression" && key === "property" && !parent.computed
      const objectKey = parent?.type === "Property" && key === "key" && !parent.computed && !parent.shorthand
      if (!property && !objectKey) names.add(n.name)
      return
    }
    for (const [k, value] of Object.entries(n)) {
      if (k === "loc") continue
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === "object" && typeof child.type === "string") visit(child, n, k)
      }
    }
  }
  visit(node, undefined, "")
  return names
}

const loops = /^(ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement)$/

/**
 * An activity is recorded by its name: a keyless one in a loop, or two keyless ones with one name,
 * would replay the first result (Plan 23 review).
 */
const checkActivities = (ctx: Ctx, body: Node): void => {
  const seen = new Set<string>()
  const visit = (node: Node, inLoop: boolean): void => {
    if (node === null || typeof node !== "object") return
    if (node.type === "ActivityExpression" && node.key === null) {
      const name: string = node.name.name
      if (inLoop) {
        ctx.diagnostics.push(
          diagnosticError(
            "EFX9201",
            "An activity in a loop needs a key: each run is recorded by its name",
            node.start,
            node.body.start,
            `write \`activity ${name}(key)\` with a value that differs per run`
          )
        )
      } else if (seen.has(name)) {
        ctx.diagnostics.push(
          diagnosticError(
            "EFX9202",
            `A workflow can't have two activities named \`${name}\`: the second would replay the first`,
            node.start,
            node.body.start,
            "give each a different name, or a key"
          )
        )
      }
      seen.add(name)
    }
    const nested = loops.test(node.type ?? "")
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc") continue
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === "object" && typeof child.type === "string") {
          visit(child, inLoop || (nested && key === "body"))
        }
      }
    }
  }
  visit(body, false)
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
  RpcDeclaration: rpcDeclaration,
  EntityDeclaration: entityDeclaration,
  WorkflowDeclaration: workflowDeclaration,
  ActivityExpression: activityExpression,
  ToolDeclaration: toolDeclaration,
  ToolkitDeclaration: toolkitDeclaration
}
