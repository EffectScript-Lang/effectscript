/**
 * @since 0.1.0
 */
import { children, type Node } from "./ast.ts"
import type { Ctx } from "./context.ts"

const boundaries = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "ClassDeclaration",
  "ClassExpression"
])

/**
 * @since 0.1.0
 * @category traversal
 */
export const walk = (node: Node, parent: Node | undefined, ctx: Ctx): void => {
  const previousScope = ctx.scope
  const previousEffect = ctx.effect
  const scope = ctx.analysis.scopeOf.get(node)
  if (scope !== undefined) ctx.scope = scope
  if (boundaries.has(node.type) && node.efx === undefined) ctx.effect = undefined
  let handled = false
  for (const handler of ctx.handlers.get(node.type) ?? []) {
    if (handler(node, parent, ctx) === true) {
      handled = true
      break
    }
  }
  if (!handled) walkChildren(node, ctx)
  ctx.scope = previousScope
  ctx.effect = previousEffect
}

/**
 * @since 0.1.0
 * @category traversal
 */
export const walkChildren = (node: Node, ctx: Ctx, skip?: ReadonlySet<Node>): void => {
  for (const child of children(node)) {
    if (skip === undefined || !skip.has(child)) walk(child, node, ctx)
  }
}

/**
 * Walks `node` with the scope recorded for `scopeNode` (e.g. a catch clause body).
 *
 * @since 0.1.0
 * @category traversal
 */
export const walkInScopeOf = (scopeNode: Node, node: Node, parent: Node | undefined, ctx: Ctx): void => {
  const previous = ctx.scope
  const scope = ctx.analysis.scopeOf.get(scopeNode)
  if (scope !== undefined) ctx.scope = scope
  walk(node, parent, ctx)
  ctx.scope = previous
}
