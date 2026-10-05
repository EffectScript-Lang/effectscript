/**
 * `where` checks back from `.check(…)` arguments (ADR-0077).
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { excludedNames, namespaceExports, schemaGlobalChecks } from "../prelude/tables.ts"
import type { ReverseCtx } from "./context.ts"
import { isMember } from "./origin.ts"
import type { Where } from "./types.ts"

/** Whether nothing in the file binds `name`, so the forward compiler resolves it. */
const isFree = (ctx: ReverseCtx, name: string): boolean => {
  const { innerBound, module } = ctx.analysis
  return !innerBound.has(name) && !module.values.has(name) && !module.types.has(name)
}

/**
 * A `Schema.x` reference the forward compiler would write bare in a schema expression.
 *
 * @since 4.0.0
 * @category reverse
 */
export const isBareable = (ctx: ReverseCtx, node: Node): boolean => {
  if (!isMember(node, ctx.schema) || node.optional === true) return false
  const name: string = node.property.name
  return isFree(ctx, name) && !excludedNames.has(name) && namespaceExports.get("Schema")!.has(name)
}

/**
 * A check's own `Schema.x`, which a `where` list writes bare: a bare-able reference, or a check
 * named like a JavaScript global (`isFinite`), which only a `where` list reads as the check.
 */
const isBareCheck = (ctx: ReverseCtx, node: Node): boolean =>
  isBareable(ctx, node) ||
  (isMember(node, ctx.schema) && node.optional !== true && schemaGlobalChecks.has(node.property.name) &&
    isFree(ctx, node.property.name))

/** The source text from `from` to `node`'s end, with the `Schema.` of each bare-able reference dropped. */
const textFrom = (ctx: ReverseCtx, node: Node, from: number): string => {
  const cuts: Array<readonly [number, number]> = []
  const visit = (n: Node): void => {
    if (n.start >= from && isBareable(ctx, n)) cuts.push([n.start, n.property.start])
    for (const child of children(n)) visit(child)
  }
  visit(node)
  cuts.sort((a, b) => a[0] - b[0])
  let text = ""
  let at = from
  for (const [start, end] of cuts) {
    text += ctx.source.slice(at, start)
    at = end
  }
  return text + ctx.source.slice(at, node.end)
}

/**
 * `node`'s source text with the `Schema.` of each bare-able reference dropped.
 *
 * @since 4.0.0
 * @category reverse
 */
export const bareText = (ctx: ReverseCtx, node: Node): string => textFrom(ctx, node, node.start)

/**
 * One check as a `where` list writes it: `isTrimmed` for `Schema.isTrimmed()` (ADR-0092), and
 * the call with `Schema.` dropped otherwise.
 */
const checkText = (ctx: ReverseCtx, check: Node): string => {
  const callee: Node | undefined = check.type === "CallExpression" && check.optional !== true &&
      check.typeArguments === undefined && check.typeParameters === undefined
    ? check.callee
    : undefined
  if (callee === undefined || !isBareCheck(ctx, callee)) return bareText(ctx, check)
  // a call without arguments, written `()`, drops it
  if (check.arguments.length === 0 && ctx.source.slice(callee.end, check.end) === "()") return callee.property.name
  return `${callee.property.name}${textFrom(ctx, check, callee.end)}`
}

/**
 * Renders `.check(…)` arguments as a `where` list, `a(1), b`, on one line as the forward compiler
 * writes them.
 *
 * @since 4.0.0
 * @category reverse
 */
export const renderChecks = (ctx: ReverseCtx): Where => (checks) =>
  checks.map((check) => checkText(ctx, check)).join(", ")
