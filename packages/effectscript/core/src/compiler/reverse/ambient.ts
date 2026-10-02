/**
 * Ambient forms (spec §4.15): the inverse of `transform/ambient.ts`. At generator level,
 * `yield* Effect.log(…)` → `console.log(…)`, `yield* Clock.currentTimeMillis` → `Date.now()`,
 * `yield* Random.next` → `Math.random()`, and
 * `yield* Config.String("X").pipe(Config.withDefault(undefined))` → `process.env.X` (ADR-0027).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { isParenthesized, needsParens } from "../transform/await.ts"
import { isGlobalFree } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, isCanonicalString, type ReverseCtx } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"

const logMethods: Record<string, string> = {
  log: "log",
  logInfo: "info",
  logWarning: "warn",
  logError: "error",
  logDebug: "debug"
}

const isIdentifierName = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name)

/** `Config.String("X").pipe(Config.withDefault(undefined))`: the variable name. */
const envRead = (ctx: ReverseCtx, node: Node): string | undefined => {
  const config = importedLocal(ctx.analysis, "effect", "Config")
  if (node.type !== "CallExpression" || node.arguments.length !== 1 || config === undefined) return undefined
  const callee: Node = node.callee
  if (callee.type !== "MemberExpression" || callee.computed || callee.property.name !== "pipe") return undefined
  const read: Node = callee.object
  const fallback: Node = node.arguments[0]
  const ok = read.type === "CallExpression" && isMember(read.callee, config, "String") && read.arguments.length === 1 &&
    isCanonicalString(ctx, read.arguments[0]) &&
    fallback.type === "CallExpression" && isMember(fallback.callee, config, "withDefault") &&
    fallback.arguments.length === 1 && fallback.arguments[0].type === "Identifier" &&
    fallback.arguments[0].name === "undefined"
  return ok ? read.arguments[0].value : undefined
}

/** Parents where the forward compiler leaves an env read alone (writes and calls, ADR-0027). */
const isWrite = (node: Node, parent: Node | undefined): boolean =>
  (parent?.type === "AssignmentExpression" && parent.left === node) || parent?.type === "UpdateExpression" ||
  (parent?.type === "UnaryExpression" && parent.operator === "delete") ||
  (parent?.type === "CallExpression" && parent.callee === node)

/**
 * Rewrites `node` (a `yield*` at generator level) as an ambient form. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertAmbient = (ctx: ReverseCtx, node: Node, parent: Node | undefined, visit: Visit): boolean => {
  if (!ctx.options.ambient || node.type !== "YieldExpression" || !node.delegate) return false
  if (commentsIn(ctx, node.start, node.end).length > 0) return false
  const argument: Node = node.argument
  let replace: { readonly text: string; readonly end: number } | undefined
  let args: Array<Node> = []
  if (argument.type === "CallExpression" && argument.callee.type === "MemberExpression") {
    const method = isMember(argument.callee, ctx.effect) ? logMethods[argument.callee.property.name] : undefined
    if (method !== undefined && argument.optional !== true && isGlobalFree(ctx.analysis, "console")) {
      // `yield* Effect.log` → `console.log`; the arguments stay
      replace = { text: `console.${method}`, end: argument.callee.end }
      args = argument.arguments
    }
  }
  const clock = importedLocal(ctx.analysis, "effect", "Clock")
  const random = importedLocal(ctx.analysis, "effect", "Random")
  if (isMember(argument, clock, "currentTimeMillis") && isGlobalFree(ctx.analysis, "Date")) {
    replace = { text: "Date.now()", end: node.end }
  } else if (isMember(argument, random, "next") && isGlobalFree(ctx.analysis, "Math")) {
    replace = { text: "Math.random()", end: node.end }
  }
  const variable = envRead(ctx, argument)
  if (variable !== undefined && isGlobalFree(ctx.analysis, "process") && !isWrite(node, parent)) {
    const member = isIdentifierName(variable) ? `.${variable}` : `[${JSON.stringify(variable)}]`
    replace = { text: `process.env${member}`, end: node.end }
  }
  if (replace === undefined) return false
  ctx.s.update(node.start, replace.end, replace.text)
  // the forward compiler parenthesizes the `yield*` exactly where `needsParens` says so
  if (needsParens(node, parent) && isParenthesized(ctx.source, node)) {
    let open = node.start - 1
    while (/\s/.test(ctx.source[open]!)) open--
    let close = node.end
    while (/\s/.test(ctx.source[close]!)) close++
    // a line break inside the parentheses would end a `return` (ASI) once they are gone
    const inside = ctx.source.slice(open, close + 1)
    if (!inside.includes("\n") && commentsIn(ctx, open, close + 1).length === 0) {
      ctx.s.remove(open, open + 1)
      ctx.s.remove(close, close + 1)
    }
  }
  for (const arg of args) visit(arg, argument, true)
  return true
}
