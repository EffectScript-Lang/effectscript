/**
 * `schema` (class / alias / ADT) and `error` declarations.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { checkedParts, fieldSchema, lowerChecks, schemaRef, typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"
import { fieldsOf, moveMembersAfter, removeLine, rewriteField } from "./classLike.ts"
import type { HandlerGroup } from "./registry.ts"

const tagValue = (tag: Node | undefined): string | undefined => {
  const literal = tag?.typeAnnotation?.typeAnnotation
  return literal?.type === "TSLiteralType" ? String(literal.literal.value) : undefined
}

const schemaClass: Handler = (node, _parent, ctx) => {
  if (node.efxKind !== "schema" && node.efxKind !== "error") return
  if (node.superClass !== null || node.typeParameters !== undefined) {
    ctx.diagnostics.push(
      diagnosticError("EFX3002", "`extends` and type parameters are not supported here", node.start, node.body.start)
    )
    return true
  }
  const name: string = node.id.name
  const { fields, members, tag } = fieldsOf(node)
  const tagName = tagValue(tag)
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "class")
  const header = node.efxKind === "error"
    ? `${schemaRef(ctx, "TaggedError")}<${name}>()(${JSON.stringify(tagName ?? name)}, `
    : tagName !== undefined
    ? `${schemaRef(ctx, "TaggedClass")}<${name}>()(${JSON.stringify(tagName)}, `
    : `${schemaRef(ctx, "Class")}<${name}>(${JSON.stringify(name)})(`
  if (node.body.start > node.id.end) ctx.s.update(node.id.end, node.body.start, ` extends ${header}`)
  else ctx.s.appendLeft(node.id.end, ` extends ${header}`)
  if (tag !== undefined) removeLine(ctx, tag)
  fields.forEach((field, i) => rewriteField(ctx, field, i === fields.length - 1))
  // an error's HTTP status (`status 404`, replaced with the header above) is Effect's own
  // annotation, read by HttpApi (ADR-0064)
  const status: Node | undefined = node.efxStatus
  const close = status === undefined ? "})" : `}, { httpApiStatus: ${status.raw} })`
  // `error Forbidden`: the empty body the declaration doesn't write (ADR-0300 A4)
  if (node.efxBodyless === true) ctx.s.appendLeft(node.body.end, `{${close} {}`)
  else moveMembersAfter(ctx, node.body, members, close)
  for (const member of members) walk(member, node.body, ctx)
  return true
}

/** Comments (verbatim) found in `source` between two offsets. */
const commentsBetween = (source: string, from: number, to: number): Array<string> =>
  [...source.slice(from, to).matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)].map((m) => m[0])

/** `Schema.Struct({ … })` for an alias type literal, keeping member comments (multi-line when present). */
const aliasSchema = (ctx: Ctx, type: Node): string => {
  if (type.type !== "TSTypeLiteral") return typeToSchema(ctx, type)
  let previous = type.start + 1
  let hasComments = false
  const members = (type.members as Array<Node>).map((member) => {
    const comments = commentsBetween(ctx.source, previous, member.start)
    previous = member.end
    if (comments.length > 0) hasComments = true
    const struct = typeToSchema(ctx, { ...type, members: [member] } as Node)
    const body = struct.slice(`${schemaRef(ctx, "Struct")}({ `.length, -" })".length)
    return { comments, body }
  })
  if (!hasComments) return typeToSchema(ctx, type)
  const lines = members.flatMap(({ body, comments }, i) => [
    ...comments.map((c) => `  ${c}`),
    `  ${body}${i === members.length - 1 ? "" : ","}`
  ])
  return `${schemaRef(ctx, "Struct")}({\n${lines.join("\n")}\n})`
}

/** `schema { … }` → `Schema.Struct({ … })`, as an alias's type literal lowers. */
const schemaExpression: Handler = (node, _parent, ctx) => {
  ctx.s.update(node.start, node.end, aliasSchema(ctx, node.typeAnnotation))
  return true
}

const typeLine = (prefix: string, name: string): string => `\n${prefix}type ${name} = typeof ${name}.Type`

/**
 * Writes `const Name = <schema>` and its type over an alias or a brand. The name stays in place, so
 * the editor maps it to the `const` (hover, go to definition). `open` and `close` go around the
 * `where` checks, which stay where they are too (ADR-0077); without checks they are joined.
 */
