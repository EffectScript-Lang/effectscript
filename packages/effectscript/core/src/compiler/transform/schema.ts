/**
 * `schema` (class / alias / ADT) and `error` declarations.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { typeToSchema } from "../schema/mapping.ts"
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
  ctx.imports.need("effect", "Schema")
  const name: string = node.id.name
  const { fields, members, tag } = fieldsOf(node)
  const tagName = tagValue(tag)
  ctx.s.update(node.efxKeyword.start, node.efxKeyword.end, "class")
  const header = node.efxKind === "error"
    ? `Schema.TaggedError<${name}>()(${JSON.stringify(tagName ?? name)}, `
    : tagName !== undefined
    ? `Schema.TaggedClass<${name}>()(${JSON.stringify(tagName)}, `
    : `Schema.Class<${name}>(${JSON.stringify(name)})(`
  ctx.s.update(node.id.end, node.body.start, ` extends ${header}`)
  if (tag !== undefined) removeLine(ctx, tag)
  fields.forEach((field, i) => rewriteField(ctx, field, i === fields.length - 1))
  moveMembersAfter(ctx, node.body, members, "})")
  for (const member of members) walk(member, node.body, ctx)
  return true
}

const schemaAlias: Handler = (node, parent, ctx) => {
  ctx.imports.need("effect", "Schema")
  const prefix = parent?.type === "ExportNamedDeclaration" ? "export " : ""
  const name: string = node.id.name
  ctx.s.update(
    node.start,
    node.end,
    `const ${name} = ${typeToSchema(ctx, node.typeAnnotation)}\n${prefix}type ${name} = typeof ${name}.Type`
  )
  return true
}

const schemaAdt: Handler = (node, parent, ctx) => {
  ctx.imports.need("effect", "Schema")
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
          "use a class-form schema with a `_tag` field"
        )
      )
    }
    const struct = fields.length === 0 ? "{}" : `{ ${
      fields.map((f) => {
        const schema = typeToSchema(ctx, f.typeAnnotation.typeAnnotation)
        return `${f.key.name}: ${f.optional === true ? `Schema.optional(${schema})` : schema}`
      }).join(", ")
    } }`
    return `${i === 0 ? "" : prefix}class ${variantName} extends Schema.TaggedClass<${variantName}>()(${
      JSON.stringify(variantName)
    }, ${struct}) {}`
  })
  const name: string = node.id.name
  lines.push(
    `${prefix}const ${name} = Schema.Union([${(node.variants as Array<Node>).map((v) => v.id.name).join(", ")}])`
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
  SchemaAdtDeclaration: schemaAdt
}
