/**
 * Schema declarations: `Schema.Class` / `Schema.TaggedClass` / `Schema.TaggedError` classes →
 * `schema` / `error` (spec §4.6–4.7), `const X = <schema>` + `type X = typeof X.Type` → `schema X =
 * <type>`, and runs of tagged classes with their `Schema.Union` → the ADT form.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"
import { excludedNames, namespaceExports } from "../prelude/tables.ts"
import type { Visit } from "./body.ts"
import {
  commentsIn,
  note,
  removeKeepingComments,
  replaceKeepingComments,
  type ReverseCtx,
  separatorComma,
  slice
} from "./context.ts"
import { isMember } from "./origin.ts"
import { fieldType, schemaToType } from "./types.ts"

type Field =
  | { readonly kind: "typed"; readonly property: Node; readonly optional: "" | "?"; readonly type: string }
  | { readonly kind: "schema"; readonly property: Node }

interface ClassShape {
  readonly keyword: "error" | "schema"
  readonly name: string
  readonly tag: string | undefined
  /** Whether the declaration needs a `_tag` field (an error whose tag isn't its name, a tagged schema). */
  readonly tagField: boolean
  readonly fields: Node
  readonly entries: ReadonlyArray<Field>
}

/** `Schema.TaggedError<X>()` / `Schema.TaggedClass<X>()` / `Schema.Class<X>("X")` */
const superShape = (ctx: ReverseCtx, cls: Node) => {
  const outer: Node | null = cls.superClass
  if (ctx.schema === undefined || cls.id === null || outer?.type !== "CallExpression") return undefined
  // `abstract`, `implements` and type parameters have no place in a declaration
  if (cls.abstract === true || (cls.implements?.length ?? 0) > 0 || cls.typeParameters) return undefined
  const inner: Node = outer.callee
  if (inner.type !== "CallExpression") return undefined
  const name: string = cls.id.name
  // the type argument is the class itself: `Schema.Class<X>("X")`, `TaggedError<X>()`
  const typeArgs: Array<Node> = (inner.typeArguments ?? inner.typeParameters)?.params ?? []
  if (
    typeArgs.length !== 1 || typeArgs[0]!.type !== "TSTypeReference" || typeArgs[0]!.typeName.type !== "Identifier" ||
    typeArgs[0]!.typeName.name !== name || typeArgs[0]!.typeArguments
  ) {
    return undefined
  }
  const tagged = (member: string) => isMember(inner.callee, ctx.schema, member) && inner.arguments.length === 0
  if (tagged("TaggedError") || tagged("TaggedClass")) {
    const [tag, fields] = outer.arguments
    if (tag?.type !== "Literal" || typeof tag.value !== "string" || outer.arguments.length !== 2) return undefined
    const keyword = tagged("TaggedError") ? "error" as const : "schema" as const
    return { keyword, name, tag: tag.value as string, fields: fields as Node | undefined }
  }
  if (
    isMember(inner.callee, ctx.schema, "Class") && inner.arguments[0]?.value === name && outer.arguments.length === 1
  ) {
    return { keyword: "schema" as const, name, tag: undefined, fields: outer.arguments[0] as Node | undefined }
  }
  return undefined
}

const entriesOf = (ctx: ReverseCtx, fields: Node, schemaFields: boolean): Array<Field> | undefined => {
  const entries: Array<Field> = []
  for (const property of fields.properties as Array<Node>) {
    if (commentsIn(ctx, property.start, property.end).length > 0) return undefined
    const typed = fieldType(ctx.source, ctx.schema!, property)
    if (typed !== undefined) {
      entries.push({ kind: "typed", property, optional: typed.optional, type: typed.type })
      continue
    }
    const plain = property.type === "Property" && !property.computed && property.kind === "init" &&
      !property.method && !property.shorthand && property.key.type === "Identifier"
    if (!schemaFields || !plain) return undefined
    entries.push({ kind: "schema", property })
  }
  return entries
}

/**
 * The declaration a class converts to, or `undefined` (with a note for near misses).
 *
 * @since 4.0.0
 * @category reverse
 */
export const classShape = (ctx: ReverseCtx, cls: Node, explain: boolean): ClassShape | undefined => {
  const shape = superShape(ctx, cls)
  if (shape === undefined || shape.fields?.type !== "ObjectExpression") return undefined
  const explainIf = (message: string) => {
    if (explain) note(ctx, cls, `\`${shape.name}\` stays TypeScript: ${message}`)
  }
  // an instance property in the body would become a field
  if ((cls.body.body as Array<Node>).some((m) => m.type === "PropertyDefinition" && !m.static && !m.computed)) {
    explainIf("an instance property would become a schema field")
    return undefined
  }
  const entries = entriesOf(ctx, shape.fields, true)
  if (entries === undefined) {
    explainIf("a field can't be written as a schema field")
    return undefined
  }
  const tagField = shape.keyword === "error" ? shape.tag !== shape.name : shape.tag !== undefined
  return { ...shape, fields: shape.fields, entries, tagField }
}

