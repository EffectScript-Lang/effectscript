/**
 * Generator bodies: `yield*` → `await`, failures → `throw`, `Effect.x` → builtin `x`, each exactly
 * where the forward compiler lowers back to the same text (ADR-0030).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { excludedNames, namespaceExports, preludeFunctions, preludeModules } from "../prelude/tables.ts"
import { isParenthesized } from "../transform/await.ts"
import { convertAmbient } from "./ambient.ts"
import { commentsIn, removeKeepingComments, type ReverseCtx } from "./context.ts"
import { convertMatch, matchShape } from "./match.ts"
import { importedLocal, isMember } from "./origin.ts"
import { inPosition, pipeShape } from "./pipes.ts"
import { convertFinalizer } from "./resources.ts"
import { convertTry } from "./try.ts"

/**
 * Recursion back into the walker: `generator` is true at a generator body's direct level.
 *
 * @since 4.0.0
 * @category models
 */
export type Visit = (node: Node, parent: Node | undefined, generator: boolean) => void

/**
 * Whether the builtin `name` can be written unqualified: the forward compiler resolves it to
 * `Effect.name` (spec §4.13).
 *
 * @since 4.0.0
 * @category reverse
 */
export const isBuiltin = (ctx: ReverseCtx, name: string): boolean => {
  if (ctx.effect !== "Effect" || !ctx.options.prelude) return false
  if (excludedNames.has(name) || preludeModules.has(name) || preludeFunctions.has(name)) return false
  return namespaceExports.get("Effect")!.has(name) && isFree(ctx, name)
}

/**
 * `name` as EffectScript writes it: the builtin, or qualified with the `Effect` import.
 *
 * @since 4.0.0
 * @category reverse
 */
export const builtin = (ctx: ReverseCtx, name: string): string => isBuiltin(ctx, name) ? name : `${ctx.effect}.${name}`

/** Constructors of the forms that become `effect` syntax: when one stays TypeScript, it stays qualified. */
const formNames = new Set(["fn", "fnUntraced", "gen"])

/**
 * `Effect.x` → `x` for builtins.
 *
 * @since 4.0.0
 * @category reverse
 */
export const unqualify = (ctx: ReverseCtx, node: Node): void => {
  if (node.type !== "MemberExpression" || node.optional === true) return
  if (ctx.namespace !== "Effect") {
    // in a `layer` or `atom`, a bare name resolves to `Layer.name` / `Atom.name` (spec §4.14)
    const local = ctx.namespace === "Layer"
      ? ctx.layer
      : ctx.namespace === "Atom"
      ? importedLocal(ctx.analysis, "effect/reactivity", "Atom")
      : importedLocal(ctx.analysis, "effect/cli", "Command")
    if (!isMember(node, local)) return
    const name: string = node.property.name
    const exports = namespaceExports.get(ctx.namespace)!
    if (ctx.options.prelude && !excludedNames.has(name) && exports.has(name) && isFree(ctx, name)) {
      ctx.s.remove(node.start, node.property.start)
    }
    return
  }
  if (!isMember(node, ctx.effect) || formNames.has(node.property.name)) return
  if (isBuiltin(ctx, node.property.name)) ctx.s.remove(node.start, node.property.start)
}

const isFree = (ctx: ReverseCtx, name: string): boolean => {
  const { innerBound, module } = ctx.analysis
  return !innerBound.has(name) && !module.values.has(name) && !module.types.has(name)
}

/**
 * Parents where `await x` parses like `(yield* x)` and the forward compiler restores the
 * parentheses (`needsParens`). Member objects, callees and `!` would re-parse differently.
 */
const droppableParens = (node: Node, parent: Node | undefined): boolean => {
  switch (parent?.type) {
    case "BinaryExpression":
      return parent.operator !== "**"
    case "LogicalExpression":
    case "UnaryExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      return true
    case "ConditionalExpression":
      return parent.test === node
    default:
      return false
  }
}

/** `new E(…)` where `E` becomes an `error` declaration: the forward compiler yields it directly. */
const isOwnError = (ctx: ReverseCtx, node: Node): boolean =>
  node.type === "NewExpression" && node.callee.type === "Identifier" && ctx.errors.has(node.callee.name)

