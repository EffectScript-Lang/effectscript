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

/** An object pattern's literal fields, from `Match.when`'s object or a guard's refinement type. */
interface Field {
  readonly key: string
  readonly value: string | ReadonlyArray<Field>
}

/** An object pattern's bindings: a shorthand name, or a nested pattern under a key. */
interface Bind {
  readonly key: string
  readonly nested: ReadonlyArray<Bind> | undefined
}

const isKey = (key: Node): boolean =>
  key.type === "Identifier" || (key.type === "Literal" && typeof key.value === "string")

const isLiteralValue = (node: Node): boolean =>
  (node.type === "Literal" && node.regex === undefined && node.bigint === undefined) ||
  (node.type === "Identifier" && node.name === "undefined")

/** `{ status: 404, user: { role: "admin" } }` as fields; `undefined` for anything else. */
const fieldsOfObject = (ctx: ReverseCtx, node: Node): ReadonlyArray<Field> | undefined => {
  const fields: Array<Field> = []
  for (const property of node.properties as Array<Node>) {
    if (
      property.type !== "Property" || property.computed || property.shorthand || property.method ||
      property.kind !== "init" || !isKey(property.key)
    ) {
      return undefined
    }
    if (property.value.type === "ObjectExpression") {
      const nested = fieldsOfObject(ctx, property.value)
      if (nested === undefined) return undefined
      fields.push({ key: slice(ctx, property.key), value: nested })
    } else if (isLiteralValue(property.value)) {
      fields.push({ key: slice(ctx, property.key), value: slice(ctx, property.value) })
    } else return undefined
  }
  return fields
}

/** `{ readonly status: 500; … }` as fields; `undefined` for anything else. */
const fieldsOfType = (ctx: ReverseCtx, node: Node): ReadonlyArray<Field> | undefined => {
  if (node.type !== "TSTypeLiteral") return undefined
  const fields: Array<Field> = []
  for (const member of node.members as Array<Node>) {
    if (
      member.type !== "TSPropertySignature" || !member.readonly || member.computed || member.optional ||
      !isKey(member.key) || member.typeAnnotation === undefined
    ) {
      return undefined
    }
    const type: Node = member.typeAnnotation.typeAnnotation
    if (type.type === "TSTypeLiteral") {
      const nested = fieldsOfType(ctx, type)
      if (nested === undefined) return undefined
      fields.push({ key: slice(ctx, member.key), value: nested })
    } else if (["TSLiteralType", "TSUndefinedKeyword", "TSNullKeyword"].includes(type.type)) {
      fields.push({ key: slice(ctx, member.key), value: slice(ctx, type) })
    } else return undefined
  }
  return fields
}

/** `({ x, user: { name } })`'s pattern as bindings; `undefined` for renames, defaults or rests. */
const bindsOf = (ctx: ReverseCtx, node: Node): ReadonlyArray<Bind> | undefined => {
  if (node.type !== "ObjectPattern") return undefined
  const binds: Array<Bind> = []
  for (const property of node.properties as Array<Node>) {
    if (property.type !== "Property" || property.computed || !isKey(property.key)) return undefined
    if (property.shorthand && property.value.type === "Identifier") {
      binds.push({ key: property.key.name, nested: undefined })
    } else if (!property.shorthand && property.value.type === "ObjectPattern") {
      const nested = bindsOf(ctx, property.value)
      if (nested === undefined) return undefined
      binds.push({ key: slice(ctx, property.key), nested })
    } else return undefined
  }
  return binds
}

/** The EffectScript object pattern: literal fields first, then the bindings the fields don't hold. */
const objectPattern = (fields: ReadonlyArray<Field>, binds: ReadonlyArray<Bind>): string => {
  const parts = fields.map((field) => {
    if (typeof field.value === "string") return `${field.key}: ${field.value}`
    const inner = binds.find((b) => b.key === field.key && b.nested !== undefined)
    return `${field.key}: ${objectPattern(field.value, inner?.nested ?? [])}`
  })
  for (const bind of binds) {
    if (fields.some((f) => f.key === bind.key && typeof f.value !== "string")) continue
    parts.push(bind.nested === undefined ? bind.key : `${bind.key}: ${objectPattern([], bind.nested)}`)
  }
  return `{ ${parts.join(", ")} }`
}