/** `Schema.x` → `x` inside a `name = <schema>` field, where the forward compiler resolves in `Schema`. */
const unqualifySchema = (ctx: ReverseCtx, node: Node): void => {
  if (isMember(node, ctx.schema) && node.optional !== true) {
    const name: string = node.property.name
    const { innerBound, module } = ctx.analysis
    const free = !innerBound.has(name) && !module.values.has(name) && !module.types.has(name)
    if (free && !excludedNames.has(name) && namespaceExports.get("Schema")!.has(name)) {
      ctx.s.remove(node.start, node.property.start)
    }
  }
  for (const child of children(node)) unqualifySchema(ctx, child)
}

const indentOf = (ctx: ReverseCtx, offset: number): string => {
  const lineStart = ctx.source.lastIndexOf("\n", offset - 1) + 1
  return /^[ \t]*/.exec(ctx.source.slice(lineStart, offset))![0]
}

/** Rewrites the fields object in place as a declaration body. */
const rewriteFields = (ctx: ReverseCtx, fields: Node, entries: ReadonlyArray<Field>): void => {
  entries.forEach((entry, i) => {
    const property: Node = entry.property
    if (entry.kind === "typed") {
      ctx.s.update(property.key.end, property.value.end, `${entry.optional}: ${entry.type}`)
    } else {
      ctx.s.update(property.key.end, property.value.start, " = ")
      unqualifySchema(ctx, property.value)
    }
    const next = entries[i + 1]?.property
    if (next !== undefined) {
      const comma = separatorComma(ctx, property.end, next.start)
      if (comma === -1) return
      if (ctx.source.slice(comma, next.start).includes("\n")) ctx.s.remove(comma, comma + 1)
      else ctx.s.update(comma, comma + 1, ";")
    }
  })
  const last = entries[entries.length - 1]?.property
  if (last !== undefined) {
    const comma = separatorComma(ctx, last.end, fields.end - 1)
    if (comma !== -1) ctx.s.remove(comma, comma + 1)
  }
}

/**
 * Rewrites a class recognized by `classShape`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertClass = (ctx: ReverseCtx, cls: Node, visit: Visit): boolean => {
  const shape = classShape(ctx, cls, true)
  if (shape === undefined) return false
  const { entries, fields, keyword, name } = shape
  // the text between the fields and the class body is removed, so it can't hold a comment
  if (commentsIn(ctx, fields.end, cls.body.start + 1).length > 0) return false
  replaceKeepingComments(ctx, cls.start, fields.start, `${keyword} ${name} `)
  if (shape.tagField) {
    // the forward compiler drops the `_tag` field's whole line
    const first: Node | undefined = entries[0]?.property
    const multiline = first !== undefined && ctx.source.slice(fields.start, first.start).includes("\n")
    const tag = `_tag: ${JSON.stringify(shape.tag)}`
    if (multiline) ctx.s.appendLeft(fields.start + 1, `\n${indentOf(ctx, first!.start)}${tag}`)
    else ctx.s.appendLeft(fields.start + 1, first === undefined ? ` ${tag} ` : ` ${tag};`)
  }
  rewriteFields(ctx, fields, entries)
  const members: Array<Node> = cls.body.body
  if (members.length === 0) {
    removeKeepingComments(ctx, fields.end, cls.end)
    return true
  }
  // `…fields\n}) {\n  member…\n}`: the forward compiler inserts `}) {\n` before the first member
  const close = fields.end - 1
  const atLineStart = ctx.source[close - 1] === "\n"
  const end = ctx.source[cls.body.start + 1] === "\n" && atLineStart ? cls.body.start + 2 : cls.body.start + 1
  ctx.s.remove(close, end)
  for (const member of members) visit(member, cls.body, false)
  return true
}

/** Whether `[from, to)` is a single line break, optionally with whole comment lines between. */
const joinedByLines = (ctx: ReverseCtx, from: number, to: number): boolean => {
  let text = ctx.source.slice(from, to)
  for (const comment of commentsIn(ctx, from, to)) text = text.replace(ctx.source.slice(comment.start, comment.end), "")
  return /^\n(?:\n)*$/.test(text) && text.split("\n").length - 1 === commentsIn(ctx, from, to).length + 1
}

const unwrap = (top: Node): { readonly statement: Node; readonly exported: boolean } =>
  top.type === "ExportNamedDeclaration" && top.declaration !== null
    ? { statement: top.declaration, exported: true }
    : { statement: top, exported: false }

/** `type X = typeof X.Type` */
const isTypeOf = (statement: Node, name: string): boolean =>
  statement.type === "TSTypeAliasDeclaration" && statement.id.name === name && !statement.typeParameters &&
  statement.typeAnnotation.type === "TSTypeQuery" && statement.typeAnnotation.exprName.type === "TSQualifiedName" &&
  statement.typeAnnotation.exprName.left.type === "Identifier" &&
  statement.typeAnnotation.exprName.left.name === name &&
  statement.typeAnnotation.exprName.right.name === "Type" && !statement.typeAnnotation.typeArguments

