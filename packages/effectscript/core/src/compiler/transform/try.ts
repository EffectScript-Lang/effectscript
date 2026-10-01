/**
 * Effectful `try` (its block contains `await`/`throw`) → `Effect.gen(…).pipe(catch…, ensuring)`.
 * A plain `try` (no effects inside) keeps JavaScript semantics.
 *
 * @since 0.1.0
 */
import { children, containsThis, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { walk, walkInScopeOf } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

const boundaryTypes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "EffectBlock"
])

/**
 * Whether `predicate` holds somewhere in `node` without crossing into nested functions/effects.
 *
 * @since 0.1.0
 * @category utils
 */
export const containsAtLevel = (node: Node, predicate: (node: Node) => boolean): boolean => {
  if (predicate(node)) return true
  if (boundaryTypes.has(node.type) || node.efx !== undefined) return false
  return children(node).some((child) => containsAtLevel(child, predicate))
}

/**
 * @since 0.1.0
 * @category utils
 */
export const isEffectful = (node: Node): boolean =>
  containsAtLevel(
    node,
    (n) =>
      n.type === "AwaitExpression" || n.type === "ThrowStatement" || n.type === "ThrowExpression" ||
      n.type === "DeferStatement" || (n.type === "ForOfStatement" && n.await === true)
  )

/**
 * @since 0.1.0
 * @category utils
 */
export const alwaysExits = (node: Node | null | undefined): boolean => {
  if (node === null || node === undefined) return false
  switch (node.type) {
    case "ReturnStatement":
    case "ThrowStatement":
      return true
    case "BlockStatement":
      return node.body.length > 0 && alwaysExits(node.body[node.body.length - 1])
    case "IfStatement":
      return alwaysExits(node.consequent) && alwaysExits(node.alternate)
    default:
      return false
  }
}

const loopTypes = /^(For|ForIn|ForOf|While|DoWhile)Statement$/

/**
 * A `break`/`continue` inside `node` whose target lies outside `node`.
 *
 * @since 0.1.0
 * @category utils
 */
export const findCrossingJump = (
  node: Node,
  loops = 0,
  switches = 0,
  labels: ReadonlySet<string> = new Set()
): Node | undefined => {
  if (boundaryTypes.has(node.type) || node.efx !== undefined) return undefined
  if (node.type === "BreakStatement") {
    if (node.label ? !labels.has(node.label.name) : loops + switches === 0) return node
  }
  if (node.type === "ContinueStatement") {
    if (node.label ? !labels.has(node.label.name) : loops === 0) return node
  }
  const loop = loopTypes.test(node.type) ? 1 : 0
  const isSwitch = node.type === "SwitchStatement" ? 1 : 0
  const nextLabels = node.type === "LabeledStatement" ? new Set([...labels, node.label.name as string]) : labels
  for (const child of children(node)) {
    const found = findCrossingJump(child, loops + loop, switches + isSwitch, nextLabels)
    if (found !== undefined) return found
  }
  return undefined
}

const lastSegment = (name: Node): string => (name.type === "TSQualifiedName" ? name.right.name : name.name)

const tagsOf = (clause: Node): Array<string> | undefined => {
  const annotation: Node | undefined = clause.param?.typeAnnotation?.typeAnnotation
  if (annotation === undefined) return undefined
  const types: Array<Node> = annotation.type === "TSUnionType" ? annotation.types : [annotation]
  return types.every((t) => t.type === "TSTypeReference") ? types.map((t) => lastSegment(t.typeName)) : undefined
}

const paramText = (ctx: Ctx, clause: Node): string => {
  const param: Node | null = clause.param
  if (param === null) return ""
  if (param.type === "Identifier") return param.name
  return ctx.source.slice(param.start, param.typeAnnotation?.start ?? param.end).trim()
}

const isReturn = (n: Node) => n.type === "ReturnStatement"

interface Part {
  readonly bodyStart: number
  readonly open: string
  readonly close: string
}

