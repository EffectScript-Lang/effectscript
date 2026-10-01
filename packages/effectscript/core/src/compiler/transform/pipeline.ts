/**
 * `|>`: F#-style steps become `.pipe(…)` (known pipeable heads) or `pipe(…)`; Hack-style steps
 * (with `%`) are inlined when safe, otherwise become `($) => rhs` functions inside the pipe.
 *
 * @since 0.1.0
 */
import { isValueFree } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { skipSpace } from "../parser/scan.ts"
import { walk } from "../walk.ts"
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

interface Range {
  readonly start: number
  readonly end: number
}

/**
 * The node's range including enclosing parentheses (acorn ranges exclude them). Never expands over
 * a call's argument parentheses.
 */
const outer = (ctx: Ctx, node: Node): Range => {
  let start = node.start
  let end = node.end
  for (;;) {
    let before = start - 1
    while (before >= 0 && /\s/.test(ctx.source[before]!)) before--
    const after = skipSpace(ctx.source, end)
    if (ctx.source[before] !== "(" || ctx.source[after] !== ")") break
    let callee = before - 1
    while (callee >= 0 && /\s/.test(ctx.source[callee]!)) callee--
    const ch = ctx.source[callee] ?? ""
    // a call `f(`/`f)(`/`a[0](`, or a generic call `f<T>(` (but not `|>`, `=>` or a comparison `a > (b)`)
    const isCall = /[\w$)\]]/.test(ch) || (ch === ">" && /[\w$>\]]/.test(ctx.source[callee - 1] ?? ""))
    if (callee >= 0 && isCall) break
    start = before
    end = after + 1
  }
  return { start, end }
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

/** Nodes from `root` down to `target` (exclusive of target). */
const pathTo = (root: Node, target: Node): Array<Node> | undefined => {
  if (root === target) return []
  if (root.start > target.start || root.end < target.end) return undefined
  for (const child of children(root)) {
    const path = pathTo(child, target)
    if (path !== undefined) return [root, ...path]
  }
  return undefined
}

/** The topic is evaluated exactly once, unconditionally: not deferred, repeated or short-circuited. */
const evaluatedOnce = (rhs: Node, topic: Node): boolean => {
  const path = pathTo(rhs, topic)
  if (path === undefined) return false
  return path.every((node, i) => {
    const next = path[i + 1] ?? topic
    switch (node.type) {
      case "ArrowFunctionExpression":
      case "FunctionExpression":
      case "ChainExpression":
        return false
      case "LogicalExpression":
        return node.left === next
      case "ConditionalExpression":
        return node.test === next
      case "MemberExpression":
      case "CallExpression":
        return node.optional !== true
      default:
        return true
    }
  })
}

const inlinable = (step: Step): boolean =>
  step.topics.length === 1 && !unsafeBefore(step.rhs, step.topics[0]!) && evaluatedOnce(step.rhs, step.topics[0]!)

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

const needsWrapping = (current: Current): boolean =>
  current.node !== undefined && current.start === current.node.start && !simpleTypes.has(current.node.type)

const freshName = (ctx: Ctx): string => {
  for (const name of ["$", "$$", "$$$"]) if (isValueFree(ctx.scope, name)) return name
  return "$topic"
}

/** Replaces the whitespace + `|>` before `rhs` with `text`, preserving line breaks. */
const joinStep = (ctx: Ctx, previousEnd: number, op: Range, rhs: Range, text: string): void => {
  if (ctx.source.slice(previousEnd, op.start).includes("\n")) {
    ctx.s.appendLeft(previousEnd, text)
    ctx.s.remove(op.start, ctx.source[op.end] === " " ? op.end + 1 : op.end)
  } else {
    ctx.s.update(previousEnd, rhs.start, text === "," ? ", " : text)
  }
}

const applyGroup = (ctx: Ctx, current: Current, group: ReadonlyArray<Step>): void => {
  if (current.pipeable) {
    if (needsWrapping(current)) {
      ctx.s.appendRight(current.start, "(")
      ctx.s.prependLeft(current.end, ")")
    }
  } else {
    ctx.s.appendRight(current.start, `${pipeName(ctx)}(`)
  }
  let previousEnd = current.end
  group.forEach((step, i) => {
    const rhs = outer(ctx, step.rhs)
    if (step.topics.length > 0) {
      const name = freshName(ctx)
      ctx.s.appendRight(rhs.start, `(${name}) => `)
      for (const topic of step.topics) ctx.s.update(topic.start, topic.end, name)
    }
    joinStep(ctx, previousEnd, step.op, rhs, i === 0 && current.pipeable ? ".pipe(" : ",")
    previousEnd = rhs.end
  })
  ctx.s.prependLeft(previousEnd, ")")
}

const inline = (ctx: Ctx, current: Current, step: Step): void => {
  const topic = step.topics[0]!
  if (needsWrapping(current)) {
    ctx.s.appendRight(current.start, "(")
    ctx.s.prependLeft(current.end, ")")
  }
  ctx.s.remove(current.end, outer(ctx, step.rhs).start)
  ctx.s.remove(topic.start, topic.end)
  ctx.s.move(current.start, current.end, topic.start)
}

/** `pipe`, or an alias when a local binding shadows it at this site. */
const pipeName = (ctx: Ctx): string => {
  const bound = !isValueFree(ctx.scope, "pipe")
  const imported = ctx.analysis.program.body.some((s: Node) =>
    s.type === "ImportDeclaration" && s.source.value === "effect" &&
    s.specifiers.some((spec: Node) => spec.local.name === "pipe" && spec.importKind !== "type")
  )
  if (!bound || imported) {
    ctx.imports.need("effect", "pipe")
    return "pipe"
  }
  ctx.imports.need("effect", "pipe as pipe$")
  return "pipe$"
}

const pipeline: Handler = (node, _parent, ctx) => {
  const { head, steps } = flatten(node)
  const headRange = outer(ctx, head)
  let current: Current = { ...headRange, pipeable: knownPipeable(ctx, head), node: head }
  let i = 0
  while (i < steps.length) {
    // Inline only directly into the head: later steps would re-move ranges an earlier move split.
    if (i === 0 && inlinable(steps[0]!)) {
      inline(ctx, current, steps[0]!)
      current = { ...outer(ctx, steps[0]!.rhs), pipeable: false, node: steps[0]!.rhs }
      i++
      continue
    }
    applyGroup(ctx, current, steps.slice(i))
    current = {
      start: current.start,
      end: outer(ctx, steps[steps.length - 1]!.rhs).end,
      pipeable: false,
      node: undefined
    }
    i = steps.length
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
