/**
 * `x.pipe(a, b)` / `pipe(x, a, b)` → `x |> a |> b`, exactly where the forward compiler chooses the
 * same call: `.pipe(…)` for heads it knows are pipeable, `pipe(…)` for the others (ADR-0030).
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commaToPipe, commentsIn, removeKeepingComments, type ReverseCtx, separatorComma } from "./context.ts"
import { importedLocal } from "./origin.ts"

/**
 * Mirrors the forward `knownPipeable` on the EffectScript this conversion produces.
 *
 * @since 4.0.0
 * @category reverse
 */
export const pipeableInEfx = (ctx: ReverseCtx, node: Node, seen: ReadonlySet<string> = new Set()): boolean => {
  switch (node.type) {
    case "CallExpression": {
      const shape = genShape(ctx, node, undefined)
      if (shape !== undefined) return "fn" in shape
      return node.callee.type === "Identifier" && ctx.effects.has(node.callee.name) &&
        !ctx.analysis.innerBound.has(node.callee.name)
    }
    case "Identifier": {
      if (seen.has(node.name) || ctx.analysis.innerBound.has(node.name)) return false
      const init = ctx.analysis.constInits.get(node.name)
      return init !== undefined && pipeableInEfx(ctx, init, new Set([...seen, node.name]))
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      return pipeableInEfx(ctx, node.expression, seen)
    default:
      return false
  }
}

/** Parents where a pipeline replaces a call without changing how the code parses. */
const positions = new Set([
  "VariableDeclarator",
  "ReturnStatement",
  "YieldExpression",
  "AwaitExpression",
  "AssignmentExpression",
  "ArrowFunctionExpression",
  "Property",
  "PropertyDefinition",
  "ExpressionStatement",
  "ExportDefaultDeclaration"
])

/**
 * Whether an expression at this position can be replaced by a lower-precedence EffectScript form
 * (a pipeline, a `match`) without changing how the code parses.
 *
 * @since 4.0.0
 * @category reverse
 */
export const inPosition = (call: Node, parent: Node | undefined): boolean => {
  if (parent === undefined || !positions.has(parent.type)) return false
  switch (parent.type) {
    case "AssignmentExpression":
      return parent.right === call
    case "ArrowFunctionExpression":
      return parent.body === call
    case "Property":
    case "PropertyDefinition":
      return parent.value === call
    default:
      return true
  }
}

/** `($) => e`: the references to `$` in `e` (the forward topic parameter), or `undefined`. */
const topicReferences = (node: Node): ReadonlyArray<Node> | undefined => {
  if (node.type !== "ArrowFunctionExpression" || node.async || node.body.type === "BlockStatement") return undefined
  const params: Array<Node> = node.params
  if (params.length !== 1 || params[0]!.type !== "Identifier" || params[0]!.name !== "$" || params[0]!.typeAnnotation) {
    return undefined
  }
  const references: Array<Node> = []
  let plain = true
  const collect = (n: Node, parent: Node | undefined): void => {
    if (n.type === "Identifier" && n.name === "$") {
      // a property name or a nested binder isn't the topic (and `%` can't stand there)
      const key = (parent?.type === "MemberExpression" && parent.property === n && !parent.computed) ||
        (parent?.type === "Property" && (parent.key === n || parent.shorthand) && !parent.computed)
      if (key) plain = false
      else references.push(n)
    }
    if (/Function/.test(n.type) && (n.params as Array<Node>).some((p) => p.type === "Identifier" && p.name === "$")) {
      plain = false
    }
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === "$") plain = false
    for (const child of children(n)) collect(child, n)
  }
  collect(node.body, node)
  return plain && references.length > 0 ? references : undefined
}

/**
 * Whether step `index` comes back from the forward compiler as `($) => …`: a first step with one
 * topic may be inlined instead, so only later steps and multi-topic first steps qualify.
 */
const isTopicStep = (step: Node, index: number): boolean => {
  const references = topicReferences(step)
  return references !== undefined && (index > 0 || references.length > 1)
}

/** Step expressions that parse the same after `|>`, also before another `|>`. */
const stepTypes = new Set(["Identifier", "MemberExpression", "CallExpression", "NewExpression"])
const topicBodyTypes = new Set([
  ...stepTypes,
  "BinaryExpression",
  "TemplateLiteral",
  "ArrayExpression",
  "ObjectExpression"
])

/**
 * Whether a function step reads the same written after `|>`. An arrow never does: `|> (x) => …`
 * doesn't parse, and parenthesizing it changes the compiled text.
 *
 * @since 4.0.0
 * @category reverse
 */
export const isPlainStep = (step: Node): boolean => stepTypes.has(step.type)

/** Heads `pipe(head, …)` can lose its call around: simple expressions that can't start a statement badly. */
const headTypes = new Set([
  "Identifier",
  "MemberExpression",
  "CallExpression",
  "NewExpression",
  "ThisExpression",
  "Literal"
])

interface PipeShape {
  readonly kind: "method" | "function"
  readonly head: Node
  readonly steps: ReadonlyArray<Node>
}