const tryStatement: Handler = (node, _parent, ctx) => {
  const clauses: Array<Node> = node.handlers ?? (node.handler ? [node.handler] : [])
  if (ctx.effect === undefined) {
    if (clauses.length > 1) {
      ctx.diagnostics.push(
        diagnosticError(
          "EFX2024",
          "Multiple `catch` clauses are only valid inside `effect` code",
          clauses[1]!.start,
          clauses[1]!.start + 5
        )
      )
    }
    return
  }
  if (!isEffectful(node.block)) {
    const typed = clauses.find((c) => tagsOf(c) !== undefined)
    if (typed !== undefined || clauses.length > 1) {
      const at = typed ?? clauses[1]!
      ctx.diagnostics.push(
        diagnosticError(
          "EFX2022",
          "Typed or multiple `catch` clauses need an effectful `try` (one that uses `await` or `throw`)",
          at.start,
          at.start + 5,
          "a `try` around synchronous code catches JavaScript exceptions; decode with Schema or use Effect.try instead"
        )
      )
    }
    return
  }

  for (const [i, clause] of clauses.entries()) {
    if (tagsOf(clause) === undefined && i < clauses.length - 1) {
      ctx.diagnostics.push(
        diagnosticError("EFX2023", "An untyped `catch` must be the last clause", clause.start, clause.start + 5)
      )
    }
  }
  for (const part of [node.block, ...clauses.map((c) => c.body)]) {
    const jump = findCrossingJump(part)
    if (jump !== undefined) {
      ctx.diagnostics.push(
        diagnosticError("EFX2021", "`break`/`continue` cannot cross an effectful `try`", jump.start, jump.end)
      )
    }
  }
  if (node.finalizer !== null && containsAtLevel(node.finalizer, isReturn)) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2021",
        "`return` is not allowed in `finally` inside `effect`",
        node.finalizer.start,
        node.finalizer.end
      )
    )
  }

  const bodies: Array<Node> = [node.block, ...clauses.map((c) => c.body)]
  const anyReturn = bodies.some((b) => containsAtLevel(b, isReturn))
  const allExit = bodies.every((b) => alwaysExits(b))
  if (anyReturn && !allExit) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2020",
        "An effectful `try` must return on every path or on none",
        node.start,
        node.start + 3,
        "move the code after the `try` into each branch, or assign to a variable and return after the `try`"
      )
    )
  }

  ctx.imports.need("effect", "Effect")
  const gen = `Effect.gen(${containsThis(node) ? "{ self: this }, " : ""}function*() `
  ctx.s.update(node.start, node.block.start, `${anyReturn && allExit ? "return " : ""}yield* ${gen}`)

  const typedClauses = clauses.filter((c) => tagsOf(c) !== undefined)
  const grouped = typedClauses.length > 1 && typedClauses.every((c) => tagsOf(c)!.length === 1)
  // A final untyped clause after typed ones becomes `orElse`, so failures raised inside a typed
  // clause propagate instead of being caught by a sibling clause (JavaScript semantics).
  const last = clauses[clauses.length - 1]
  const orElse = typedClauses.length > 0 && last !== undefined && tagsOf(last) === undefined
  const lastTyped = typedClauses[typedClauses.length - 1]
  const parts: Array<Part> = clauses.map((clause) => {
    const tags = tagsOf(clause)
    const handler = `(${paramText(ctx, clause)}) => ${gen}`
    if (tags === undefined) {
      return orElse
        ? { bodyStart: clause.body.start, open: handler, close: "))" }
        : { bodyStart: clause.body.start, open: `Effect.catch(${handler}`, close: "))" }
    }
    const keepOpen = orElse && clause === lastTyped
    if (grouped) {
      const index = typedClauses.indexOf(clause)
      return {
        bodyStart: clause.body.start,
        open: `${index === 0 ? "Effect.catchTags({ " : ""}${tags[0]}: ${handler}`,
        close: index === typedClauses.length - 1 ? (keepOpen ? ") }" : ") })") : ")"
      }
    }
    const tag = tags.length === 1 ? JSON.stringify(tags[0]) : `[${tags.map((t) => JSON.stringify(t)).join(", ")}]`
    return { bodyStart: clause.body.start, open: `Effect.catchTag(${tag}, ${handler}`, close: keepOpen ? ")" : "))" }
  })
  if (node.finalizer !== null) {
    parts.push({ bodyStart: node.finalizer.start, open: `Effect.ensuring(${gen}`, close: "))" })
  }
  const ends: Array<number> = [node.block.end, ...clauses.map((c) => c.body.end as number)]
  parts.forEach((part, i) => {
    const join = i === 0 ? `).pipe(${part.open}` : `${parts[i - 1]!.close}, ${part.open}`
    ctx.s.update(ends[i]!, part.bodyStart, join)
  })
  ctx.s.appendLeft(node.end, `${parts[parts.length - 1]!.close})`)

  walk(node.block, node, ctx)
  for (const clause of clauses) walkInScopeOf(clause, clause.body, clause, ctx)
  if (node.finalizer !== null) walk(node.finalizer, node, ctx)
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const tryHandlers: HandlerGroup = {
  TryStatement: tryStatement
}
