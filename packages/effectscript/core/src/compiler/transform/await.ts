/**
 * Inside `effect` code: `await` → `yield*`, `await [..]`/`await {..}` → concurrent `Effect.all`,
 * `throw e` → `return yield* Effect.fail(e)`.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { ref } from "../names.ts"
import { skipSpace } from "../parser/scan.ts"
import type { HandlerGroup } from "./registry.ts"

/**
 * Whether `yield* x` must be parenthesized where `await x` was.
 *
 * @since 0.1.0
 * @category utils
 */
export const needsParens = (node: Node, parent: Node | undefined): boolean => {
  if (parent === undefined) return false
  switch (parent.type) {
    case "BinaryExpression":
    case "LogicalExpression":
    case "UnaryExpression":
    case "AwaitExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
      return true
    case "MemberExpression":
      return parent.object === node
    case "CallExpression":
    case "NewExpression":
      return parent.callee === node
    case "TaggedTemplateExpression":
      return parent.tag === node
    case "ConditionalExpression":
      return parent.test === node
    default:
      return false
  }
}

/**
 * @since 0.1.0
 * @category utils
 */
export const isParenthesized = (source: string, node: Node): boolean => {
  let before = node.start - 1
  while (before >= 0 && /\s/.test(source[before]!)) before--
  return source[before] === "(" && source[skipSpace(source, node.end)] === ")"
}

/**
 * Wraps `[start, end)` in parentheses when the replacement binds looser than the original.
 *
 * @since 0.1.0
 * @category utils
 */
export const parenthesizeIfNeeded = (ctx: Ctx, node: Node, parent: Node | undefined): void => {
  if (needsParens(node, parent) && !isParenthesized(ctx.source, node)) {
    ctx.s.appendRight(node.start, "(")
    ctx.s.prependLeft(node.end, ")")
  }
}

const awaitExpression: Handler = (node, parent, ctx) => {
  if (ctx.effect === undefined) return
  parenthesizeIfNeeded(ctx, node, parent)
  ctx.binds.push({ start: node.start, end: node.start + 5 })
  const argument: Node = node.argument
  if (argument.type === "ArrayExpression" || argument.type === "ObjectExpression") {
    ctx.s.update(node.start, argument.start, `yield* ${ref(ctx, "effect", "Effect")}.all(`)
    ctx.s.prependLeft(argument.end, ", { concurrency: \"unbounded\" })")
  } else {
    ctx.s.update(node.start, node.start + 5, "yield*")
  }
}

const throwStatement: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) return
  const argument: Node = node.argument
  if (
    argument.type === "NewExpression" && argument.callee.type === "Identifier" &&
    ctx.analysis.localErrors.has(argument.callee.name)
  ) {
    ctx.s.update(node.start, node.start + 5, "return yield*")
  } else {
    ctx.s.update(node.start, argument.start, `return yield* ${ref(ctx, "effect", "Effect")}.fail(`)
    ctx.s.prependLeft(argument.end, ")")
  }
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const awaitHandlers: HandlerGroup = {
  AwaitExpression: awaitExpression,
  ThrowStatement: throwStatement
}
