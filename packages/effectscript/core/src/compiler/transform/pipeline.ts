/**
 * `|>`: F#-style steps become `.pipe(…)` (known pipeable heads) or `pipe(…)`; Hack-style steps
 * (with `%`) are inlined when safe, otherwise become `($) => rhs` functions inside the pipe.
 *
 * @since 0.1.0
 */
import { isValueFree } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { walk } from "../walk.ts"
import { isParenthesized } from "./await.ts"
import type { HandlerGroup } from "./registry.ts"

interface Step {
  readonly op: { readonly start: number; readonly end: number }
  readonly rhs: Node
  readonly topics: ReadonlyArray<Node>
}

interface Current {
  readonly start: number
  readonly end: number
  readonly pipeable: boolean
  readonly node: Node | undefined
}

/**
 * Topic references in `node`, excluding nested pipelines' right-hand sides (they rebind `%`).
 *
 * @since 0.1.0
 * @category utils
 */
export const topicsOf = (node: Node, out: Array<Node> = []): Array<Node> => {
  if (node.type === "TopicReference") {
    out.push(node)
    return out
  }
  if (node.type === "PipelineExpression") return topicsOf(node.left, out)
  for (const child of children(node)) topicsOf(child, out)
  return out
}

const isModuleBinding = (ctx: Ctx, name: string): boolean => {
  for (let scope: typeof ctx.scope | undefined = ctx.scope; scope !== undefined; scope = scope.parent) {
    if (scope.values.has(name)) return scope === ctx.analysis.module
  }
  return false
}

/**
 * Conservative: only expressions that certainly produce a Pipeable (an Effect).
 *
 * @since 0.1.0
 * @category utils
 */
export const knownPipeable = (ctx: Ctx, node: Node, seen: ReadonlySet<string> = new Set()): boolean => {
  switch (node.type) {
    case "EffectBlock":
      return true
    case "CallExpression":
      return node.callee.type === "Identifier" && ctx.analysis.localEffects.has(node.callee.name) &&
        isModuleBinding(ctx, node.callee.name)
    case "Identifier": {
      if (seen.has(node.name) || !isModuleBinding(ctx, node.name)) return false
      const init = ctx.analysis.constInits.get(node.name)
      return init !== undefined && knownPipeable(ctx, init, new Set([...seen, node.name]))
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      return knownPipeable(ctx, node.expression, seen)
    default:
      return false
  }
}

const flatten = (node: Node): { readonly head: Node; readonly steps: Array<Step> } => {
  const steps: Array<Step> = []
  let current = node
  while (current.type === "PipelineExpression") {
    steps.unshift({ op: current.op, rhs: current.right, topics: topicsOf(current.right) })
    current = current.left
  }
  return { head: current, steps }
}

const sideEffectTypes = new Set([
  "CallExpression",
  "NewExpression",
  "AssignmentExpression",
  "UpdateExpression",
  "AwaitExpression",
  "YieldExpression",
  "TaggedTemplateExpression",
  "ImportExpression"
])

const unsafeBefore = (node: Node, topic: Node): boolean => {
  if (node.start >= topic.start) return false
  if (node.end <= topic.start && sideEffectTypes.has(node.type)) return true
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return false
  return children(node).some((child) => unsafeBefore(child, topic))
}

const inlinable = (step: Step): boolean => step.topics.length === 1 && !unsafeBefore(step.rhs, step.topics[0]!)

const simpleTypes = new Set([
  "Identifier",
  "CallExpression",
  "MemberExpression",
  "ThisExpression",
  "Literal",
  "TemplateLiteral",
  "ArrayExpression",
  "EffectBlock"
])

const needsWrapping = (ctx: Ctx, current: Current): boolean =>
  current.node !== undefined && !simpleTypes.has(current.node.type) && !isParenthesized(ctx.source, current.node)

const freshName = (ctx: Ctx): string => {
  for (const name of ["$", "$$", "$$$"]) if (isValueFree(ctx.scope, name)) return name
  return "$topic"
}

/** Replaces the whitespace + `|>` before `step` with `text`, preserving line breaks. */
const joinStep = (ctx: Ctx, previousEnd: number, step: Step, text: string): void => {
  if (ctx.source.slice(previousEnd, step.op.start).includes("\n")) {
    ctx.s.appendLeft(previousEnd, text)
    ctx.s.remove(step.op.start, ctx.source[step.op.end] === " " ? step.op.end + 1 : step.op.end)
  } else {
    ctx.s.update(previousEnd, step.rhs.start, text === "," ? ", " : text)
  }
}

const applyGroup = (ctx: Ctx, current: Current, group: ReadonlyArray<Step>): void => {
  if (current.pipeable) {
    if (needsWrapping(ctx, current)) {
      ctx.s.appendRight(current.start, "(")
      ctx.s.prependLeft(current.end, ")")
    }
  } else {
    ctx.imports.need("effect", "pipe")
    ctx.s.appendRight(current.start, "pipe(")
  }
  let previousEnd = current.end
  group.forEach((step, i) => {
    if (step.topics.length > 0) {
      const name = freshName(ctx)
      ctx.s.appendRight(step.rhs.start, `(${name}) => `)
      for (const topic of step.topics) ctx.s.update(topic.start, topic.end, name)
    }
    joinStep(ctx, previousEnd, step, i === 0 && current.pipeable ? ".pipe(" : ",")
    previousEnd = step.rhs.end
  })
  ctx.s.prependLeft(previousEnd, ")")
}

const inline = (ctx: Ctx, current: Current, step: Step): void => {
  const topic = step.topics[0]!
  if (needsWrapping(ctx, current)) {
    ctx.s.appendRight(current.start, "(")
    ctx.s.prependLeft(current.end, ")")
  }
  ctx.s.remove(current.end, step.rhs.start)
  ctx.s.remove(topic.start, topic.end)
  ctx.s.move(current.start, current.end, topic.start)
}

const pipeline: Handler = (node, _parent, ctx) => {
  const { head, steps } = flatten(node)
  let current: Current = { start: head.start, end: head.end, pipeable: knownPipeable(ctx, head), node: head }
  let i = 0
  while (i < steps.length) {
    const step = steps[i]!
    if (inlinable(step)) {
      inline(ctx, current, step)
      current = { start: step.rhs.start, end: step.rhs.end, pipeable: false, node: step.rhs }
      i++
      continue
    }
    let j = i
    while (j < steps.length && !inlinable(steps[j]!)) j++
    applyGroup(ctx, current, steps.slice(i, j))
    current = { start: current.start, end: steps[j - 1]!.rhs.end, pipeable: false, node: undefined }
    i = j
  }
  walk(head, node, ctx)
  for (const step of steps) walk(step.rhs, node, ctx)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const pipelineHandlers: HandlerGroup = {
  PipelineExpression: pipeline
}
