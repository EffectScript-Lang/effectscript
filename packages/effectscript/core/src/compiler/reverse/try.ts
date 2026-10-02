/**
 * The ADR-0010 `try` lowering back to `try … catch … finally`:
 *
 * ```ts
 * [return ]yield* Effect.gen(function*() B).pipe(
 *   [Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect))),]
 *   Effect.catch(h) | Effect.catchTags({ T: h, … }[, h]) | Effect.catchTag(tags, h[, (error) => Effect.catchTag(Effect.fail(error), …) | h]),
 *   [Effect.ensuring(Effect.gen(function*() F))]
 * )
 * ```
 *
 * Each handler is `(param) => Effect.gen(function*() C)`. Recognition mirrors the forward choices
 * (grouping, the defect prelude, `return`), so the result compiles back to the same text.
 *
 * @since 4.0.0
 */
import { containsThis, type Node } from "../ast.ts"
import { alwaysExits, containsAtLevel } from "../transform/try.ts"
import { blocker, isGenerator } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, removeKeepingComments, replaceKeepingComments, type ReverseCtx, slice } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"

interface Clause {
  /** The `_tag`s caught, or `undefined` for the untyped clause. */
  readonly tags: ReadonlyArray<string> | undefined
  readonly handler: Node
  readonly fn: Node
}

interface TryShape {
  readonly statement: Node
  readonly block: Node
  readonly clauses: ReadonlyArray<Clause>
  readonly finalizer: Node | undefined
  /** Every `Effect.gen` of the shape, for the blocker and `{ self: this }` checks. */
  readonly gens: ReadonlyArray<Node>
  /** Generated binder names the shape uses (`defect`, `error`). */
  readonly binders: ReadonlyArray<Node>
}

const genOf = (ctx: ReverseCtx, node: Node | undefined): Node | undefined => {
  if (node?.type !== "CallExpression" || !isMember(node.callee, ctx.effect, "gen")) return undefined
  const args: Array<Node> = node.arguments
  const fn = args[args.length - 1]
  if (!isGenerator(fn) || fn!.params.length > 0 || fn!.returnType) return undefined
  if (args.length === 2 && !/^\{\s*self:\s*this\s*\}$/.test(slice(ctx, args[0]!))) return undefined
  return args.length <= 2 ? fn : undefined
}

const hasSelf = (gen: Node, call: Node): boolean => call.arguments.length === 2 && call.arguments[1] === gen

/** `(param) => Effect.gen(function*() { … })` */
const handlerOf = (ctx: ReverseCtx, node: Node | undefined): { handler: Node; fn: Node; call: Node } | undefined => {
  if (node?.type !== "ArrowFunctionExpression" || node.async || node.params.length > 1) return undefined
  const fn = genOf(ctx, node.body)
  return fn === undefined ? undefined : { handler: node, fn, call: node.body }
}

const tagsOf = (node: Node | undefined): Array<string> | undefined => {
  if (node?.type === "Literal" && typeof node.value === "string") return [node.value]
  if (node?.type !== "ArrayExpression" || node.elements.length < 2) return undefined
  const tags = (node.elements as Array<Node>).map((
    e
  ) => (e?.type === "Literal" && typeof e.value === "string" ? e.value : undefined))
  return tags.every((t) => t !== undefined) ? tags as Array<string> : undefined
}

/** `(error) => Effect.catchTag(Effect.fail(error), tags, h[, rest])` → the clauses it holds. */
const chainOf = (ctx: ReverseCtx, node: Node, binders: Array<Node>): Array<Clause> | undefined => {
  if (node.type !== "ArrowFunctionExpression" || node.params.length !== 1 || node.params[0].type !== "Identifier") {
    return undefined
  }
  const error: Node = node.params[0]
  // the forward compiler names it `unused(ctx, "error")`; see `ReverseCtx.binders`
  if (error.name !== "error") return undefined
  const call: Node = node.body
  if (call.type !== "CallExpression" || !isMember(call.callee, ctx.effect, "catchTag")) return undefined
  const [failed, tagArg, handler, rest]: Array<Node> = call.arguments
  if (
    failed?.type !== "CallExpression" || !isMember(failed.callee, ctx.effect, "fail") ||
    failed.arguments.length !== 1 || failed.arguments[0].type !== "Identifier" ||
    failed.arguments[0].name !== error.name || call.arguments.length > 4
  ) {
    return undefined
  }
  binders.push(error, failed.arguments[0])
  return clausesFrom(ctx, tagArg, handler, rest, binders)
}