/**
 * The pipeline a call converts to, if the forward compiler would produce the same call. With
 * `topics`, `($) => …` steps become `%` steps.
 *
 * @since 4.0.0
 * @category reverse
 */
export const pipeShape = (
  ctx: ReverseCtx,
  call: Node,
  parent: Node | undefined,
  topics: boolean
): PipeShape | undefined => {
  if (call.type !== "CallExpression") return undefined
  const args: Array<Node> = call.arguments
  if (args.length === 0 || args.some((a) => a.type === "SpreadElement") || !inPosition(call, parent)) return undefined
  const callee: Node = call.callee
  let shape: PipeShape | undefined
  if (
    callee.type === "MemberExpression" && !callee.computed && callee.optional !== true && call.optional !== true &&
    callee.property.name === "pipe" && pipeableInEfx(ctx, callee.object)
  ) {
    shape = { kind: "method", head: callee.object, steps: args }
  } else if (
    callee.type === "Identifier" && callee.name === "pipe" &&
    importedLocal(ctx.analysis, "effect", "pipe") === "pipe" &&
    args.length >= 2 && !pipeableInEfx(ctx, args[0]!) && headTypes.has(args[0]!.type) &&
    (args[0]!.type !== "Literal" || args[0]!.regex === undefined) &&
    // exactly `pipe(` before the head: no parentheses or comments around it
    /^\(\s*$/.test(ctx.source.slice(callee.end, args[0]!.start))
  ) {
    shape = { kind: "function", head: args[0]!, steps: args.slice(1) }
  }
  if (shape === undefined) return undefined
  const ok = shape.steps.every((step, i) => {
    const last = i === shape.steps.length - 1
    if (topics && isTopicStep(step, i)) return last || topicBodyTypes.has(step.body.type)
    return isPlainStep(step)
  })
  return ok ? shape : undefined
}

/**
 * Whether `%` steps round-trip in this file: the forward compiler names every topic parameter `$`
 * only when no other `$` identifier exists, so every `$` must belong to a converted topic step.
 *
 * @since 4.0.0
 * @category reverse
 */
export const topicsRoundTrip = (ctx: ReverseCtx): boolean => {
  let total = 0
  let converted = 0
  const count = (node: Node): number => {
    let n = node.type === "Identifier" && node.name === "$" ? 1 : 0
    for (const child of children(node)) n += count(child)
    return n
  }
  const visit = (node: Node, parent: Node | undefined): void => {
    if (node.type === "Identifier" && node.name === "$") total++
    const shape = pipeShape(ctx, node, parent, true)
    if (shape !== undefined) {
      shape.steps.forEach((step, i) => {
        if (isTopicStep(step, i)) converted += count(step)
      })
    }
    for (const child of children(node)) visit(child, node)
  }
  visit(ctx.analysis.program, undefined)
  return total > 0 && total === converted
}

/**
 * Joins `steps` after `previous` with `|>`, turning topic steps into `%` steps.
 */
const joinSteps = (
  ctx: ReverseCtx,
  call: Node,
  previous: Node,
  steps: ReadonlyArray<Node>,
  from: number,
  visit: Visit,
  generator: boolean
): void => {
  steps.forEach((step, offset) => {
    const i = from + offset
    if (i > 0) commaToPipe(ctx, separatorComma(ctx, previous.end, step.start), step)
    if (ctx.topics && isTopicStep(step, i)) {
      ctx.s.remove(step.start, step.body.start)
      for (const topic of topicReferences(step)!) ctx.s.update(topic.start, topic.end, "%")
      visit(step.body, step, false)
    } else {
      visit(step, call, generator)
    }
    previous = step
  })
  removeKeepingComments(ctx, previous.end, call.end)
}

/**
 * @since 4.0.0
 * @category reverse
 */
export const convertPipe = (
  ctx: ReverseCtx,
  call: Node,
  parent: Node | undefined,
  visit: Visit,
  generator: boolean
): boolean => {
  const shape = pipeShape(ctx, call, parent, ctx.topics)
  if (shape === undefined) return false
  const first = shape.steps[0]!
  if (shape.kind === "method") {
    // `x.pipe(a` → `x |> a`, keeping a line break before the first step
    const callee: Node = call.callee
    const dot = ctx.source.lastIndexOf(".", callee.property.start)
    const open = ctx.source.indexOf("(", callee.property.end)
    visit(shape.head, callee, generator)
    if (ctx.source.slice(open + 1, first.start).includes("\n") || commentsIn(ctx, open, first.start).length > 0) {
      ctx.s.remove(dot, open + 1)
      ctx.s.appendLeft(first.start, "|> ")
    } else {
      ctx.s.update(dot, first.start, " |> ")
    }
  } else {
    // `pipe(x, a` → `x |> a`
    ctx.s.remove(call.start, shape.head.start)
    visit(shape.head, call, generator)
    commaToPipe(ctx, separatorComma(ctx, shape.head.end, first.start), first)
  }
  joinSteps(ctx, call, shape.head, shape.steps, 0, visit, generator)
  return true
}
