/**
 * `match (x) { when … }` → `Match.valueTags` (all tag arms, no default) or `Match.value(x).pipe(…)`.
 * Inside `effect` code with effectful arms, every arm returns an `Effect.gen` and the match is yielded.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, withEffect } from "../context.ts"
import { ref, unused } from "../names.ts"
import { walk, walkInScopeOf } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { isEffectful } from "./try.ts"

const tagName = (tag: Node): string => (tag.type === "MemberExpression" ? tag.property.name : tag.name)

const sameLine = (ctx: Ctx, from: number, to: number): boolean => !ctx.source.slice(from, to).includes("\n")

/** The brand that keeps a guarded arm's case unhandled while typing its handler (ADR-0063). */
const guarded = "{ readonly \"~effectscript/guard\": true }"

/** An expression that needs parentheses as the right operand of `&&`. */
const loose = (node: Node): boolean =>
  (node.type === "LogicalExpression" && node.operator !== "&&") ||
  ["ConditionalExpression", "AssignmentExpression", "SequenceExpression", "ArrowFunctionExpression"].includes(
    node.type
  )

/** An object pattern without its bindings: what `Match.when` tests. */
const objectPatternText = (ctx: Ctx, pattern: Node): string => {
  const fields = (pattern.properties as Array<Node>).flatMap((property) => {
    if (property.value === null) return []
    const key = ctx.source.slice(property.key.start, property.key.end)
    const value = property.value.type === "ObjectMatchPattern"
      ? objectPatternText(ctx, property.value)
      : ctx.source.slice(property.value.value.start, property.value.value.end)
    return [`${key}: ${value}`]
  })
  return fields.length === 0 ? "{}" : `{ ${fields.join(", ")} }`
}

const keyText = (ctx: Ctx, key: Node): string =>
  key.type === "Identifier" ? key.name : ctx.source.slice(key.start, key.end)

/** An object pattern's literal fields as a type, for refining a guarded arm's handler. */
const objectPatternType = (ctx: Ctx, pattern: Node): string => {
  const fields = (pattern.properties as Array<Node>).flatMap((property) => {
    if (property.value === null) return []
    const value = property.value.type === "ObjectMatchPattern"
      ? objectPatternType(ctx, property.value)
      : ctx.source.slice(property.value.value.start, property.value.value.end)
    return [`readonly ${keyText(ctx, property.key)}: ${value}`]
  })
  return fields.length === 0 ? "{}" : `{ ${fields.join("; ")} }`
}

/**
 * An object pattern's tests: for each top-level field, `Predicate.hasProperty` (so `null`, a
 * primitive or a union member without the field doesn't get read), then its literal comparisons.
 */
const guardTests = (ctx: Ctx, pattern: Node, v: string): Array<string> => {
  const P = ref(ctx, "effect", "Predicate")
  return (pattern.properties as Array<Node>).flatMap((property) => {
    if (property.value === null) return []
    const key = property.key.type === "Identifier"
      ? JSON.stringify(property.key.name)
      : ctx.source.slice(property.key.start, property.key.end)
    return [
      `${P}.hasProperty(${v}, ${key})`,
      ...objectPatternTests(ctx, { ...pattern, properties: [property] }, v, ".")
    ]
  })
}

/** An object pattern's literal fields as comparisons, so TypeScript narrows the value. */
const objectPatternTests = (ctx: Ctx, pattern: Node, base: string, dot: string): Array<string> =>
  (pattern.properties as Array<Node>).flatMap((property) => {
    if (property.value === null) return []
    const access = property.key.type === "Identifier"
      ? `${base}${dot}${property.key.name}`
      : `${base}${dot === "." ? "" : dot}[${ctx.source.slice(property.key.start, property.key.end)}]`
    return property.value.type === "ObjectMatchPattern"
      ? objectPatternTests(ctx, property.value, access, "?.")
      : [`${access} === ${ctx.source.slice(property.value.value.start, property.value.value.end)}`]
  })

/**
 * An object pattern's bindings as destructuring-parameter pieces in source order: text, and the
 * user's own identifiers, so they keep their mapping (Plan 22 review I5).
 */
