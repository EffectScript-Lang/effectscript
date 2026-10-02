/**
 * `Match.valueTags(x, { T: (b) => e })` / `Match.value(x).pipe(Match.when|tag|orElse…, Match.exhaustive?)`
 * → `match (x) { when … }` (spec §4.11): the inverse of `transform/match.ts`, including its
 * generator form `(yield* Match…(… Effect.gen(function*() { return e }) …))`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { blocker, genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commentsIn, type ReverseCtx, slice } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"

interface Arm {
  /** `when T`, `when T(b)`, `when "v"` or `default` */
  readonly head: string
  /** Start of the arm's text (the property or the pipe step). */
  readonly start: number
  /** The arm's value, as EffectScript writes it after `head: `. */
  readonly value: Node
  /** End of the arm's text before its separator (the arrow body, or the generator call). */
  readonly end: number
  /** The generator wrapping the value, in the generator form. */
  readonly fn: Node | undefined
}

interface MatchShape {
  readonly call: Node
  readonly subject: Node
  /** `", {"` (valueTags) or `").pipe("`: the text after the subject. */
  readonly opener: string
  /** `","` (valueTags) or `"),"`: the text after an arm's value. */
  readonly separator: string
  readonly arms: ReadonlyArray<Arm>
}

const isTagName = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name)

/** `(b) => e` / `() => e` with an expression body not wrapped in parentheses. */
const armFunction = (ctx: ReverseCtx, node: Node | undefined, maxParams: number): Node | undefined => {
  if (node?.type !== "ArrowFunctionExpression" || node.async || node.params.length > maxParams) return undefined
  if (node.body.type === "BlockStatement" || node.body.type === "SequenceExpression") return undefined
  const arrow = ctx.source.lastIndexOf("=>", node.body.start)
  if (ctx.source.slice(arrow + 2, node.body.start).trim() !== "") return undefined
  if (node.params.some((p: Node) => p.typeAnnotation)) return undefined
  return node
}

const tagArm = (ctx: ReverseCtx, tag: string, start: number, fn: Node): Arm => {
  const binding: Node | undefined = fn.params[0]
  return {
    head: binding === undefined ? `when ${tag}` : `when ${tag}(${slice(ctx, binding)})`,
    start,
    value: fn.body,
    end: fn.body.end,
    fn: undefined
  }
}

const armsOf = (ctx: ReverseCtx, call: Node, M: string): MatchShape | undefined => {
  // Match.valueTags(x, { T: (b) => e, … })
  if (
    isMember(call.callee, M, "valueTags") && call.arguments.length === 2 &&
    call.arguments[1].type === "ObjectExpression"
  ) {
    const [subject, object]: Array<Node> = call.arguments
    const arms: Array<Arm> = []
    for (const property of object.properties as Array<Node>) {
      if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) {
        return undefined
      }
      const fn = armFunction(ctx, property.value, 1)
      if (property.key.type !== "Identifier" || fn === undefined) return undefined
      arms.push(tagArm(ctx, property.key.name, property.start, fn))
    }
    return arms.length === 0 ? undefined : { call, subject, opener: ", {", separator: ",", arms }
  }
  // Match.value(x).pipe(…)
  const callee: Node = call.callee
  if (
    callee.type !== "MemberExpression" || callee.computed || callee.property.name !== "pipe" ||
    callee.object.type !== "CallExpression" || !isMember(callee.object.callee, M, "value") ||
    callee.object.arguments.length !== 1 || call.arguments.length === 0
  ) {
    return undefined
  }
  const steps: Array<Node> = [...call.arguments]
  const exhaustive = isMember(steps[steps.length - 1], M, "exhaustive")
  if (exhaustive) steps.pop()
  const arms: Array<Arm> = []
  for (const [i, step] of steps.entries()) {
    if (step.type !== "CallExpression") return undefined
    const args: Array<Node> = step.arguments
    const [first, second] = args
    if (isMember(step.callee, M, "orElse") && args.length === 1 && i === steps.length - 1 && !exhaustive) {
      const fn = armFunction(ctx, first, 0)
      if (fn === undefined) return undefined
      arms.push({ head: "default", start: step.start, value: fn.body, end: fn.body.end, fn: undefined })
    } else if (
      isMember(step.callee, M, "when") && args.length === 2 && first!.type === "Literal" && first!.regex === undefined
    ) {
      const fn = armFunction(ctx, second, 0)
      if (fn === undefined) return undefined
      arms.push({
        head: `when ${slice(ctx, first!)}`,
        start: step.start,
        value: fn.body,
        end: fn.body.end,
        fn: undefined
      })
    } else if (
      isMember(step.callee, M, "tag") && args.length === 2 && first!.type === "Literal" &&
      typeof first!.value === "string" && isTagName(first!.value)
    ) {
      const fn = armFunction(ctx, second, 1)
      if (fn === undefined) return undefined
      arms.push(tagArm(ctx, first!.value as string, step.start, fn))
    } else {
      return undefined
    }
  }
  if (arms.length === 0) return undefined
  // the forward compiler uses `valueTags` when every arm is a tag and there is no default
  if (exhaustive && steps.every((s) => isMember(s.callee, M, "tag"))) return undefined
  if (!exhaustive && arms[arms.length - 1]!.head !== "default") return undefined
  return { call, subject: callee.object.arguments[0], opener: ").pipe(", separator: "),", arms }
}