/**
 * The tests a guarded object arm makes before its guard, as the forward compiler writes them:
 * `Predicate.hasProperty` for each top-level field, then its comparisons.
 */
const guardTests = (fields: ReadonlyArray<Field>, P: string, v: string): Array<string> =>
  fields.flatMap((field) => [
    `${P}.hasProperty(${v}, ${field.key.startsWith("\"") ? field.key : JSON.stringify(field.key)})`,
    ...fieldTests([field], v, ".")
  ])

/** The comparisons of an object pattern's literal fields. */
const fieldTests = (fields: ReadonlyArray<Field>, base: string, dot: string): Array<string> =>
  fields.flatMap((field) => {
    const access = field.key.startsWith("\"")
      ? `${base}${dot === "." ? "" : dot}[${field.key}]`
      : `${base}${dot}${field.key}`
    return typeof field.value === "string" ? [`${access} === ${field.value}`] : fieldTests(field.value, access, "?.")
  })

/** The node spanning exactly `[start, end)` under `root`. */
const nodeAt = (root: Node, start: number, end: number): Node | undefined => {
  if (root === null || typeof root !== "object") return undefined
  if (typeof root.type === "string" && root.start === start && root.end === end) return root
  for (const [key, value] of Object.entries(root)) {
    if (key === "loc") continue
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && (child.start ?? start) <= start && (child.end ?? end) >= end) {
        const found = nodeAt(child, start, end)
        if (found !== undefined) return found
      }
    }
  }
  return undefined
}

const loose = (node: Node | undefined): boolean =>
  node !== undefined && ((node.type === "LogicalExpression" && node.operator !== "&&") ||
    ["ConditionalExpression", "AssignmentExpression", "SequenceExpression", "ArrowFunctionExpression"].includes(
      node.type
    ))

/** A guard's text from `[start, end)`, without the parentheses the forward compiler adds. */
const guardText = (ctx: ReverseCtx, root: Node, start: number, end: number): string => {
  const text = ctx.source.slice(start, end)
  if (text.startsWith("(") && text.endsWith(")") && loose(nodeAt(root, start + 1, end - 1))) return text.slice(1, -1)
  return text
}

const guardedBrand = "{ readonly \"~effectscript/guard\": true }"

/**
 * A guarded arm (ADR-0063): `Match.when((v): v is … & brand => tests && guard, handler)`, or a
 * guarded literal `Match.when((v) => v === "x" && guard, () => e)`. Returns the arm's head.
 */
