/**
 * `s._tag === "A"` → `s is A`, its `||` and `&&` chains → `or`, and `(e) => e._tag === "A"` →
 * `is A` (ADR-0087). Each rewrite compiles back to its input (ADR-0030).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { isParenthesized } from "../transform/await.ts"
import { isPlainReference } from "../transform/tags.ts"
import type { Visit } from "./body.ts"
import type { ReverseCtx } from "./context.ts"

const identifierName = /^[A-Za-z_$][\w$]*$/

/** Names that can't follow `is` as a tag, or that read as TC39's primitive checks (ADR-0087 Amendment 1). */
const refused = new Set([
  "as",
  "satisfies",
  "of",
  "or",
  "not",
  "String",
  "Number",
  "Boolean",
  "BigInt",
  "Symbol",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
])

interface Test {
  readonly node: Node
  readonly subject: Node
  readonly tag: string
  readonly negated: boolean
}

/** `s._tag === "A"` or `s._tag !== "A"`. */
const tagTest = (node: Node): Test | undefined => {
  if (node.type !== "BinaryExpression" || (node.operator !== "===" && node.operator !== "!==")) return undefined
  const left: Node = node.left
  const right: Node = node.right
  if (left.type !== "MemberExpression" || left.computed || left.optional || left.property.name !== "_tag") {
    return undefined
  }
  if (right.type !== "Literal" || typeof right.value !== "string") return undefined
  return { node, subject: left.object, tag: right.value, negated: node.operator === "!==" }
}

/** One test, or a chain on one plain subject: `||` of `===`, or `&&` of `!==`. */
const chainOf = (ctx: ReverseCtx, node: Node): ReadonlyArray<Test> | undefined => {
  const single = tagTest(node)
  if (single !== undefined) return [single]
  if (node.type !== "LogicalExpression" || (node.operator !== "||" && node.operator !== "&&")) return undefined
  const operands: Array<Node> = []
  const flatten = (n: Node): void => {
    if (
      n.type === "LogicalExpression" && n.operator === node.operator && (n === node || !isParenthesized(ctx.source, n))
    ) {
      flatten(n.left)
      flatten(n.right)
    } else {
      operands.push(n)
    }
  }
  flatten(node)
  if (operands.some((n) => isParenthesized(ctx.source, n))) return undefined
  const tests = operands.map(tagTest)
  const negated = node.operator === "&&"
  if (tests.some((t) => t === undefined || t.negated !== negated)) return undefined
  const text = (t: Test) => ctx.source.slice(t.subject.start, t.subject.end)
  const first = tests[0]!
  if (!isPlainReference(first.subject) || tests.some((t) => text(t!) !== text(first))) return undefined
  return tests as ReadonlyArray<Test>
}

/** The name `is` writes for a tag: the one module class that has it, or the tag itself when the forward compiler reads it back. */
const nameFor = (ctx: ReverseCtx, tag: string): string | undefined => {
  if (!identifierName.test(tag) || refused.has(tag)) return undefined
  const owners = [...ctx.analysis.localTags].filter(([, t]) => t === tag).map(([name]) => name)
  if (owners.length === 1) return owners[0]
  const own = ctx.analysis.localTags.get(tag)
  return own === undefined || own === tag ? tag : undefined
}

const patternText = (tests: ReadonlyArray<Test>, names: ReadonlyArray<string>): string => {
  const negated = tests[0]!.negated
  const list = names.join(" or ")
  return negated ? (names.length > 1 ? `not (${list})` : `not ${list}`) : list
}

/** The `.` of `s._tag`: everything from it to the test's end is replaced. */
const dotOf = (ctx: ReverseCtx, test: Test): number => ctx.source.lastIndexOf(".", test.node.left.property.start)

const convertPredicate = (ctx: ReverseCtx, node: Node): boolean => {
  if (node.async === true || node.params.length !== 1 || node.returnType || node.typeParameters) return false
  const param: Node = node.params[0]
  if (param.type !== "Identifier" || param.name !== "e" || param.typeAnnotation) return false
  if (ctx.source[node.start] !== "(" || node.body.type === "BlockStatement" || isParenthesized(ctx.source, node.body)) {
    return false
  }
  const tests = chainOf(ctx, node.body)
  if (tests === undefined || tests.some((t) => t.subject.type !== "Identifier" || t.subject.name !== "e")) return false
  const names = tests.map((t) => nameFor(ctx, t.tag))
  if (names.some((n) => n === undefined)) return false
  ctx.s.update(node.start, node.end, `is ${patternText(tests, names as Array<string>)}`)
  return true
}

/**
 * @since 4.0.0
 * @category reverse
 */
export const convertTagTest = (ctx: ReverseCtx, node: Node, visit: Visit, generator: boolean): boolean => {
  if (node.type === "ArrowFunctionExpression") return convertPredicate(ctx, node)
  const tests = chainOf(ctx, node)
  if (tests === undefined) return false
  const names = tests.map((t) => nameFor(ctx, t.tag))
  if (names.some((n) => n === undefined)) return false
  visit(tests[0]!.subject, tests[0]!.node.left, generator)
  ctx.s.update(dotOf(ctx, tests[0]!), node.end, ` is ${patternText(tests, names as Array<string>)}`)
  return true
}