/**
 * `const X = <schema>` + `type X = typeof X.Type` → `schema X = <type>`, and runs of tagged classes
 * with their `Schema.Union` → the ADT form. Returns how many top-level statements it consumed.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertSchemaRun = (ctx: ReverseCtx, body: ReadonlyArray<Node>, index: number): number => {
  if (ctx.schema === undefined) return 0
  const tops = body.slice(index)
  const first = unwrap(tops[0]!)
  // the ADT form: tagged classes named after their tags, then the union and its type
  const variants: Array<{ name: string; entries: ReadonlyArray<Field> }> = []
  for (const top of tops) {
    const { exported, statement } = unwrap(top)
    if (statement.type !== "ClassDeclaration" || exported !== first.exported || statement.body.body.length > 0) break
    const shape = superShape(ctx, statement)
    if (shape?.keyword !== "schema" || shape.tag !== shape.name || shape.fields?.type !== "ObjectExpression") break
    if (variants.length > 0 && !joinedByLines(ctx, tops[variants.length - 1]!.end, top.start)) break
    if (commentsIn(ctx, top.start, top.end).length > 0) break
    const entries = entriesOf(ctx, shape.fields, false)
    if (entries === undefined || commentsIn(ctx, shape.fields.start, shape.fields.end).length > 0) break
    variants.push({ name: shape.name, entries })
  }
  if (variants.length > 0) {
    const union = tops[variants.length] === undefined ? undefined : unwrap(tops[variants.length]!)
    const alias = tops[variants.length + 1] === undefined ? undefined : unwrap(tops[variants.length + 1]!)
    const declarator: Node | undefined = union?.statement.type === "VariableDeclaration" &&
        union.statement.kind === "const" && union.statement.declarations.length === 1
      ? union.statement.declarations[0]
      : undefined
    const call: Node | undefined = declarator?.init ?? undefined
    const members: Array<Node> | undefined =
      call?.type === "CallExpression" && isMember(call.callee, ctx.schema, "Union") &&
        call.arguments.length === 1 && call.arguments[0].type === "ArrayExpression"
        ? call.arguments[0].elements
        : undefined
    const name: string | undefined = declarator?.id.type === "Identifier" ? declarator.id.name : undefined
    if (
      name !== undefined && members !== undefined && union!.exported === first.exported &&
      alias?.exported === first.exported && isTypeOf(alias.statement, name) && !declarator!.id.typeAnnotation &&
      members.length === variants.length && members.every((m, i) =>
        m?.type === "Identifier" && m.name === variants[i]!.name
      ) &&
      ctx.source.slice(tops[variants.length - 1]!.end, tops[variants.length]!.start) === "\n" &&
      ctx.source.slice(tops[variants.length]!.end, tops[variants.length + 1]!.start) === "\n" &&
      commentsIn(ctx, tops[variants.length]!.start, tops[variants.length + 1]!.end).length === 0
    ) {
      const lines = variants.map((variant, i) => {
        const fields = variant.entries.map((e) =>
          e.kind === "typed" ? `${slice(ctx, e.property.key)}${e.optional}: ${e.type}` : ""
        )
        const comments = i === 0 ? [] : commentsIn(ctx, tops[i - 1]!.end, tops[i]!.start)
        const commentLines = comments.map((c) => `  ${ctx.source.slice(c.start, c.end)}\n`).join("")
        return `${commentLines}  | ${variant.name} ${fields.length === 0 ? "{}" : `{ ${fields.join("; ")} }`}`
      })
      const start = tops[0]!.start
      const prefix = first.exported ? "export " : ""
      ctx.s.update(start, tops[variants.length + 1]!.end, `${prefix}schema ${name} =\n${lines.join("\n")}`)
      return variants.length + 2
    }
  }
  // the alias form
  const second = tops[1] === undefined ? undefined : unwrap(tops[1])
  if (
    first.statement.type === "VariableDeclaration" && first.statement.kind === "const" &&
    first.statement.declarations.length === 1 && second !== undefined && second.exported === first.exported
  ) {
    const declarator: Node = first.statement.declarations[0]
    const name: string | undefined = declarator.id.type === "Identifier" ? declarator.id.name : undefined
    if (
      name === undefined || declarator.id.typeAnnotation || declarator.init === null ||
      !isTypeOf(second.statement, name) || ctx.source.slice(tops[0]!.end, tops[1]!.start) !== "\n" ||
      commentsIn(ctx, tops[0]!.start, tops[1]!.end).length > 0
    ) {
      return 0
    }
    const type = schemaToType(ctx.source, ctx.schema, declarator.init)
    if (type === undefined || slice(ctx, declarator.init) === "") return 0
    ctx.s.update(tops[0]!.start, tops[1]!.end, `${first.exported ? "export " : ""}schema ${name} = ${type}`)
    return 2
  }
  return 0
}
