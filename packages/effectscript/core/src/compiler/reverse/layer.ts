/**
 * Top-level `layer` declarations (spec §4.14): `const X = Layer.mergeAll(a, b)` → `layer X = a & b`,
 * `const X = Layer.effectDiscard(Effect.gen(…))` → `layer X = effect { … }`, with pipes resolving
 * in the `Layer` namespace. The inverse of `transform/layer.ts`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, removeKeepingComments, type ReverseCtx, separatorComma, within } from "./context.ts"
import { isMember } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { inFrame } from "./resources.ts"
import { layerPipes } from "./service.ts"

/** Operands that read the same around `&` (it binds tighter than `|`, `&&`, `?:`…). */
const operandTypes = new Set(["Identifier", "MemberExpression", "CallExpression", "NewExpression"])

/**
 * Rewrites a top-level `Layer.mergeAll` / `Layer.effectDiscard` declaration. Returns false when it
 * isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertLayer = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  if (ctx.layer === undefined || statement.type !== "VariableDeclaration" || statement.kind !== "const") return false
  if (statement.declarations.length !== 1) return false
  const declarator: Node = statement.declarations[0]
  if (declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || declarator.init === null) return false
  let head: Node = declarator.init
  const pipe = head.type === "CallExpression" && head.callee.type === "MemberExpression" && !head.callee.computed &&
      head.callee.property.name === "pipe"
    ? head
    : undefined
  if (pipe !== undefined) {
    if (pipe.arguments.length === 0 || !(pipe.arguments as Array<Node>).every((a) => isPlainStep(a))) return false
    head = pipe.callee.object
  }
  if (head.type !== "CallExpression" || statement.end !== declarator.init.end) return false
  if (commentsIn(ctx, statement.start, head.start).length > 0) return false
  const args: Array<Node> = head.arguments
  // `Layer.mergeAll(a, b)` → `a & b`
  if (isMember(head.callee, ctx.layer, "mergeAll")) {
    if (args.length < 2 || !args.every((a) => operandTypes.has(a.type))) return false
    if (ctx.source.slice(head.callee.end, args[0]!.start) !== "(") return false
    ctx.s.update(statement.start, statement.start + "const".length, "layer")
    ctx.s.remove(head.start, args[0]!.start)
    args.forEach((arg, i) => {
      visit(arg, head, false)
      const next = args[i + 1]
      if (next === undefined) return
      const comma = separatorComma(ctx, arg.end, next.start)
      // the forward compiler turns ` &` into `,` (or a bare `&` into `,` when no space precedes it)
      ctx.s.update(comma, comma + 1, comma === arg.end ? " &" : "&")
    })
    removeKeepingComments(ctx, args[args.length - 1]!.end, head.end)
  } else if (isMember(head.callee, ctx.layer, "effectDiscard") && args.length === 1) {
    // `Layer.effectDiscard(Effect.gen(…))` → `effect { … }`, a layer constructor (defer, no scope)
    const shape = genShape(ctx, args[0]!, head)
    if (shape === undefined || !("fn" in shape) || ctx.source.slice(head.callee.end, args[0]!.start) !== "(") {
      return false
    }
    ctx.s.update(statement.start, statement.start + "const".length, "layer")
    ctx.s.remove(head.start, args[0]!.start)
    ctx.s.update(args[0]!.start, shape.fn.body.start, "effect ")
    ctx.s.remove(shape.fn.body.end, head.end)
    within(ctx, "Effect", () => inFrame(ctx, true, () => visit(shape.fn.body, shape.fn, true)))
  } else {
    return false
  }
  if (pipe !== undefined) layerPipes(ctx, pipe, head, visit)
  return true
}
