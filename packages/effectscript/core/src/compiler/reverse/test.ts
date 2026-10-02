/**
 * `describe("n", () => {…})`, `layer(L)("n", (it) => {…})` and
 * `it.effect|live|effect.skip|effect.only("n", () => Effect.gen(function*() {…})[.pipe(…)])` →
 * `describe "n" [with L] {…}` / `test[.mod] "n" {…} [|> …]` (spec §4.14): the inverse of
 * `transform/test.ts`. A test body is a layer-constructor frame: `it.effect` provides the scope.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { genShape } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commaToPipe, commentsIn, type ReverseCtx, separatorComma, slice, within } from "./context.ts"
import { importedLocal } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { inFrame } from "./resources.ts"

const vitest = "@effect/vitest"

const isName = (node: Node | undefined): node is Node => node?.type === "Literal" && typeof node.value === "string"

/** `() => { … }` (`params` = 0) or `(it) => { … }` (`params` = 1), with a block body. */
const callback = (node: Node | undefined, params: number): Node | undefined =>
  node?.type === "ArrowFunctionExpression" && !node.async && node.params.length === params &&
    node.body.type === "BlockStatement" &&
    node.params.every((p: Node) => p.type === "Identifier" && !p.typeAnnotation)
    ? node
    : undefined

const callOf = (statement: Node): Node | undefined =>
  statement.type === "ExpressionStatement" && statement.expression.type === "CallExpression"
    ? statement.expression
    : undefined

/** `describe("n", () => { … })` → `describe "n" { … }` */
const convertDescribe = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  const describe = importedLocal(ctx.analysis, vitest, "describe", true)
  if (call.callee.type !== "Identifier" || call.callee.name !== describe || call.arguments.length !== 2) return false
  const [name, fn] = call.arguments as Array<Node>
  const body = callback(fn, 0)
  if (!isName(name) || body === undefined || ctx.source.slice(fn!.end, call.end) !== ")") return false
  if (commentsIn(ctx, call.start, body.body.start).length > 0) return false
  ctx.s.update(call.start, body.body.start, `describe ${slice(ctx, name)} `)
  ctx.s.remove(body.body.end, call.end)
  visit(body.body, body, false)
  return true
}

/** `layer(L)("n", (it) => { … })` / `it.layer(L)(…)` → `describe "n" with L { … }` */
const convertLayerDescribe = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  const head: Node = call.callee
  if (head.type !== "CallExpression" || head.arguments.length !== 1 || call.arguments.length !== 2) return false
  const outer = ctx.testIt === undefined
    ? head.callee.type === "Identifier" && head.callee.name === importedLocal(ctx.analysis, vitest, "layer", true)
    : head.callee.type === "MemberExpression" && !head.callee.computed && head.callee.object.type === "Identifier" &&
      head.callee.object.name === ctx.testIt && head.callee.property.name === "layer"
  if (!outer) return false
  const layer: Node = head.arguments[0]
  const [name, fn] = call.arguments as Array<Node>
  const body = callback(fn, 1)
  // the forward compiler names the parameter `unused(ctx, "it")`
  if (!isName(name) || body === undefined || body.params[0].name !== "it") return false
  if (ctx.source.slice(fn!.end, call.end) !== ")" || commentsIn(ctx, call.start, body.body.start).length > 0) {
    return false
  }
  ctx.s.update(call.start, layer.start, `describe ${slice(ctx, name)} with `)
  ctx.s.update(layer.end, body.body.start, " ")
  ctx.s.remove(body.body.end, call.end)
  visit(layer, head, false)
  const previous = ctx.testIt
  ctx.testIt = "it"
  visit(body.body, body, false)
  ctx.testIt = previous
  return true
}

const modifiers: Record<string, string> = { effect: "", live: ".live", "effect.skip": ".skip", "effect.only": ".only" }

/** `it.effect("n", () => Effect.gen(function*() {…})[.pipe(…)])` → `test "n" {…} [|> …]` */
const convertTest = (ctx: ReverseCtx, call: Node, visit: Visit): boolean => {
  const it = ctx.testIt ?? importedLocal(ctx.analysis, vitest, "it", true)
  let callee: Node = call.callee
  const path: Array<string> = []
  while (callee.type === "MemberExpression" && !callee.computed) {
    path.unshift(callee.property.name)
    callee = callee.object
  }
  if (it === undefined || callee.type !== "Identifier" || callee.name !== it) return false
  const modifier = modifiers[path.join(".")]
  // `test.live` can't run inside `describe … with` (EFX2030)
  if (modifier === undefined || (modifier === ".live" && ctx.testIt !== undefined)) return false
  if (call.arguments.length !== 2) return false
  const [name, fn] = call.arguments as Array<Node>
  if (!isName(name) || fn?.type !== "ArrowFunctionExpression" || fn.params.length > 0 || fn.async) return false
  let gen: Node = fn.body
  const pipe = gen.type === "CallExpression" && gen.callee.type === "MemberExpression" && !gen.callee.computed &&
      gen.callee.property.name === "pipe"
    ? gen
    : undefined
  if (pipe !== undefined) {
    if (pipe.arguments.length === 0 || !(pipe.arguments as Array<Node>).every((a) => isPlainStep(a))) return false
    gen = pipe.callee.object
  }
  const shape = genShape(ctx, gen, fn)
  if (shape === undefined || !("fn" in shape)) return false
  if (ctx.source.slice(fn.end, call.end) !== ")" || commentsIn(ctx, call.start, shape.fn.body.start).length > 0) {
    return false
  }
  ctx.s.update(call.start, shape.fn.body.start, `test${modifier} ${slice(ctx, name)} `)
  if (pipe === undefined) {
    ctx.s.remove(shape.fn.body.end, call.end)
  } else {
    const args: Array<Node> = pipe.arguments
    const open = ctx.source.indexOf("(", pipe.callee.property.end)
    if (ctx.source.slice(open + 1, args[0]!.start).includes("\n")) {
      ctx.s.remove(shape.fn.body.end, open + 1)
      ctx.s.appendLeft(args[0]!.start, "|> ")
    } else {
      ctx.s.update(shape.fn.body.end, args[0]!.start, " |> ")
    }
    args.forEach((step, i) => {
      if (i > 0) commaToPipe(ctx, separatorComma(ctx, args[i - 1]!.end, step.start), step)
      within(ctx, "Effect", () => visit(step, pipe, false))
    })
    ctx.s.remove(args[args.length - 1]!.end, call.end)
  }
  within(ctx, "Effect", () => inFrame(ctx, true, () => visit(shape.fn.body, shape.fn, true)))
  return true
}

/**
 * Rewrites a `describe` / `test` statement. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertTestStatement = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  const call = callOf(statement)
  if (call === undefined || statement.end !== call.end) return false
  return convertDescribe(ctx, call, visit) || convertLayerDescribe(ctx, call, visit) || convertTest(ctx, call, visit)
}
