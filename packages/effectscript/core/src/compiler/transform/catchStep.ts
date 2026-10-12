/**
 * The pipe step `catch Tag => value` (ADR-0308): `|> catch NotFound => []` is
 * `.pipe(Effect.catchTag("NotFound", () => Effect.succeed([])))`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Handler, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { tagOf } from "./tags.ts"
import { effectfulNode } from "./try.ts"

/** The tag names a step catches: `A or B`, or the annotation of `(e: A | B)`. */
const tagNames = (node: Node): Array<Node> | undefined => {
  if (node.tags !== null) {
    const tags: Array<Node> = node.tags
    return tags.every((t) => t.type === "Identifier" || t.type === "MemberExpression") ? tags : undefined
  }
  const annotation: Node = node.typeAnnotation
  const types: Array<Node> = annotation.type === "TSUnionType" ? annotation.types : [annotation]
  return types.every((t) => t.type === "TSTypeReference" && t.typeArguments === undefined)
    ? types.map((t) => t.typeName)
    : undefined
}

const catchStep: Handler = (node, parent, ctx) => {
  const fail = (message: string, hint: string, at: Node = node) => {
    ctx.diagnostics.push(diagnosticError("EFX5003", message, at.start, at.end, hint))
    return true
  }
  // the pipeline walks every step with itself as the parent
  if (parent?.type !== "PipelineExpression") {
    return fail("`catch … =>` is a pipe step", "write it after `|>`, or use `try` / `catch`")
  }
  if (ctx.namespace !== "Effect") {
    return fail("`catch … =>` catches an Effect's failures", "pipe a `Stream` or `Layer` through its own `catchTag`")
  }
  const names = tagNames(node)
  if (names === undefined) {
    return fail("A `catch` step names its errors by type", "write `catch NotFound => …` or `catch A or B => …`")
  }
  const tags = names.map((name) => JSON.stringify(tagOf(ctx, name)))
  const Effect = ref(ctx, "effect", "Effect")
  const body: Node = node.body
  const param = node.param === null ? "" : node.param.name
  const open = `${Effect}.catchTag(${tags.length === 1 ? tags[0] : `[${tags.join(", ")}]`}, (${param}) => `
  // `=> undefined` is `Effect.void`; `=> throw e` fails; `=> await x` runs `x`; any other value succeeds
  if (body.type === "Identifier" && body.name === "undefined") {
    ctx.s.update(node.start, node.end, `${open}${Effect}.void)`)
    return true
  }
  const [inner, before, after] = body.type === "ThrowExpression"
    ? [body.argument, `${Effect}.fail(`, ")"]
    : body.type === "AwaitExpression"
    ? [body.argument, "", ""]
    : [body, `${Effect}.succeed(`, ")"]
  const effectful = effectfulNode(inner)
  if (effectful !== undefined) {
    return fail(
      "A `catch` step's value can't run effects inside it",
      "write `=> await fallback()`, or use `try` / `catch`",
      effectful
    )
  }
  ctx.s.update(node.start, inner.start, `${open}${before}`)
  if (inner.end < node.end) ctx.s.update(inner.end, node.end, `${after})`)
  else ctx.s.appendLeft(node.end, `${after})`)
  withEffect(ctx, undefined, () => walk(inner, node, ctx))
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const catchStepHandlers: HandlerGroup = {
  CatchStep: catchStep
}
