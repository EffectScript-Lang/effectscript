/**
 * `is` tag tests (ADR-0087): `s is A` → `s._tag === "A"`, `s is A or B` →
 * `s._tag === "A" || s._tag === "B"`, `s is not A` → `s._tag !== "A"`, and `is A` alone →
 * `(e) => e._tag === "A"`. The comparison is what Effect code writes by hand, so TypeScript rejects
 * a tag the value can't have (TS2367) and narrows on it.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk } from "../walk.ts"
import { isParenthesized } from "./await.ts"
import type { HandlerGroup } from "./registry.ts"
import { isPlainReference, tagOf } from "./tags.ts"

/** Binary operator precedences, as acorn numbers them. */
const precedence: Readonly<Record<string, number>> = {
  "??": 1,
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "===": 6,
  "!==": 6,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  instanceof: 7,
  in: 7,
  "<<": 8,
  ">>": 8,
  ">>>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
  "**": 11
}

/** Subjects that take `._tag` as written. */
const memberReady = new Set([
  "Identifier",
  "ThisExpression",
  "MemberExpression",
  "CallExpression",
  "TSNonNullExpression",
  "ChainExpression"
])

/** Whether a comparison whose loosest operator has precedence `own` needs parentheses in `parent`. */
const comparisonNeedsParens = (node: Node, parent: Node | undefined, own: number): boolean => {
  if (parent === undefined) return false
  switch (parent.type) {
    case "BinaryExpression":
    case "LogicalExpression": {
      // `??` never mixes with `||` or `&&` without parentheses
      if (parent.operator === "??" && own <= 2) return true
      const outer = precedence[parent.operator]!
      return outer > own || (outer === own && parent.right === node)
    }
    case "UnaryExpression":
    case "AwaitExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
      return true
    case "MemberExpression":
      return parent.object === node
    case "CallExpression":
    case "NewExpression":
      return parent.callee === node
    case "TaggedTemplateExpression":
      return parent.tag === node
    case "IsExpression":
      return parent.subject === node
    default:
      return false
  }
}

/** Whether an arrow needs parentheses in `parent` (an operand would become part of its body). */
const arrowNeedsParens = (node: Node, parent: Node | undefined): boolean => {
  if (parent === undefined) return false
  switch (parent.type) {
    case "CallExpression":
    case "NewExpression":
      return parent.callee === node
    case "ConditionalExpression":
      return parent.test === node
    case "Property":
    case "ArrayExpression":
    case "VariableDeclarator":
    case "AssignmentExpression":
    case "AssignmentPattern":
    case "ReturnStatement":
    case "ArrowFunctionExpression":
    case "PropertyDefinition":
    case "ExportDefaultDeclaration":
    case "TemplateLiteral":
    case "SequenceExpression":
    case "SpreadElement":
    case "YieldExpression":
    case "PipelineExpression":
    case "JSXExpressionContainer":
      return false
    default:
      return true
  }
}

const wrap = (ctx: Ctx, node: Node): void => {
  ctx.s.prependRight(node.start, "(")
  ctx.s.appendLeft(node.end, ")")
}

const report = (ctx: Ctx, code: string, message: string, at: Node, hint: string): true => {
  ctx.diagnostics.push(diagnosticError(code, message, at.start, at.end, hint))
  return true
}

const isExpression: Handler = (node, parent, ctx) => {
  const subject: Node | null = node.subject
  const pattern: Node = node.pattern
  const tags: Array<Node> = pattern.tags
  const invalid = tags.find((t) => t.type !== "Identifier" && t.type !== "MemberExpression")
  if (invalid !== undefined) {
    return report(
      ctx,
      "EFX7004",
      "`is` takes tag names: other patterns aren't supported yet",
      invalid,
      "Compare the value directly, as in `x === 404`"
    )
  }
  if (pattern.negated && !pattern.parenthesized && tags.length > 1) {
    return report(ctx, "EFX7003", "`not` with `or` needs parentheses", pattern, "Write `not (A or B)`")
  }
  if (subject === null && parent?.type === "ExpressionStatement") {
    return report(
      ctx,
      "EFX7005",
      "This predicate does nothing on its own",
      node,
      "Keep `is` on the line of the value it tests"
    )
  }
  if (subject !== null && tags.length > 1 && !isPlainReference(subject)) {
    return report(
      ctx,
      "EFX7002",
      "The subject of `or` is read once per tag, so it can't contain a call",
      subject,
      "Bind it to a `const` first"
    )
  }
  const operator = pattern.negated ? "!==" : "==="
  const join = pattern.negated ? " && " : " || "
  let target = "e"
  if (subject === null) {
    ctx.s.update(node.start, tags[0]!.start, `(e) => e._tag ${operator} `)
  } else {
    walk(subject, node, ctx)
    if (!memberReady.has(subject.type) && !isParenthesized(ctx.source, subject)) wrap(ctx, subject)
    target = ctx.s.slice(subject.start, subject.end)
    ctx.s.update(subject.end, tags[0]!.start, `._tag ${operator} `)
  }
  tags.forEach((tag, i) => {
    if (i > 0) ctx.s.update(tags[i - 1]!.end, tag.start, `${join}${target}._tag ${operator} `)
    // the last tag's edit also covers a group's `)`, so a closing parenthesis appended at the
    // node's end lands on a live chunk
    const end = i === tags.length - 1 && pattern.parenthesized ? pattern.end : tag.end
    ctx.s.update(tag.start, end, JSON.stringify(tagOf(ctx, tag)))
  })
  const needed = subject === null
    ? arrowNeedsParens(node, parent)
    : comparisonNeedsParens(node, parent, tags.length === 1 ? 6 : pattern.negated ? 2 : 1)
  if (needed && !isParenthesized(ctx.source, node)) wrap(ctx, node)
  // the pattern's names are tags, not references: they are never walked (no prelude import)
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const isHandlers: HandlerGroup = {
  IsExpression: isExpression
}
