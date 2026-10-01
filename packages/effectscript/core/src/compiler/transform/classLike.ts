/**
 * Shared machinery for `schema`/`error`/`service` class-like declarations.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"

/**
 * @since 0.1.0
 * @category utils
 */
export const fieldsOf = (cls: Node): { fields: Array<Node>; members: Array<Node>; tag: Node | undefined } => {
  const fields: Array<Node> = []
  const members: Array<Node> = []
  let tag: Node | undefined
  for (const element of cls.body.body as Array<Node>) {
    if (element.type === "PropertyDefinition" && element.static !== true && element.computed !== true) {
      if (element.key.name === "_tag") tag = element
      else fields.push(element)
    } else {
      members.push(element)
    }
  }
  return { fields, members, tag }
}

/**
 * The full-line range of `node` (including its leading comment lines and trailing newline) when it
 * sits on its own lines; otherwise the node range.
 *
 * @since 0.1.0
 * @category utils
 */
export const lineRange = (source: string, node: Node): readonly [number, number] => {
  let start = source.lastIndexOf("\n", node.start - 1) + 1
  const lineEnd = source.indexOf("\n", node.end)
  const end = lineEnd === -1 ? source.length : lineEnd + 1
  if (source.slice(start, node.start).trim() !== "" || source.slice(node.end, end).trim() !== "") {
    return [node.start, node.end]
  }
  for (;;) {
    const previous = source.lastIndexOf("\n", start - 2) + 1
    const text = source.slice(previous, start).trim()
    if (previous >= start || !(text.startsWith("//") || text.startsWith("/*") || text.startsWith("*"))) break
    start = previous
  }
  return [start, end]
}

/**
 * @since 0.1.0
 * @category utils
 */
export const removeLine = (ctx: Ctx, node: Node): void => {
  const [start, end] = lineRange(ctx.source, node)
  ctx.s.remove(start, end)
}

/**
 * Rewrites one field (`name: Type` / `name?: Type` / `name = schema`) into an object property.
 *
 * @since 0.1.0
 * @category utils
 */
export const rewriteField = (ctx: Ctx, field: Node, isLast: boolean): void => {
  if (field.readonly === true && ctx.source.startsWith("readonly", field.start)) {
    ctx.s.remove(field.start, field.key.start)
  }
  if (field.value !== null && field.value !== undefined) {
    ctx.s.update(field.key.end, field.value.start, ": ")
    withNamespace(ctx, "Schema", () => walk(field.value, field, ctx))
  } else if (field.typeAnnotation !== undefined && field.typeAnnotation !== null) {
    const type: Node = field.typeAnnotation.typeAnnotation
    let schema = typeToSchema(ctx, type)
    if (field.optional === true) {
      schema = `Schema.optional(${schema})`
      const question = ctx.source.indexOf("?", field.key.end)
      ctx.s.remove(question, question + 1)
    }
    ctx.s.update(type.start, type.end, schema)
  } else {
    ctx.diagnostics.push(diagnosticError("EFX3004", "A field needs a type or `= <schema>`", field.start, field.end))
  }
  const endsWithSemicolon = ctx.source[field.end - 1] === ";"
  if (isLast) {
    if (endsWithSemicolon) ctx.s.remove(field.end - 1, field.end)
  } else if (endsWithSemicolon) {
    ctx.s.update(field.end - 1, field.end, ",")
  } else {
    ctx.s.appendLeft(field.end, ",")
  }
}

/**
 * Closes the first brace-delimited part with `close` and moves `members` into a new class body.
 * `trailing` is appended at the end of that class body.
 *
 * @since 0.1.0
 * @category utils
 */
export const moveMembersAfter = (
  ctx: Ctx,
  body: Node,
  members: ReadonlyArray<Node>,
  close: string,
  trailing = ""
): void => {
  const brace = body.end - 1
  if (members.length === 0) {
    if (trailing === "") ctx.s.update(brace, brace + 1, `${close} {}`)
    else ctx.s.appendRight(brace, `${close} {\n${trailing}`)
    return
  }
  const ranges = members.map((m) => lineRange(ctx.source, m))
  // Members already forming a contiguous run at the end of the body stay in place; earlier
  // members move in front of that run, preserving source order.
  let target = brace
  let suffixStart = ranges.length
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [start, end] = ranges[i]!
    if (ctx.source.slice(end, target).trim() !== "") break
    target = start
    suffixStart = i
  }
  ctx.s.appendRight(ranges[0]![0], `${close} {\n`)
  for (const [start, end] of ranges.slice(0, suffixStart)) ctx.s.move(start, end, target)
  if (trailing !== "") ctx.s.appendRight(brace, trailing)
}
