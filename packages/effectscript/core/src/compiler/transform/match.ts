/**
 * `match (x) { when … }` → `Match.valueTags` (all tag arms, no default) or `Match.value(x).pipe(…)`.
 * Inside `effect` code with effectful arms, every arm returns an `Effect.gen` and the match is yielded.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withEffect } from "../context.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { isEffectful } from "./try.ts"

const tagName = (tag: Node): string => (tag.type === "MemberExpression" ? tag.property.name : tag.name)

const bindingText = (ctx: Ctx, pattern: Node | null): string =>
  pattern?.type === "TagPattern" && pattern.binding !== null
    ? ctx.source.slice(pattern.binding.start, pattern.binding.end)
    : ""

const sameLine = (ctx: Ctx, from: number, to: number): boolean => !ctx.source.slice(from, to).includes("\n")

const matchExpression: Handler = (node, _parent, ctx) => {
  const arms: Array<Node> = node.arms
  ctx.imports.need("effect", "Match")
  const generator = ctx.effect !== undefined && arms.some((arm) => isEffectful(arm.body))
  if (generator) {
    ctx.imports.need("effect", "Effect")
    ctx.s.appendRight(node.start, "(yield* ")
    ctx.s.prependLeft(node.end, ")")
  }
  const tagsOnly = arms.every((arm) => arm.pattern?.type === "TagPattern")
  const hasDefault = arms.some((arm) => arm.pattern === null)
  const brace = ctx.source.indexOf("{", node.discriminant.end)
  const inline = sameLine(ctx, node.discriminant.end, arms[0]!.start)
  ctx.s.update(node.start, node.discriminant.start, tagsOnly ? "Match.valueTags(" : "Match.value(")
  ctx.s.update(
    node.discriminant.end,
    inline ? arms[0]!.start : brace + 1,
    tagsOnly ? (inline ? ", { " : ", {") : ").pipe("
  )
  arms.forEach((arm, i) => {
    const binding = bindingText(ctx, arm.pattern)
    const [open, close] = generator
      ? [`(${binding}) => Effect.gen(function*() { return `, " })"]
      : [`(${binding}) => `, ""]
    const pattern: Node | null = arm.pattern
    const head = tagsOnly
      ? `${tagName(pattern!.tag)}: ${open}`
      : pattern === null
      ? `Match.orElse(${open}`
      : pattern.type === "TagPattern"
      ? `Match.tag(${JSON.stringify(tagName(pattern.tag))}, ${open}`
      : `Match.when(${ctx.source.slice(pattern.value.start, pattern.value.end)}, ${open}`
    const tail = tagsOnly ? close : `${close})`
    const last = i === arms.length - 1
    const separator = last ? (!tagsOnly && !hasDefault ? ", Match.exhaustive" : "") : ","
    ctx.s.update(arm.start, arm.body.start, head)
    if (arm.end > arm.body.end) ctx.s.update(arm.body.end, arm.end, `${tail}${separator}`)
    else ctx.s.appendLeft(arm.body.end, `${tail}${separator}`)
  })
  const lastArm = arms[arms.length - 1]!
  if (sameLine(ctx, lastArm.end, node.end - 1)) ctx.s.update(lastArm.end, node.end, tagsOnly ? " })" : ")")
  else ctx.s.update(node.end - 1, node.end, tagsOnly ? "})" : ")")
  walk(node.discriminant, node, ctx)
  for (const arm of arms) {
    if (generator) walk(arm.body, arm, ctx)
    else withEffect(ctx, undefined, () => walk(arm.body, arm, ctx))
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const matchHandlers: HandlerGroup = {
  MatchExpression: matchExpression
}