/** The generator form wraps every arm value as `Effect.gen(function*() { return e })`. */
const unwrapGenerator = (ctx: ReverseCtx, arm: Arm): Arm | undefined => {
  const body: Node = arm.value
  if (body.type !== "CallExpression") return undefined
  const shape = genShape(ctx, body, undefined)
  if (shape === undefined || !("fn" in shape) || body.arguments.length !== 1) return undefined
  const block: Node = shape.fn.body
  const only: Node | undefined = block.body.length === 1 ? block.body[0] : undefined
  if (only?.type !== "ReturnStatement" || only.argument === null) return undefined
  if (
    ctx.source.slice(block.start, only.argument.start) !== "{ return " ||
    ctx.source.slice(only.argument.end, block.end) !== " }" ||
    blocker(shape.fn, "block", ctx) !== undefined
  ) {
    return undefined
  }
  return { ...arm, value: only.argument, fn: shape.fn }
}

/**
 * Recognizes a `Match` lowering. In the generator form, `call` is the yielded call and every arm
 * value is unwrapped from its generator.
 *
 * @since 4.0.0
 * @category reverse
 */
export const matchShape = (ctx: ReverseCtx, call: Node, generator: boolean): MatchShape | undefined => {
  const M = importedLocal(ctx.analysis, "effect", "Match")
  if (M === undefined || call.type !== "CallExpression") return undefined
  const found = armsOf(ctx, call, M)
  if (found === undefined) return undefined
  if (!generator) return found
  const arms = found.arms.map((arm) => unwrapGenerator(ctx, arm))
  if (arms.some((a) => a === undefined)) return undefined
  // the forward compiler wraps arms only when one of them awaits
  const awaits = (arm: Arm) => /\byield\s*\*/.test(slice(ctx, arm.value))
  if (!(arms as Array<Arm>).some(awaits)) return undefined
  return { ...found, arms: arms as Array<Arm> }
}

const lineBreak = (text: string): string | undefined => {
  const newline = text.lastIndexOf("\n")
  return newline === -1 ? undefined : /^\n[ \t]*/.exec(text.slice(newline))![0]
}

/**
 * Rewrites a recognized lowering; `range` is the call, or the parenthesized `(yield* …)`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertMatch = (
  ctx: ReverseCtx,
  shape: MatchShape,
  range: readonly [number, number],
  visit: Visit,
  generator: boolean
): boolean => {
  const { arms, subject } = shape
  const first = arms[0]!
  const last = arms[arms.length - 1]!
  const closing = ctx.source.slice(last.end, range[1])
  if (!ctx.source.startsWith(shape.opener, subject.end) || commentsIn(ctx, last.end, range[1]).length > 0) return false
  // an arm head is rewritten whole, so it can't hold a comment
  if (arms.some((arm) => commentsIn(ctx, arm.start, arm.value.start).length > 0)) return false
  for (const [i, arm] of arms.entries()) {
    if (i < arms.length - 1 && !ctx.source.startsWith(shape.separator, arm.end)) return false
  }
  ctx.s.update(range[0], subject.start, "match (")
  // opening: `).pipe(` / `, {` → `) {`, keeping a line break before the first arm
  const opening = ctx.source.slice(subject.end + shape.opener.length, first.start)
  if (lineBreak(opening) === undefined && commentsIn(ctx, subject.end, first.start).length === 0) {
    ctx.s.update(subject.end, first.start, ") { ")
  } else {
    ctx.s.update(subject.end, subject.end + shape.opener.length, ") {")
  }
  arms.forEach((arm, i) => {
    ctx.s.update(arm.start, arm.value.start, `${arm.head}: `)
    if (arm.end > arm.value.end) ctx.s.remove(arm.value.end, arm.end)
    const next = arms[i + 1]
    if (next === undefined) return
    // `),` / `,` → nothing before a line break, `;` within a line
    const gap = ctx.source.slice(arm.end + shape.separator.length, next.start)
    if (lineBreak(gap) === undefined) ctx.s.update(arm.end, arm.end + shape.separator.length, ";")
    else ctx.s.remove(arm.end, arm.end + shape.separator.length)
  })
  const close = lineBreak(closing)
  ctx.s.update(last.end, range[1], close === undefined ? " }" : `${close}}`)
  visit(subject, shape.call, generator)
  for (const arm of arms) visit(arm.value, arm.fn ?? shape.call, arm.fn !== undefined)
  return true
}