const guardedHead = (ctx: ReverseCtx, M: string, predicate: Node, handler: Node): string | undefined => {
  if (
    predicate.type !== "ArrowFunctionExpression" || predicate.async || predicate.params.length !== 1 ||
    predicate.params[0].type !== "Identifier" || predicate.params[0].typeAnnotation ||
    predicate.body.type === "BlockStatement"
  ) {
    return undefined
  }
  const v: string = predicate.params[0].name
  const body: Node = predicate.body
  const binding: Node | undefined = handler.params[0]
  if (predicate.returnType === undefined) {
    // a guarded literal
    if (binding !== undefined || !ctx.source.startsWith(`${v} === `, body.start)) return undefined
    const literalStart = body.start + v.length + 5
    const literal = nodeAt(
      body,
      literalStart,
      literalStart +
        (/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\w.$-]+)/.exec(ctx.source.slice(literalStart))?.[0].length ?? 0)
    )
    if (literal === undefined || !isLiteralValue(literal) || !ctx.source.startsWith(" && ", literal.end)) {
      return undefined
    }
    return `when ${slice(ctx, literal)} if ${guardText(ctx, body, literal.end + 4, body.end)}`
  }
  const predicateType: Node = predicate.returnType.typeAnnotation
  if (predicateType.type !== "TSTypePredicate" || predicateType.parameterName?.name !== v) return undefined
  const both: Node = predicateType.typeAnnotation?.typeAnnotation
  if (both?.type !== "TSIntersectionType" || both.types.length !== 2 || slice(ctx, both.types[1]) !== guardedBrand) {
    return undefined
  }
  const refined: Node = both.types[0]
  const args: Array<Node> = refined.typeArguments?.params ?? []
  if (refined.type !== "TSTypeReference" || args.length !== 2 || slice(ctx, args[0]!) !== `typeof ${v}`) {
    return undefined
  }
  const name = slice(ctx, refined.typeName)
  const P = importedLocal(ctx.analysis, "effect", "Predicate")
  if (P === undefined) return undefined
  const fields = fieldsOfType(ctx, args[1]!)
  if (fields === undefined) return undefined
  let head: string
  let tests: Array<string>
  if (name === "Extract") {
    const tag = fields.length === 1 ? fields[0]! : undefined
    if (tag?.key !== "_tag" || typeof tag.value !== "string" || !isTagName(JSON.parse(tag.value))) return undefined
    head = `when ${JSON.parse(tag.value)}`
    tests = [`${P}.isTagged(${v}, ${tag.value})`]
  } else if (name === `${M}.Types.WhenMatch`) {
    head = "when "
    tests = guardTests(fields, P, v)
  } else return undefined
  const prefix = tests.map((t) => `${t} && `).join("")
  if (!ctx.source.startsWith(prefix, body.start)) return undefined
  const rest = body.start + prefix.length
  if (binding === undefined) {
    return name === "Extract"
      ? `${head} if ${guardText(ctx, body, rest, body.end)}`
      : `when ${objectPattern(fields, [])} if ${guardText(ctx, body, rest, body.end)}`
  }
  if (binding.type === "Identifier") {
    if (name !== "Extract" || binding.name !== v) return undefined
    return `${head}(${v}) if ${guardText(ctx, body, rest, body.end)}`
  }
  // a destructured binding: `((binding) => guard)(v)`, or `(v as …)` for an object pattern
  const call: Node | undefined = nodeAt(body, rest, body.end)
  const fn: Node | undefined = call?.type === "CallExpression" ? call.callee : undefined
  if (
    fn?.type !== "ArrowFunctionExpression" || fn.params.length !== 1 ||
    slice(ctx, fn.params[0]) !== slice(ctx, binding) ||
    fn.body.type === "BlockStatement" || fn.body.type === "SequenceExpression"
  ) {
    return undefined
  }
  const argument = name === "Extract" ? v : `${v} as ${slice(ctx, refined)}`
  if (call?.arguments.length !== 1 || slice(ctx, call.arguments[0]) !== argument) return undefined
  if (name === "Extract") return `${head}(${slice(ctx, binding)}) if ${slice(ctx, fn.body)}`
  const binds = bindsOf(ctx, binding)
  return binds === undefined ? undefined : `when ${objectPattern(fields, binds)} if ${slice(ctx, fn.body)}`
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
    } else if (isMember(step.callee, M, "when") && args.length === 2 && first!.type === "ObjectExpression") {
      // an object pattern: its fields, and the handler's bindings merged back in (ADR-0063)
      const fn = armFunction(ctx, second, 1)
      const fields = fieldsOfObject(ctx, first!)
      const binds = fn?.params[0] === undefined ? [] : bindsOf(ctx, fn.params[0])
      if (fn === undefined || fields === undefined || binds === undefined) return undefined
      arms.push({
        head: `when ${objectPattern(fields, binds)}`,
        start: step.start,
        value: fn.body,
        end: fn.body.end,
        fn: undefined
      })
    } else if (isMember(step.callee, M, "when") && args.length === 2 && first!.type === "ArrowFunctionExpression") {
      const fn = armFunction(ctx, second, 1)
      const head = fn === undefined ? undefined : guardedHead(ctx, M, first!, fn)
      if (fn === undefined || head === undefined) return undefined
      arms.push({ head, start: step.start, value: fn.body, end: fn.body.end, fn: undefined })
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
