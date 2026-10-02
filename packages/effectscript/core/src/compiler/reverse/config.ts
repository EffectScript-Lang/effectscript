/**
 * `const X = Config.all({ k: Config.T("K")[.pipe(Config.withDefault(d))], … })` → `config X { k: T [= d] }`
 * (spec §4.14): the inverse of `transform/config.ts`.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import type { Visit } from "./body.ts"
import { commentsIn, endsAt, type ReverseCtx, separatorComma, slice, within } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"

const named = new Set(["Int", "Finite", "Port", "LogLevel", "Redacted", "Duration", "URL", "Date", "NonEmptyString"])
const keywords: Record<string, string> = { String: "string", Number: "number", Boolean: "boolean" }
const typeKeywords = new Set(["string", "number", "boolean", "bigint", "symbol", "object", "any", "unknown", "never"])

/** `databaseUrl` → `DATABASE_URL` (the forward `screamingSnake`). */
const screamingSnake = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toUpperCase()

const isLiteral = (node: Node | null): boolean =>
  node !== null && (
    node.type === "Literal" && node.regex === undefined && node.bigint === undefined
  )

interface Field {
  readonly property: Node
  readonly text: string
  readonly fallback: Node | undefined
}

/** A field's EffectScript text (`key[?]: T`) and default, or `undefined`. */
const fieldOf = (ctx: ReverseCtx, C: string, property: Node): Field | undefined => {
  if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) return undefined
  if (property.shorthand || property.key.type !== "Identifier") return undefined
  const key: string = property.key.name
  const env = JSON.stringify(screamingSnake(key))
  let value: Node = property.value
  let fallback: Node | undefined
  // `….pipe(Config.withDefault(d))`
  if (
    value.type === "CallExpression" && value.callee.type === "MemberExpression" && !value.callee.computed &&
    value.callee.property.name === "pipe"
  ) {
    const step: Node | undefined = value.arguments.length === 1 ? value.arguments[0] : undefined
    if (step?.type !== "CallExpression" || !isMember(step.callee, C, "withDefault") || step.arguments.length !== 1) {
      return undefined
    }
    fallback = step.arguments[0]
    value = value.callee.object
  }
  let optional = ""
  if (value.type === "CallExpression" && isMember(value.callee, C, "option") && value.arguments.length === 1) {
    optional = "?"
    value = value.arguments[0]
  }
  if (value.type !== "CallExpression" || value.callee.type !== "MemberExpression" || !isMember(value.callee, C)) {
    return undefined
  }
  const constructor: string = value.callee.property.name
  const args: Array<Node> = value.arguments
  const last = args[args.length - 1]
  if (last === undefined || slice(ctx, last) !== env) return undefined
  let type: string | undefined
  if (keywords[constructor] !== undefined && args.length === 1) type = keywords[constructor]
  else if (named.has(constructor) && args.length === 1) type = constructor
  else if (constructor === "Literal" && args.length === 2 && isLiteral(args[0]!)) type = slice(ctx, args[0]!)
  else if (
    constructor === "Literals" && args.length === 2 && args[0]!.type === "ArrayExpression" &&
    args[0]!.elements.length > 1 && (args[0]!.elements as Array<Node>).every(isLiteral)
  ) {
    type = (args[0]!.elements as Array<Node>).map((e) => slice(ctx, e)).join(" | ")
  } else if (
    constructor === "schema" && args.length === 2 && args[0]!.type === "Identifier" &&
    !named.has(args[0]!.name) && !typeKeywords.has(args[0]!.name)
  ) {
    type = args[0]!.name
  }
  if (type === undefined) return undefined
  return { property, text: `${key}${optional}: ${type}`, fallback }
}

/**
 * Rewrites a top-level `Config.all` declaration. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertConfig = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  const C = importedLocal(ctx.analysis, "effect", "Config")
  if (C === undefined || statement.type !== "VariableDeclaration" || statement.kind !== "const") return false
  if (statement.declarations.length !== 1) return false
  const declarator: Node = statement.declarations[0]
  const call: Node | null = declarator.init
  if (declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || call?.type !== "CallExpression") {
    return false
  }
  if (
    !isMember(call.callee, C, "all") || call.arguments.length !== 1 || call.arguments[0].type !== "ObjectExpression"
  ) {
    return false
  }
  const object: Node = call.arguments[0]
  if (ctx.source.slice(object.end, call.end) !== ")" || !endsAt(ctx, statement, call.end)) return false
  const fields = (object.properties as Array<Node>).map((p) => fieldOf(ctx, C, p))
  if (fields.length === 0 || fields.some((f) => f === undefined)) return false
  // the declaration head and each field are rewritten whole, so they can't hold comments
  if (commentsIn(ctx, statement.start, object.start + 1).length > 0) return false
  if (
    (fields as Array<Field>).some((f) => commentsIn(ctx, f.property.start, (f.fallback ?? f.property).start).length > 0)
  ) {
    return false
  }
  ctx.s.update(statement.start, object.start + 1, `config ${declarator.id.name} {`)
  ;(fields as Array<Field>).forEach((field, i) => {
    const property: Node = field.property
    if (field.fallback === undefined) {
      ctx.s.update(property.start, property.end, field.text)
    } else {
      ctx.s.update(property.start, field.fallback.start, `${field.text} = `)
      ctx.s.remove(field.fallback.end, property.end)
      within(ctx, "Effect", () => visit(field.fallback!, property, false))
    }
    // `,` → nothing before a line break, `;` within a line
    const next = (fields as Array<Field>)[i + 1]?.property
    const comma = separatorComma(ctx, property.end, next?.start ?? object.end - 1)
    if (comma === -1) return
    if (next === undefined || ctx.source.slice(comma, next.start).includes("\n")) ctx.s.remove(comma, comma + 1)
    else ctx.s.update(comma, comma + 1, ";")
  })
  ctx.s.update(object.end - 1, call.end, "}")
  return true
}
