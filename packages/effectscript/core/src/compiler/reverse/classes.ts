/**
 * `Schema.TaggedError` / `Schema.Class` classes → `error` / `schema` declarations.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { note, removeKeepingComments, type ReverseCtx, separatorComma } from "./context.ts"
import { isMember } from "./origin.ts"
import { fieldType } from "./types.ts"

interface ClassShape {
  readonly keyword: "error" | "schema"
  readonly name: string
  readonly fields: Node
  readonly types: ReadonlyArray<NonNullable<ReturnType<typeof fieldType>>>
}

/**
 * The declaration a class converts to, or `undefined` (with a note for near misses).
 *
 * @since 4.0.0
 * @category reverse
 */
export const classShape = (ctx: ReverseCtx, cls: Node, explain: boolean): ClassShape | undefined => {
  const outer: Node | null = cls.superClass
  if (ctx.schema === undefined || cls.id === null || outer?.type !== "CallExpression") return undefined
  const inner: Node = outer.callee
  if (inner.type !== "CallExpression") return undefined
  const name: string = cls.id.name
  const explainIf = (message: string) => {
    if (explain) note(ctx, cls, `\`${name}\` stays TypeScript: ${message}`)
  }
  let keyword: "error" | "schema" | undefined
  let fields: Node | undefined
  if (isMember(inner.callee, ctx.schema, "TaggedError") && inner.arguments.length === 0) {
    const [tag, object] = outer.arguments
    if (tag?.type !== "Literal" || tag.value !== name) {
      explainIf("its tag differs from its name")
      return undefined
    }
    keyword = "error"
    fields = object
  } else if (isMember(inner.callee, ctx.schema, "Class") && inner.arguments[0]?.value === name) {
    keyword = "schema"
    fields = outer.arguments[0]
  }
  if (
    keyword === undefined || fields?.type !== "ObjectExpression" ||
    outer.arguments.length !== (keyword === "error" ? 2 : 1)
  ) {
    return undefined
  }
  if (cls.body.body.length > 0) {
    explainIf("class members are not converted yet")
    return undefined
  }
  const types = (fields.properties as Array<Node>).map((property) => fieldType(ctx.source, ctx.schema!, property))
  if (types.some((t) => t === undefined)) {
    explainIf("a field schema has no type form")
    return undefined
  }
  return { keyword, name, fields, types: types as ClassShape["types"] }
}

/**
 * Rewrites a class recognized by `classShape`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertClass = (ctx: ReverseCtx, cls: Node): boolean => {
  const shape = classShape(ctx, cls, true)
  if (shape === undefined) return false
  const { fields, keyword, name, types } = shape
  ctx.s.update(cls.start, fields.start, `${keyword} ${name} `)
  removeKeepingComments(ctx, fields.end, cls.end)
  const properties: Array<Node> = fields.properties
  properties.forEach((property, i) => {
    const field = types[i]!
    ctx.s.update(property.key.end, property.value.end, `${field.optional}: ${field.type}`)
    const next = properties[i + 1]
    if (next !== undefined) {
      const comma = separatorComma(ctx, property.end, next.start)
      if (comma === -1) return
      if (ctx.source.slice(comma, next.start).includes("\n")) ctx.s.remove(comma, comma + 1)
      else ctx.s.update(comma, comma + 1, ";")
    }
  })
  // a trailing comma before the closing brace
  const last = properties[properties.length - 1]
  if (last !== undefined) {
    const comma = separatorComma(ctx, last.end, fields.end - 1)
    if (comma !== -1) ctx.s.remove(comma, comma + 1)
  }
  return true
}
