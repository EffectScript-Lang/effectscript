/**
 * `yield* Effect.addFinalizer(…)` → `defer`, in frames whose scope the forward compiler adds back:
 * the `Effect.scoped` first pipe of a declaration/arrow/method, the `Effect.scoped(…)` wrapper of a
 * block, or a layer constructor.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { atLevel, blocker, genShape, isGenerator } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { removeKeepingComments, replaceKeepingComments, type ReverseCtx } from "./context.ts"
import { isMember } from "./origin.ts"

type Finalizer =
  | { readonly kind: "expression"; readonly value: Node }
  | { readonly kind: "sync"; readonly block: Node }
  | { readonly kind: "effect"; readonly block: Node; readonly fn: Node }

const isThunk = (node: Node | undefined): boolean =>
  node?.type === "ArrowFunctionExpression" && node.params.length === 0 && node.async !== true

/** Statements that make a `defer { … }` block effectful in the forward compiler (`isEffectful`). */
const effectfulInEfx = (block: Node): boolean =>
  atLevel(
    block,
    (n) => (n.type === "YieldExpression" && n.delegate) || n.type === "ThrowStatement" || n.type === "TryStatement"
  ) !== undefined

/**
 * The `defer` a statement converts to, or `undefined`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const finalizerShape = (ctx: ReverseCtx, statement: Node): Finalizer | undefined => {
  if (statement.type !== "ExpressionStatement") return undefined
  const yielded: Node = statement.expression
  if (yielded.type !== "YieldExpression" || !yielded.delegate) return undefined
  const call: Node = yielded.argument
  if (call.type !== "CallExpression" || !isMember(call.callee, ctx.effect, "addFinalizer")) return undefined
  const thunk: Node | undefined = call.arguments.length === 1 ? call.arguments[0] : undefined
  if (!isThunk(thunk) || thunk!.body.type === "BlockStatement") return undefined
  const value: Node = thunk!.body
  if (value.type === "ObjectExpression") return undefined
  if (value.type === "CallExpression" && value.arguments.length === 1) {
    const inner: Node = value.arguments[0]
    if (isMember(value.callee, ctx.effect, "sync") && isThunk(inner) && inner.body.type === "BlockStatement") {
      // a block with `throw`/`try` would compile as an effect, so it stays an expression finalizer
      if (!effectfulInEfx(inner.body)) return { kind: "sync", block: inner.body }
    }
    const gen = genShape(ctx, value, thunk)
    if (gen !== undefined && "fn" in gen && value.arguments.length === 1 && effectfulInEfx(gen.fn.body)) {
      return { kind: "effect", block: gen.fn.body, fn: gen.fn }
    }
  }
  return { kind: "expression", value }
}

/**
 * Whether a generator body has a finalizer at its level that becomes `defer`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const hasFinalizer = (ctx: ReverseCtx, body: Node): boolean =>
  atLevel(body, (n) => finalizerShape(ctx, n) !== undefined) !== undefined

/**
 * Rewrites a finalizer statement as `defer`. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertFinalizer = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  const shape = finalizerShape(ctx, statement)
  if (shape === undefined) return false
  const end: number = statement.expression.end
  switch (shape.kind) {
    case "expression":
      replaceKeepingComments(ctx, statement.start, shape.value.start, "defer ")
      removeKeepingComments(ctx, shape.value.end, end)
      visit(shape.value, statement, false)
      return true
    case "sync":
      replaceKeepingComments(ctx, statement.start, shape.block.start, "defer ")
      removeKeepingComments(ctx, shape.block.end, end)
      visit(shape.block, statement, false)
      return true
    case "effect": {
      replaceKeepingComments(ctx, statement.start, shape.block.start, "defer ")
      removeKeepingComments(ctx, shape.block.end, end)
      const allowed = ctx.deferAllowed
      ctx.deferAllowed = false
      visit(shape.block, shape.fn, true)
      ctx.deferAllowed = allowed
      return true
    }
  }
}

/**
 * Runs `f` with `defer` allowed or not in the frame it visits.
 *
 * @since 4.0.0
 * @category reverse
 */
export const inFrame = (ctx: ReverseCtx, deferAllowed: boolean, f: () => void): void => {
  const previous = ctx.deferAllowed
  ctx.deferAllowed = deferAllowed
  f()
  ctx.deferAllowed = previous
}

/**
 * `const f = Effect.fn("f")(function*…)` that becomes a pipe-less `effect` declaration (the forward
 * `localEffects`). Without `checkBlockers`, the shape alone (the candidates).
 *
 * @since 4.0.0
 * @category reverse
 */
export const effectDeclarationName = (
  info: ReverseCtx,
  statement: Node,
  checkBlockers: boolean
): string | undefined => {
  if (statement.type !== "VariableDeclaration" || statement.kind !== "const" || statement.declarations.length !== 1) {
    return undefined
  }
  const declarator: Node = statement.declarations[0]
  const call: Node | null = declarator.init
  if (declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || call?.type !== "CallExpression") {
    return undefined
  }
  const head: Node = call.callee
  if (head.type !== "CallExpression" || !isMember(head.callee, info.effect, "fn")) return undefined
  const span: Node | undefined = head.arguments[0]
  if (head.arguments.length !== 1 || span?.type !== "Literal" || span.value !== declarator.id.name) return undefined
  const fn: Node = call.arguments[0]
  if (!isGenerator(fn)) return undefined
  // `Effect.scoped` is the forward compiler's own pipe for a body with `defer`
  const scoped = call.arguments.length === 2 && isMember(call.arguments[1], info.effect, "scoped") &&
    hasFinalizer(info, fn.body)
  if (call.arguments.length !== 1 && !scoped) return undefined
  return !checkBlockers || blocker(fn, "declaration", info) === undefined ? declarator.id.name : undefined
}
