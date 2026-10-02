/**
 * Generator bodies: `yield*` → `await`, failures → `throw`, `Effect.x` → builtin `x`.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { excludedNames, namespaceExports } from "../prelude/tables.ts"
import type { ReverseCtx } from "./context.ts"
import { isMember } from "./origin.ts"

const nestedScopes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression"
])

/**
 * `Effect.x` → `x` when `x` is a builtin that is free everywhere in the file (spec §4.13).
 *
 * @since 4.0.0
 * @category reverse
 */
export const unqualify = (ctx: ReverseCtx, node: Node): void => {
  if (!isMember(node, ctx.effect)) return
  const name: string = node.property.name
  if (excludedNames.has(name) || !namespaceExports.get("Effect")!.has(name)) return
  const { innerBound, module } = ctx.analysis
  if (innerBound.has(name) || module.values.has(name) || module.types.has(name)) return
  ctx.s.remove(node.start, node.property.start)
}

/**
 * Unqualifies builtins in an expression without converting `yield*`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const walkExpressions = (ctx: ReverseCtx, node: Node): void => {
  unqualify(ctx, node)
  for (const child of children(node)) walkExpressions(ctx, child)
}

/** `new E(…)` where `E` becomes an `error` declaration: the forward compiler yields it directly. */
const isOwnError = (ctx: ReverseCtx, node: Node): boolean =>
  node.type === "NewExpression" && node.callee.type === "Identifier" && ctx.errors.has(node.callee.name)

/**
 * `yield* e` → `await e`; `return yield* Effect.fail(e)` / `return yield* new E(…)` → `throw …`,
 * exactly where the forward compiler lowers `throw` to those shapes.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertBody = (ctx: ReverseCtx, node: Node): void => {
  if (nestedScopes.has(node.type)) return walkExpressions(ctx, node)
  if (node.type === "ReturnStatement" && node.argument?.type === "YieldExpression" && node.argument.delegate) {
    const target: Node = node.argument.argument
    if (
      target.type === "CallExpression" && isMember(target.callee, ctx.effect, "fail") &&
      target.arguments.length === 1 && !isOwnError(ctx, target.arguments[0])
    ) {
      const error: Node = target.arguments[0]
      ctx.s.update(node.start, error.start, "throw ")
      ctx.s.remove(error.end, node.argument.end)
      return convertBody(ctx, error)
    }
    if (isOwnError(ctx, target)) {
      ctx.s.update(node.start, target.start, "throw ")
      return convertBody(ctx, target)
    }
  }
  if (node.type === "YieldExpression") {
    if (!node.delegate) return
    ctx.s.update(node.start, node.start + "yield*".length, "await")
  }
  unqualify(ctx, node)
  for (const child of children(node)) convertBody(ctx, child)
}
