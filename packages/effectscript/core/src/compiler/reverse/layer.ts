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
import { commentsIn, endsAt, removeKeepingComments, type ReverseCtx, separatorComma, within } from "./context.ts"
import { isMember } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { inFrame } from "./resources.ts"
import { layerPipes, layerPlan } from "./service.ts"

/** `Name` or `Module.Name`: a service tag a `layer … for` names (ADR-0303). */
const isTagReference = (node: Node): boolean =>
  node.type === "Identifier" ||
  (node.type === "MemberExpression" && !node.computed && node.optional !== true && isTagReference(node.object))

/**
 * `const X = Layer.effect(S, Effect.gen(…))`, `Layer.succeed(S, S.of({ … }))` or `Layer.effect(S, value)`
 * → `layer X for S = …` (ADR-0303), exactly where the forward compiler gives the same code back.
 */
const convertServiceLayer = (ctx: ReverseCtx, statement: Node, declarator: Node, head: Node, visit: Visit): boolean => {
  const args: Array<Node> = head.arguments
  const effect = isMember(head.callee, ctx.layer, "effect")
  if ((!effect && !isMember(head.callee, ctx.layer, "succeed")) || args.length !== 2 || !isTagReference(args[0]!)) {
    return false
  }
  const target: Node = args[0]!
  const name = ctx.source.slice(target.start, target.end)
  const span: string = target.type === "MemberExpression" ? target.property.name : target.name
  if (
    ctx.source.slice(head.callee.end, target.start) !== "(" || ctx.source.slice(target.end, args[1]!.start) !== ", "
  ) {
    return false
  }
  const inner: Node = args[1]!
  const genOrOf = genShape(ctx, inner, head) !== undefined || (inner.type === "CallExpression" &&
    inner.callee.type === "MemberExpression" && inner.callee.property?.name === "of")
  // `Layer.effect(S, value)`: the value is any other expression
  if (!genOrOf) {
    if (!effect || declarator.init !== head || inner.type === "ObjectExpression") return false
    ctx.s.update(statement.start, statement.start + "const".length, "layer")
    ctx.s.appendLeft(declarator.id.end, ` for ${name}`)
    ctx.s.remove(head.start, inner.start)
    ctx.s.remove(inner.end, head.end)
    within(ctx, "Layer", () => visit(inner, head, false))
    return true
  }
  // `Layer.succeed(S, …)` converts only as `S.of({ … })`; `layerPlan` checks the rest
  if (!effect && !(inner.type === "CallExpression" && inner.arguments[0]?.type === "ObjectExpression")) return false
  const plan = layerPlan(ctx, name, declarator.init, span)
  if (plan === undefined) return false
  ctx.s.update(statement.start, statement.start + "const".length, "layer")
  ctx.s.appendLeft(declarator.id.end, ` for ${name}`)
  plan(visit)
  return true
}

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
  if (head.type !== "CallExpression" || !endsAt(ctx, statement, declarator.init.end)) return false
  if (commentsIn(ctx, statement.start, head.start).length > 0) return false
  if (convertServiceLayer(ctx, statement, declarator, head, visit)) return true
  const args: Array<Node> = head.arguments
  // `Layer.mergeAll(a, b)` → `a & b`
  if (isMember(head.callee, ctx.layer, "mergeAll")) {
    if (args.length < 2 || !args.every((a) => operandTypes.has(a.type))) return false
    if (ctx.source.slice(head.callee.end, args[0]!.start) !== "(") return false
    ctx.s.update(statement.start, statement.start + "const".length, "layer")
    ctx.s.remove(head.start, args[0]!.start)
    args.forEach((arg, i) => {
      // operands resolve in the `Layer` namespace, as the forward compiler walks them
      within(ctx, "Layer", () => visit(arg, head, false))
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