const writeDeclaration = (ctx: Ctx, node: Node, prefix: string, open: string, close: string): void => {
  const name: string = node.id.name
  const clause: Node | null = node.efxWhere ?? null
  ctx.s.update(node.start, node.id.start, "const ")
  if (clause === null) {
    ctx.s.update(node.id.end, node.end, ` = ${open}${close}${typeLine(prefix, name)}`)
    return
  }
  lowerChecks(ctx, node.id.end, clause, ` = ${open}`, close)
  // the type line follows the checks; a trailing `;` goes
  if (node.end > clause.end) ctx.s.update(clause.end, node.end, typeLine(prefix, name))
  else ctx.s.appendLeft(clause.end, typeLine(prefix, name))
}

const schemaAlias: Handler = (node, parent, ctx) => {
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const type: Node = node.typeAnnotation
  if (node.efxWhere === null || node.efxWhere === undefined) {
    writeDeclaration(ctx, node, prefix, aliasSchema(ctx, type), "")
  } else {
    const { close, open } = checkedParts(ctx, type, false, node.efxWhere)
    writeDeclaration(ctx, node, prefix, open, close)
  }
  return true
}

/** `brand Name = T [where …]` → `const Name = <T>[.check(…)].pipe(Schema.brand("Name"))` and its type (ADR-0077). */
const brandDeclaration: Handler = (node, parent, ctx) => {
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const name: string = node.id.name
  const type: Node = node.typeAnnotation
  const inner: Node = type.type === "TSParenthesizedType" ? type.typeAnnotation : type
  const nullish = (inner.type === "TSUnionType" ? inner.types as Array<Node> : [inner]).find((t) =>
    t.type === "TSNullKeyword" || t.type === "TSUndefinedKeyword"
  )
  if (nullish !== undefined) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX3006",
        "A brand can't include `null` or `undefined`",
        nullish.start,
        nullish.end,
        `brand the value, and write \`${name} | null\` where it's used`
      )
    )
  }
  const brand = `.pipe(${schemaRef(ctx, "brand")}(${JSON.stringify(name)}))`
  if (node.efxWhere === null) writeDeclaration(ctx, node, prefix, aliasSchema(ctx, type), brand)
  else {
    const { close, open } = checkedParts(ctx, type, false, node.efxWhere)
    writeDeclaration(ctx, node, prefix, open, `${close}${brand}`)
  }
  return true
}

const schemaAdt: Handler = (node, parent, ctx) => {
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const lines = (node.variants as Array<Node>).map((variant, i) => {
    const variantName: string = variant.id.name
    const { fields, members } = fieldsOf(variant)
    if (members.length > 0 || fields.some((f) => f.value !== null && f.value !== undefined)) {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX3003",
          "ADT variants support typed fields only",
          variant.start,
          variant.end,
          "write checks with `where`, or use a class-form schema with a `_tag` field"
        )
      )
    }
    const struct = fields.length === 0 ? "{}" : `{ ${
      fields.map((f) => {
        if (f.typeAnnotation === undefined || f.typeAnnotation === null) {
          ctx.diagnostics.push(diagnosticError("EFX3004", "A field needs a type or `= <schema>`", f.start, f.end))
          return `${f.key.name}: ${schemaRef(ctx, "Unknown")}`
        }
        const type: Node = f.typeAnnotation.typeAnnotation
        return `${f.key.name}: ${fieldSchema(ctx, type, f.optional === true, f.efxWhere)}`
      }).join(", ")
    } }`
    const from = i === 0 ? node.id.end : (node.variants as Array<Node>)[i - 1]!.end
    const comments = commentsBetween(ctx.source, from, variant.start).map((c) => `${c}\n`).join("")
    return `${comments}${i === 0 ? "" : prefix}class ${variantName} extends ${
      schemaRef(ctx, "TaggedClass")
    }<${variantName}>()(${JSON.stringify(variantName)}, ${struct}) {}`
  })
  const name: string = node.id.name
  lines.push(
    `${prefix}const ${name} = ${schemaRef(ctx, "Union")}([${
      (node.variants as Array<Node>).map((v) => v.id.name).join(", ")
    }])`
  )
  lines.push(`${prefix}type ${name} = typeof ${name}.Type`)
  ctx.s.update(node.start, node.end, lines.join("\n"))
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const schemaHandlers: HandlerGroup = {
  ClassDeclaration: schemaClass,
  SchemaAliasDeclaration: schemaAlias,
  SchemaExpression: schemaExpression,
  BrandDeclaration: brandDeclaration,
  SchemaAdtDeclaration: schemaAdt
}