const clausesFrom = (
  ctx: ReverseCtx,
  tagArg: Node | undefined,
  handler: Node | undefined,
  rest: Node | undefined,
  binders: Array<Node>
): Array<Clause> | undefined => {
  const tags = tagsOf(tagArg)
  const first = handlerOf(ctx, handler)
  if (tags === undefined || first === undefined || first.handler.params.length !== 1) return undefined
  const clauses: Array<Clause> = [{ tags, handler: first.handler, fn: first.fn }]
  if (rest === undefined) return clauses
  const chained = chainOf(ctx, rest, binders)
  if (chained !== undefined) return [...clauses, ...chained]
  const fallback = handlerOf(ctx, rest)
  return fallback === undefined
    ? undefined
    : [...clauses, { tags: undefined, handler: fallback.handler, fn: fallback.fn }]
}

const isIdentifierName = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name)

/** `Effect.catchDefect((defect) => Effect.fail(new Cause.UnknownError(defect)))` */
const isDefectPrelude = (ctx: ReverseCtx, node: Node, binders: Array<Node>): boolean => {
  if (
    node.type !== "CallExpression" || !isMember(node.callee, ctx.effect, "catchDefect") || node.arguments.length !== 1
  ) {
    return false
  }
  const arrow: Node = node.arguments[0]
  if (
    arrow.type !== "ArrowFunctionExpression" || arrow.params.length !== 1 || arrow.params[0].type !== "Identifier" ||
    arrow.params[0].name !== "defect"
  ) {
    return false
  }
  const fail: Node = arrow.body
  if (fail.type !== "CallExpression" || !isMember(fail.callee, ctx.effect, "fail") || fail.arguments.length !== 1) {
    return false
  }
  const created: Node = fail.arguments[0]
  const cause = importedLocal(ctx.analysis, "effect", "Cause")
  const ok = created.type === "NewExpression" && isMember(created.callee, cause, "UnknownError") &&
    created.arguments.length === 1 && created.arguments[0].type === "Identifier" &&
    created.arguments[0].name === arrow.params[0].name
  if (ok) binders.push(arrow.params[0], created.arguments[0])
  return ok
}

/**
 * Recognizes the lowering in a generator-level statement.
 *
 * @since 4.0.0
 * @category reverse
 */
export const tryShape = (ctx: ReverseCtx, statement: Node): TryShape | undefined => {
  const expression: Node | null | undefined = statement.type === "ReturnStatement"
    ? statement.argument
    : statement.type === "ExpressionStatement"
    ? statement.expression
    : undefined
  if (expression?.type !== "YieldExpression" || !expression.delegate) return undefined
  const call: Node = expression.argument
  if (
    call.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.computed ||
    call.callee.property.name !== "pipe" || call.arguments.length === 0
  ) {
    return undefined
  }
  const blockGen: Node = call.callee.object
  const blockFn = genOf(ctx, blockGen)
  if (blockFn === undefined) return undefined
  const args: Array<Node> = [...call.arguments]
  const binders: Array<Node> = []
  const defect = isDefectPrelude(ctx, args[0]!, binders)
  if (defect) args.shift()
  let finalizer: Node | undefined
  const last = args[args.length - 1]
  if (last !== undefined && last.type === "CallExpression" && isMember(last.callee, ctx.effect, "ensuring")) {
    finalizer = last.arguments.length === 1 ? genOf(ctx, last.arguments[0]) : undefined
    if (finalizer === undefined) return undefined
    args.pop()
  }
  if (args.length > 1) return undefined
  let clauses: Array<Clause> = []
  let grouped = false
  const handlerCall: Node | undefined = args[0]
  if (handlerCall !== undefined) {
    if (handlerCall.type !== "CallExpression") return undefined
    const [a, b, c]: Array<Node> = handlerCall.arguments
    if (isMember(handlerCall.callee, ctx.effect, "catch") && handlerCall.arguments.length === 1) {
      const only = handlerOf(ctx, a)
      if (only === undefined) return undefined
      clauses = [{ tags: undefined, handler: only.handler, fn: only.fn }]
    } else if (isMember(handlerCall.callee, ctx.effect, "catchTags") && a?.type === "ObjectExpression") {
      grouped = true
      for (const property of a.properties as Array<Node>) {
        if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) {
          return undefined
        }
        const tag = property.key.type === "Identifier" ? property.key.name : property.key.value
        const handler = handlerOf(ctx, property.value)
        if (typeof tag !== "string" || handler === undefined || handler.handler.params.length !== 1) return undefined
        clauses.push({ tags: [tag], handler: handler.handler, fn: handler.fn })
      }
      if (b !== undefined) {
        const fallback = handlerOf(ctx, b)
        if (fallback === undefined || handlerCall.arguments.length > 2) return undefined
        clauses.push({ tags: undefined, handler: fallback.handler, fn: fallback.fn })
      }
    } else if (isMember(handlerCall.callee, ctx.effect, "catchTag") && handlerCall.arguments.length <= 3) {
      const found = clausesFrom(ctx, a, b, c, binders)
      if (found === undefined) return undefined
      clauses = found
    } else {
      return undefined
    }
  }
  if (clauses.length === 0 && finalizer === undefined) return undefined
  // the forward choices: grouping, the defect prelude
  const typed = clauses.filter((c) => c.tags !== undefined)
  const shouldGroup = typed.length > 1 && typed.every((c) => c.tags!.length === 1)
  if (grouped !== shouldGroup) return undefined
  const untyped = clauses.length > 0 && clauses[clauses.length - 1]!.tags === undefined
  if (clauses.slice(0, -1).some((c) => c.tags === undefined)) return undefined
  const catchesDefects = untyped || typed.some((c) => c.tags!.includes("UnknownError"))
  if (defect !== catchesDefects) return undefined
  const fns = [blockFn, ...clauses.map((c) => c.fn), ...(finalizer === undefined ? [] : [finalizer])]
  return {
    statement,
    block: blockFn,
    clauses,
    finalizer,
    gens: fns,
    binders
  }
}

