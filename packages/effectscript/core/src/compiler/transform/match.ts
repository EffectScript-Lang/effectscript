/**
 * `match (x) { when … }` → `Match.valueTags` (all tag arms, no default) or `Match.value(x).pipe(…)`.
 * Inside `effect` code with effectful arms, every arm returns an `Effect.gen` and the match is yielded.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withEffect } from "../context.ts"
import { ref } from "../names.ts"
import { walk, walkInScopeOf } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { isEffectful } from "./try.ts"

const tagName = (tag: Node): string => (tag.type === "MemberExpression" ? tag.property.name : tag.name)

const sameLine = (ctx: Ctx, from: number, to: number): boolean => !ctx.source.slice(from, to).includes("\n")

const matchExpression: Handler = (node, _parent, ctx) => {
  const arms: Array<Node> = node.arms
  const M = ref(ctx, "effect", "Match")
  const generator = ctx.effect !== undefined && arms.some((arm) => isEffectful(arm.body))
  const E = generator ? ref(ctx, "effect", "Effect") : ""
  if (generator) {
    ctx.s.appendRight(node.start, "(yield* ")
    ctx.s.prependLeft(node.end, ")")
  }
  const tagsOnly = arms.every((arm) => arm.pattern?.type === "TagPattern")
  const hasDefault = arms.some((arm) => arm.pattern === null)
  const brace = ctx.source.indexOf("{", node.discriminant.end)
  const inline = sameLine(ctx, node.discriminant.end, arms[0]!.start)
  ctx.s.update(node.start, node.discriminant.start, tagsOnly ? `${M}.valueTags(` : `${M}.value(`)
  ctx.s.update(
    node.discriminant.end,
    inline ? arms[0]!.start : brace + 1,
    tagsOnly ? (inline ? ", { " : ", {") : ").pipe("
  )
  // Closers appended at an arm's end must follow anything the arm body itself appends there.
  const closers: Array<() => void> = []
  arms.forEach((arm, i) => {
    const pattern: Node | null = arm.pattern
    const prefix = tagsOnly
      ? `${tagName(pattern!.tag)}: `
      : pattern === null
      ? `${M}.orElse(`
      : pattern.type === "TagPattern"
      ? `${M}.tag(${JSON.stringify(tagName(pattern.tag))}, `
      : `${M}.when(${ctx.source.slice(pattern.value.start, pattern.value.end)}, `
    const arrow = generator ? `) => ${E}.gen(function*() { return ` : ") => "
    const close = generator ? " })" : ""
    const tail = tagsOnly ? close : `${close})`
    const last = i === arms.length - 1
    const separator = last ? (!tagsOnly && !hasDefault ? `, ${M}.exhaustive` : "") : ","
    const binding: Node | null = pattern?.type === "TagPattern" ? pattern.binding : null
    if (binding !== null) {
      // the binding stays user text, so editor navigation and rename keep working on it
      ctx.s.update(arm.start, binding.start, `${prefix}(`)
      ctx.s.update(binding.end, arm.body.start, arrow)
    } else {
      ctx.s.update(arm.start, arm.body.start, `${prefix}(${arrow}`)
    }
    if (arm.end > arm.body.end) ctx.s.update(arm.body.end, arm.end, `${tail}${separator}`)
    else closers[i] = () => ctx.s.appendLeft(arm.body.end, `${tail}${separator}`)
  })
  const lastArm = arms[arms.length - 1]!
  if (sameLine(ctx, lastArm.end, node.end - 1)) ctx.s.update(lastArm.end, node.end, tagsOnly ? " })" : ")")
  else ctx.s.update(node.end - 1, node.end, tagsOnly ? "})" : ")")
  walk(node.discriminant, node, ctx)
  arms.forEach((arm, i) => {
    if (generator) walkInScopeOf(arm, arm.body, arm, ctx)
    else withEffect(ctx, undefined, () => walkInScopeOf(arm, arm.body, arm, ctx))
    closers[i]?.()
  })
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const matchHandlers: HandlerGroup = {
  MatchExpression: matchExpression
}