const bindingPieces = (ctx: Ctx, pattern: Node): Array<string | Node> => {
  const items = (pattern.properties as Array<Node>).flatMap((property): Array<Array<string | Node>> => {
    if (property.value === null) return [[property.key]]
    if (property.value.type !== "ObjectMatchPattern") return []
    const inner = bindingPieces(ctx, property.value)
    return inner.length === 0 ? [] : [[`${ctx.source.slice(property.key.start, property.key.end)}: `, ...inner]]
  })
  if (items.length === 0) return []
  return ["{ ", ...items.flatMap((item, i) => (i === 0 ? item : [", ", ...item])), " }"]
}

/** Writes `before`, the pieces (keeping the identifiers in place) and `after` over `[from, to)`. */
const writeAroundBindings = (
  ctx: Ctx,
  pieces: ReadonlyArray<string | Node>,
  from: number,
  to: number,
  before: string,
  after: string
): void => {
  let text = before
  let cursor = from
  for (const piece of pieces) {
    if (typeof piece === "string") text += piece
    else {
      if (text === "") ctx.s.remove(cursor, piece.start)
      else ctx.s.update(cursor, piece.start, text)
      text = ""
      cursor = piece.end
    }
  }
  ctx.s.update(cursor, to, `${text}${after}`)
}

/** An object pattern's bindings as a destructuring parameter, or "" when it binds nothing. */
const objectBindingText = (ctx: Ctx, pattern: Node): string => {
  const fields = (pattern.properties as Array<Node>).flatMap((property) => {
    if (property.value === null) return [property.key.name as string]
    if (property.value.type !== "ObjectMatchPattern") return []
    const inner = objectBindingText(ctx, property.value)
    return inner === "" ? [] : [`${ctx.source.slice(property.key.start, property.key.end)}: ${inner}`]
  })
  return fields.length === 0 ? "" : `{ ${fields.join(", ")} }`
}