/** The type a clause writes for a tag: a module class with that tag, else the tag itself. */
const typeFor = (ctx: ReverseCtx, tag: string): string | undefined => {
  for (const [name, classTag] of ctx.analysis.localTags) if (classTag === tag) return name
  if (!isIdentifierName(tag)) return undefined
  // a module type of that name with another tag would make the clause catch something else
  return ctx.analysis.module.types.has(tag) ? undefined : tag
}

/**
 * Rewrites a `try` lowering. Returns false (leaving it to the generic walk) when it doesn't match.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertTry = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  if (ctx.tryDisabled) return false
  const shape = tryShape(ctx, statement)
  if (shape === undefined) return false
  // `{ self: this }` on every generated generator exactly when the `try` uses `this`
  const usesThis = shape.gens.some((fn) => containsThis(fn.body))
  const calls = shape.gens.map((fn) => findCall(statement, fn))
  if (calls.some((call, i) => call === undefined || hasSelf(shape.gens[i]!, call) !== usesThis)) return false
  if (shape.gens.some((fn) => blocker(fn, "block", ctx) !== undefined)) return false
  // `return` on every path or none (EFX2020); never in `finally` (EFX2021)
  const bodies = [shape.block, ...shape.clauses.map((c) => c.fn)].map((fn) => fn.body as Node)
  const isReturn = (n: Node) => n.type === "ReturnStatement"
  const anyReturn = bodies.some((b) => containsAtLevel(b, isReturn))
  const allExit = bodies.every((b) => alwaysExits(b))
  if ((statement.type === "ReturnStatement") !== (anyReturn && allExit) || (anyReturn && !allExit)) return false
  if (shape.finalizer !== undefined && containsAtLevel(shape.finalizer.body, isReturn)) return false
  // clause parameters and types
  const heads: Array<string> = []
  for (const clause of shape.clauses) {
    const param: Node | undefined = clause.handler.params[0]
    if (clause.tags === undefined) {
      if (param?.typeAnnotation?.typeAnnotation?.type === "TSAnyKeyword") return false // EFX8005
      heads.push(param === undefined ? " catch " : ` catch (${slice(ctx, param)}) `)
      continue
    }
    const types = clause.tags.map((tag) => typeFor(ctx, tag))
    if (types.some((t) => t === undefined) || param?.typeAnnotation) return false
    heads.push(` catch (${slice(ctx, param!)}: ${types.join(" | ")}) `)
  }
  for (const binder of shape.binders) ctx.binders.add(binder)
  // rewrite
  const yielded: Node = statement.type === "ReturnStatement" ? statement.argument : statement.expression
  replaceKeepingComments(ctx, statement.start, shape.block.body.start, "try ")
  let previousEnd: number = shape.block.body.end
  shape.clauses.forEach((clause, i) => {
    replaceKeepingComments(ctx, previousEnd, clause.fn.body.start, heads[i]!)
    previousEnd = clause.fn.body.end
  })
  if (shape.finalizer !== undefined) {
    replaceKeepingComments(ctx, previousEnd, shape.finalizer.body.start, " finally ")
    previousEnd = shape.finalizer.body.end
  }
  if (commentsIn(ctx, previousEnd, yielded.end).length > 0) removeKeepingComments(ctx, previousEnd, yielded.end)
  else ctx.s.remove(previousEnd, yielded.end)
  for (const fn of shape.gens) visit(fn.body, fn, true)
  return true
}

const findCall = (root: Node, fn: Node): Node | undefined => {
  if (root.type === "CallExpression" && (root.arguments as Array<Node>).includes(fn)) return root
  for (const key in root) {
    const value = root[key]
    const nodes = Array.isArray(value) ? value : [value]
    for (const child of nodes) {
      if (child === null || typeof child !== "object" || typeof child.type !== "string" || key === "loc") continue
      const found = findCall(child, fn)
      if (found !== undefined) return found
    }
  }
  return undefined
}
