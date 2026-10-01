/**
 * Ambient capture (§4.15, ADR-0027): inside `effect` code, JavaScript's ambient side effects on free
 * `console`, `Date`, `Math` and `process` become calls to the matching Effect services.
 *
 * @since 4.0.0
 */
import { isTypeFree, isValueFree } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { ref } from "../names.ts"
import { parenthesizeIfNeeded } from "./await.ts"
import type { HandlerGroup } from "./registry.ts"

const consoleMethods: Record<string, string> = {
  log: "log",
  info: "logInfo",
  warn: "logWarning",
  error: "logError",
  debug: "logDebug"
}

const isFreeGlobal = (ctx: Ctx, node: Node, name: string): boolean =>
  node.type === "Identifier" && node.name === name && isValueFree(ctx.scope, name) && isTypeFree(ctx.scope, name)

const memberName = (node: Node): string | undefined =>
  !node.computed && node.property.type === "Identifier"
    ? node.property.name
    : node.computed && node.property.type === "Literal" && typeof node.property.value === "string"
    ? node.property.value
    : undefined

/** Parameter defaults run before the generator body: no `yield*` there (review I2). */
const inParameters = (ctx: Ctx, node: Node): boolean => {
  const params: Array<Node> | undefined = ctx.effect?.node.params
  if (params === undefined || params.length === 0) return false
  return node.start >= params[0]!.start && node.end <= params[params.length - 1]!.end
}

const enabled = (ctx: Ctx, node: Node) => ctx.options.ambient && ctx.effect !== undefined && !inParameters(ctx, node)

/** Marks member expressions that are assignment targets inside a pattern (review I3). */
const markTargets = (pattern: Node | null | undefined): void => {
  if (pattern === null || pattern === undefined) return
  switch (pattern.type) {
    case "MemberExpression":
      pattern.efxWriteTarget = true
      return
    case "ArrayPattern":
      for (const element of pattern.elements) markTargets(element)
      return
    case "ObjectPattern":
      for (const property of pattern.properties) {
        markTargets(property.type === "RestElement" ? property.argument : property.value)
      }
      return
    case "AssignmentPattern":
      return markTargets(pattern.left)
    case "RestElement":
      return markTargets(pattern.argument)
  }
}

const assignmentTargets: Handler = (node) => {
  markTargets(node.left)
}

const call: Handler = (node, parent, ctx) => {
  if (!enabled(ctx, node)) return
  const callee: Node = node.callee
  if (callee.type !== "MemberExpression" || callee.computed || node.optional === true) return
  const name = memberName(callee)
  if (name === undefined) return
  if (isFreeGlobal(ctx, callee.object, "console") && consoleMethods[name] !== undefined) {
    parenthesizeIfNeeded(ctx, node, parent)
    ctx.s.update(node.start, callee.end, `yield* ${ref(ctx, "effect", "Effect")}.${consoleMethods[name]}`)
    return // the arguments are walked as usual
  }
  if (node.arguments.length !== 0) return
  const replacement = isFreeGlobal(ctx, callee.object, "Date") && name === "now"
    ? `yield* ${ref(ctx, "effect", "Clock")}.currentTimeMillis`
    : isFreeGlobal(ctx, callee.object, "Math") && name === "random"
    ? `yield* ${ref(ctx, "effect", "Random")}.next`
    : undefined
  if (replacement === undefined) return
  parenthesizeIfNeeded(ctx, node, parent)
  ctx.s.update(node.start, node.end, replacement)
  return true
}

/** `process.env.NAME` in a read position. */
const member: Handler = (node, parent, ctx) => {
  if (!enabled(ctx, node) || node.efxWriteTarget === true) return
  const env: Node = node.object
  if (env.type !== "MemberExpression" || env.computed || memberName(env) !== "env") return
  if (!isFreeGlobal(ctx, env.object, "process")) return
  const name = memberName(node)
  if (name === undefined) return
  const isWrite = (parent?.type === "AssignmentExpression" && parent.left === node) ||
    parent?.type === "UpdateExpression" ||
    (parent?.type === "UnaryExpression" && parent.operator === "delete") ||
    (parent?.type === "CallExpression" && parent.callee === node)
  if (isWrite) return
  const Config = ref(ctx, "effect", "Config")
  parenthesizeIfNeeded(ctx, node, parent)
  ctx.s.update(
    node.start,
    node.end,
    `yield* ${Config}.String(${JSON.stringify(name)}).pipe(${Config}.withDefault(undefined))`
  )
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const ambientHandlers: HandlerGroup = {
  CallExpression: call,
  MemberExpression: member,
  AssignmentExpression: assignmentTargets,
  ForOfStatement: assignmentTargets,
  ForInStatement: assignmentTargets
}
