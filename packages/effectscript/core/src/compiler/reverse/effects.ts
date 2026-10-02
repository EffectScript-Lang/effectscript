/**
 * `Effect.fn` declarations and `Effect.fn.Return` types.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { convertBody, walkExpressions } from "./body.ts"
import {
  commaToPipe,
  note,
  removeKeepingComments,
  replaceHoistingComments,
  type ReverseCtx,
  separatorComma,
  slice
} from "./context.ts"
import { isMember } from "./origin.ts"

/**
 * @since 4.0.0
 * @category reverse
 */
export const isGenerator = (node: Node | undefined): boolean =>
  node?.type === "FunctionExpression" && node.generator === true && node.async !== true && node.id === null

/**
 * `: Effect.fn.Return<A, E, R>` → `: A throws E needs R`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertReturnType = (ctx: ReverseCtx, annotation: Node | null | undefined): void => {
  const type: Node | undefined = annotation?.typeAnnotation
  if (type?.type !== "TSTypeReference") return
  const name: Node = type.typeName
  const isReturn = name.type === "TSQualifiedName" && name.right.name === "Return" &&
    name.left.type === "TSQualifiedName" && name.left.right.name === "fn" &&
    name.left.left.type === "Identifier" && name.left.left.name === ctx.effect
  if (!isReturn) return
  const [success, error, requirements]: Array<Node> = (type.typeArguments ?? type.typeParameters)?.params ?? []
  if (success === undefined) return
  const throws = error !== undefined && error.type !== "TSNeverKeyword" ? ` throws ${slice(ctx, error)}` : ""
  const needs = requirements !== undefined && requirements.type !== "TSNeverKeyword"
    ? ` needs ${slice(ctx, requirements)}`
    : ""
  ctx.s.update(type.start, type.end, `${slice(ctx, success)}${throws}${needs}`)
}

/**
 * Joins `fn`'s trailing call arguments as `|>` pipes and removes the call's closing text.
 *
 * @since 4.0.0
 * @category reverse
 */
export const argumentsToPipes = (ctx: ReverseCtx, fn: Node, pipes: ReadonlyArray<Node>, callEnd: number): void => {
  let previous = fn
  for (const pipe of pipes) {
    commaToPipe(ctx, separatorComma(ctx, previous.end, pipe.start), pipe)
    walkExpressions(ctx, pipe)
    previous = pipe
  }
  removeKeepingComments(ctx, previous.end, callEnd)
}

/**
 * `const f = Effect.fn("f")(function*(…) {…}, …pipes)` → `effect f(…) {…} |> …pipes`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertDeclaration = (ctx: ReverseCtx, statement: Node, outerStart: number): void => {
  if (statement.kind !== "const" || statement.declarations.length !== 1) return
  const declarator: Node = statement.declarations[0]
  const call: Node | null = declarator.init
  if (declarator.id.type !== "Identifier" || call?.type !== "CallExpression") return
  const head: Node = call.callee
  if (head.type !== "CallExpression" || !isMember(head.callee, ctx.effect, "fn")) return
  const [fn, ...pipes]: Array<Node> = call.arguments
  if (!isGenerator(fn) || declarator.id.typeAnnotation) return
  const name: string = declarator.id.name
  const span: Node | undefined = head.arguments[0]
  if (head.arguments.length !== 1 || span?.type !== "Literal" || span.value !== name) {
    note(
      ctx,
      statement,
      `\`${name}\` stays TypeScript: its span name ${
        span?.type === "Literal" ? JSON.stringify(span.value) : "is not a string literal"
      } differs from the binding`
    )
    return
  }
  const star = ctx.source.indexOf("*", fn.start)
  replaceHoistingComments(ctx, statement.start, star + 1, `effect ${name}`, outerStart)
  convertReturnType(ctx, fn.returnType)
  argumentsToPipes(ctx, fn, pipes, call.end)
  for (const param of fn.params) walkExpressions(ctx, param)
  convertBody(ctx, fn.body)
}