const matchExpression: Handler = (node, _parent, ctx) => {
  const arms: Array<Node> = node.arms
  const M = ref(ctx, "effect", "Match")
  const generator = ctx.effect !== undefined && arms.some((arm) => isEffectful(arm.body))
  const E = generator ? ref(ctx, "effect", "Effect") : ""
  if (generator) {
    ctx.s.appendRight(node.start, "(yield* ")
    ctx.s.prependLeft(node.end, ")")
  }
  const tagsOnly = arms.every((arm) => arm.pattern?.type === "TagPattern" && arm.guard === null)
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
    const guard: Node | null = arm.guard
    const arrow = generator ? `) => ${E}.gen(function*() { return ` : ") => "
    const close = generator ? " })" : ""
    const tail = tagsOnly ? close : `${close})`
    const last = i === arms.length - 1
    // in a match written over several lines, `Match.exhaustive` gets a line of its own
    const indent = ctx.source.slice(ctx.source.lastIndexOf("\n", arm.start) + 1, arm.start)
    const exhaustive = inline || !/^\s*$/.test(indent) ? `, ${M}.exhaustive` : `,\n${indent}${M}.exhaustive`
    const separator = last ? (!tagsOnly && !hasDefault ? exhaustive : "") : ","
    const [open, shut] = guard !== null && loose(guard) ? ["(", ")"] : ["", ""]
    if (pattern === null || (guard === null && pattern.type !== "ObjectMatchPattern")) {
      const prefix = tagsOnly
        ? `${tagName(pattern!.tag)}: `
        : pattern === null
        ? `${M}.orElse(`
        : pattern.type === "TagPattern"
        ? `${M}.tag(${JSON.stringify(tagName(pattern.tag))}, `
        : `${M}.when(${ctx.source.slice(pattern.value.start, pattern.value.end)}, `
      const binding: Node | null = pattern?.type === "TagPattern" ? pattern.binding : null
      if (binding !== null) {
        // the binding stays user text, so editor navigation and rename keep working on it
        ctx.s.update(arm.start, binding.start, `${prefix}(`)
        ctx.s.update(binding.end, arm.body.start, arrow)
      } else {
        ctx.s.update(arm.start, arm.body.start, `${prefix}(${arrow}`)
      }
    } else if (pattern.type === "ObjectMatchPattern") {
      const test = objectPatternText(ctx, pattern)
      const bindings = objectBindingText(ctx, pattern)
      if (guard === null) {
        writeAroundBindings(ctx, bindingPieces(ctx, pattern), arm.start, arm.body.start, `${M}.when(${test}, (`, arrow)
      } else {
        // like a guarded tag arm: the fields are compared so TypeScript narrows a union, and the
        // handler is refined with Match's own type for the pattern (ADR-0063)
        const v = unused(ctx, "_")
        const matched = `${M}.Types.WhenMatch<typeof ${v}, ${objectPatternType(ctx, pattern)}>`
        const type = `${matched} & ${guarded}`
        const tests = guardTests(ctx, pattern, v).map((t) => `${t} && `).join("")
        const body = guard.type === "SequenceExpression" ? ["(", ")"] : ["", ""]
        if (bindings === "") {
          ctx.s.update(arm.start, guard.start, `${M}.when((${v}): ${v} is ${type} => ${tests}${open}`)
          ctx.s.update(guard.end, arm.body.start, `${shut}, (${arrow}`)
        } else {
          writeAroundBindings(
            ctx,
            bindingPieces(ctx, pattern),
            arm.start,
            guard.start,
            `${M}.when((${v}): ${v} is ${type} => ${tests}((`,
            `) => ${body[0]}`
          )
          // the comparisons narrow a union but not a nested optional field: the guard's argument
          // is cast to what they just checked
          ctx.s.update(guard.end, arm.body.start, `${body[1]})(${v} as ${matched}), (${bindings}${arrow}`)
        }
      }
    } else if (pattern.type === "LiteralPattern") {
      const v = unused(ctx, "_")
      const literal = ctx.source.slice(pattern.value.start, pattern.value.end)
      ctx.s.update(arm.start, guard!.start, `${M}.when((${v}) => ${v} === ${literal} && ${open}`)
      ctx.s.update(guard!.end, arm.body.start, `${shut}, (${arrow}`)
    } else {
      // a guarded tag arm: a refinement to the branded case, so the case stays unhandled (ADR-0063)
      const tag = JSON.stringify(tagName(pattern.tag))
      const binding: Node | null = pattern.binding
      const v = binding?.type === "Identifier" ? binding.name as string : unused(ctx, "_")
      const refine = `${v} is Extract<typeof ${v}, { readonly _tag: ${tag} }> & ${guarded} => ${
        ref(ctx, "effect", "Predicate")
      }.isTagged(${v}, ${tag}) && `
      if (binding === null) {
        ctx.s.update(arm.start, guard!.start, `${M}.when((${v}): ${refine}${open}`)
        ctx.s.update(guard!.end, arm.body.start, `${shut}, (${arrow}`)
      } else if (binding.type === "Identifier") {
        ctx.s.update(arm.start, binding.start, `${M}.when((`)
        ctx.s.update(binding.end, guard!.start, `): ${refine}${open}`)
        ctx.s.update(guard!.end, arm.body.start, `${shut}, (${v}${arrow}`)
      } else {
        // a destructured binding: the guard reads it through an immediately invoked arrow
        const destructured = ctx.source.slice(binding.start, binding.end)
        const body = guard!.type === "SequenceExpression" ? ["(", ")"] : ["", ""]
        ctx.s.update(arm.start, binding.start, `${M}.when((${v}): ${refine}((`)
        ctx.s.update(binding.end, guard!.start, `) => ${body[0]}`)
        ctx.s.update(guard!.end, arm.body.start, `${body[1]})(${v}), (${destructured}${arrow}`)
      }
    }
    if (arm.end > arm.body.end) ctx.s.update(arm.body.end, arm.end, `${tail}${separator}`)
    else closers[i] = () => ctx.s.appendLeft(arm.body.end, `${tail}${separator}`)
  })
  const lastArm = arms[arms.length - 1]!
  if (sameLine(ctx, lastArm.end, node.end - 1)) ctx.s.update(lastArm.end, node.end, tagsOnly ? " })" : ")")
  else ctx.s.update(node.end - 1, node.end, tagsOnly ? "})" : ")")
  walk(node.discriminant, node, ctx)
  arms.forEach((arm, i) => {
    // a guard is a predicate: never effect code
    if (arm.guard !== null) withEffect(ctx, undefined, () => walkInScopeOf(arm, arm.guard, arm, ctx))
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
