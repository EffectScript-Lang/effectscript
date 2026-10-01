/**
 * TC39 throw expressions and do expressions.
 *
 * @since 0.1.0
 */
import { containsThis, type Node } from "../ast.ts"
import { type Ctx, type Handler, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { containsAtLevel, findCrossingJump, isEffectful } from "./try.ts"

const throwExpression: Handler = (node, _parent, ctx) => {
  const argument: Node = node.argument
  if (ctx.effect === undefined) {
    ctx.s.update(node.start, argument.start, "(() => { throw ")
    ctx.s.appendLeft(argument.end, " })()")
    return
  }
  if (
    argument.type === "NewExpression" && argument.callee.type === "Identifier" &&
    ctx.analysis.localErrors.has(argument.callee.name)
  ) {
    ctx.s.update(node.start, node.start + 5, "(yield*")
    ctx.s.appendLeft(argument.end, ")")
  } else {
    ctx.imports.need("effect", "Effect")
    ctx.s.update(node.start, argument.start, "(yield* Effect.fail(")
    ctx.s.appendLeft(argument.end, "))")
  }
}

/** Prepends `return ` to the completion statements of a block. */
const returnCompletion = (ctx: Ctx, node: Node | null | undefined): void => {
  if (node === null || node === undefined) return
  switch (node.type) {
    case "ExpressionStatement":
      ctx.s.appendRight(node.start, "return ")
      return
    case "BlockStatement":
      returnCompletion(ctx, node.body[node.body.length - 1])
      return
    case "IfStatement":
      returnCompletion(ctx, node.consequent)
      returnCompletion(ctx, node.alternate)
      return
  }
}

const doExpression: Handler = (node, _parent, ctx) => {
  const escape = containsAtLevel(node.body, (n) => n.type === "ReturnStatement")
    ? node.body
    : findCrossingJump(node.body)
  if (escape !== undefined) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX7001",
        "`return`, `break` and `continue` cannot escape a `do` expression",
        node.start,
        node.start + 2
      )
    )
  }
  returnCompletion(ctx, node.body)
  if (ctx.effect !== undefined && isEffectful(node.body)) {
    ctx.imports.need("effect", "Effect")
    ctx.s.update(
      node.start,
      node.body.start,
      `(yield* Effect.gen(${containsThis(node.body) ? "{ self: this }, " : ""}function*() `
    )
    ctx.s.appendLeft(node.end, "))")
    walk(node.body, node, ctx)
  } else {
    ctx.s.update(node.start, node.body.start, "(() => ")
    ctx.s.appendLeft(node.end, ")()")
    withEffect(ctx, undefined, () => walk(node.body, node, ctx))
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const proposalHandlers: HandlerGroup = {
  ThrowExpression: throwExpression,
  DoExpression: doExpression
}