const failure = (ctx: ReverseCtx, target: Node): Node | undefined => {
  if (isOwnError(ctx, target)) return target
  if (
    target.type === "CallExpression" && isMember(target.callee, ctx.effect, "fail") && target.arguments.length === 1
  ) {
    const error: Node = target.arguments[0]
    // `throw <primitive>` is an error inside `effect` code (EFX8004): those stay `await fail(…)`
    const primitive = (error.type === "Literal" && error.regex === undefined) || error.type === "TemplateLiteral"
    if (!isOwnError(ctx, error) && error.type !== "SpreadElement" && !primitive) return error
  }
  return undefined
}

const parenRange = (ctx: ReverseCtx, node: Node): { readonly open: number; readonly close: number } | undefined => {
  if (!isParenthesized(ctx.source, node)) return undefined
  let open = node.start - 1
  while (/\s/.test(ctx.source[open]!)) open--
  let close = node.end
  while (/\s/.test(ctx.source[close]!)) close++
  return { open, close }
}

/**
 * Handles one node at a generator's direct level. Returns true when it walked the children itself.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertGeneratorNode = (ctx: ReverseCtx, node: Node, parent: Node | undefined, visit: Visit): boolean => {
  // `return yield* Effect.fail(e)` / `return yield* new E(…)` → `throw …` (the forward `throw` lowering)
  if (node.type === "ReturnStatement" && node.argument?.type === "YieldExpression" && node.argument.delegate) {
    const yielded: Node = node.argument
    const error = failure(ctx, yielded.argument)
    if (error !== undefined && ctx.source.slice(node.start, yielded.argument.start) === "return yield* ") {
      ctx.s.update(node.start, error.start, "throw ")
      removeKeepingComments(ctx, error.end, yielded.end)
      visit(error, node, true)
      return true
    }
  }
  if (ctx.deferAllowed && node.type === "ExpressionStatement" && convertFinalizer(ctx, node, visit)) return true
  if ((node.type === "ReturnStatement" || node.type === "ExpressionStatement") && convertTry(ctx, node, visit)) {
    return true
  }
  if (node.type !== "YieldExpression" || !node.delegate) return false
  if (convertAmbient(ctx, node, parent, visit)) return true
  const argument: Node = node.argument
  const parens = parenRange(ctx, node)
  // `(yield* Match…(… Effect.gen(…) …))` → `match (…) { … }` with awaiting arms
  if (parens !== undefined) {
    const shape = matchShape(ctx, argument, true)
    if (shape !== undefined && convertMatch(ctx, shape, [parens.open, parens.close + 1], visit, true)) return true
  }
  // `(yield* Effect.fail(e))` in expression position → the throw expression
  const statement = parent?.type === "ReturnStatement" || parent?.type === "ExpressionStatement"
  const error = parens !== undefined && !statement ? failure(ctx, argument) : undefined
  if (error !== undefined && commentsIn(ctx, parens!.open, error.start).length === 0) {
    ctx.s.update(parens!.open, error.start, "throw ")
    ctx.s.remove(error.end, parens!.close + 1)
    visit(error, node, true)
    return true
  }
  // `yield* Effect.all([..] | {..}, { concurrency: "unbounded" })` → `await [..]` / `await {..}`
  const all = argument.type === "CallExpression" && isMember(argument.callee, ctx.effect, "all") &&
      argument.arguments.length === 2 &&
      (argument.arguments[0].type === "ArrayExpression" || argument.arguments[0].type === "ObjectExpression") &&
      ctx.source.slice(argument.arguments[0].end, argument.end) === ", { concurrency: \"unbounded\" })"
    ? argument.arguments[0] as Node
    : undefined
  if (all !== undefined) {
    ctx.s.update(node.start, all.start, "await ")
    ctx.s.remove(all.end, argument.end)
  } else {
    ctx.s.update(node.start, node.start + "yield*".length, "await")
  }
  // parentheses the forward compiler puts back (`x + (yield* t)` ← `x + await t`) are dropped,
  // unless the argument becomes a pipeline or `match`, which bind looser than `await`
  const loose = pipeShape(ctx, argument, node, ctx.topics) !== undefined ||
    (inPosition(argument, node) && matchShape(ctx, argument, false) !== undefined)
  if (
    parens !== undefined && droppableParens(node, parent) && !loose &&
    !ctx.source.slice(parens.open, parens.close + 1).includes("\n") &&
    commentsIn(ctx, parens.open, node.start).length === 0 && commentsIn(ctx, node.end, parens.close).length === 0
  ) {
    ctx.s.remove(parens.open, parens.open + 1)
    ctx.s.remove(parens.close, parens.close + 1)
  }
  visit(all ?? argument, node, true)
  return true
}
