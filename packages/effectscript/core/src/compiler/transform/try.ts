/**
 * `try` inside `effect` code → `Effect.gen(…).pipe(catchDefect?, catch…, ensuring)` (ADR-0010).
 * Outside `effect` code, `try` keeps JavaScript semantics.
 *
 * @since 0.1.0
 */
import type { Scope } from "../analyze/scope.ts"
import { children, containsThis, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref, unused } from "../names.ts"
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
export const isEffectful = (node: Node): boolean => effectfulNode(node) !== undefined

const effectfulTypes = new Set([
  "AwaitExpression",
  "ThrowStatement",
  "ThrowExpression",
  "DeferStatement",
  "TryStatement"
])

/**
 * The first node at this `effect` level that lowers to `yield*` (`await`, `throw`, `defer`, `try`,
 * `for await`), without crossing into nested functions/effects.
 *
 * @since 0.1.0
 * @category utils
 */
export const effectfulNode = (node: Node): Node | undefined => {
  if (effectfulTypes.has(node.type) || (node.type === "ForOfStatement" && node.await === true)) return node
  if (boundaryTypes.has(node.type) || node.efx !== undefined) return undefined
  for (const child of children(node)) {
    const found = effectfulNode(child)
    if (found !== undefined) return found
  }
  return undefined
}

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
    case "ExpressionStatement":
      return node.efxCompletion === true
    case "BlockStatement":
      return node.body.length > 0 && alwaysExits(node.body[node.body.length - 1])
    case "IfStatement":
      return alwaysExits(node.consequent) && alwaysExits(node.alternate)
    case "TryStatement": {
      const clauses: Array<Node> = node.handlers ?? (node.handler ? [node.handler] : [])
      return alwaysExits(node.finalizer) ||
        (alwaysExits(node.block) && clauses.every((clause) => alwaysExits(clause.body)))
    }
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

/** Whether the nearest binding of type name `name` is the module scope. */
const boundAtModule = (ctx: Ctx, name: string): boolean => {
  for (let scope: Scope | undefined = ctx.scope; scope !== undefined; scope = scope.parent) {
    if (scope.types.has(name)) return scope === ctx.analysis.module
  }
  return false
}

/** The `_tag`s a typed clause catches; `undefined` for an untyped clause. */
const tagsOf = (ctx: Ctx, clause: Node): Array<string> | undefined => {
  const annotation: Node | undefined = clause.param?.typeAnnotation?.typeAnnotation
  if (annotation === undefined || annotation.type === "TSUnknownKeyword" || annotation.type === "TSAnyKeyword") {
    return undefined
  }
  const types: Array<Node> = annotation.type === "TSUnionType" ? annotation.types : [annotation]
  if (!types.every((t) => t.type === "TSTypeReference")) return undefined
  return types.map((t) => {
    const name: Node = t.typeName
    if (name.type === "Identifier" && boundAtModule(ctx, name.name)) {
      const tag = ctx.analysis.localTags.get(name.name)
      if (tag !== undefined) return tag
    }
    return lastSegment(name)
  })
}

const paramText = (ctx: Ctx, clause: Node, typed: boolean): string => {
  const param: Node | null = clause.param
  if (param === null) return ""
  if (!typed) return ctx.source.slice(param.start, param.end)
  if (param.type === "Identifier") return param.name
  return ctx.source.slice(param.start, param.typeAnnotation?.start ?? param.end).trim()
}

const isReturn = (n: Node) => n.type === "ReturnStatement" || n.efxCompletion === true
const isIdentifierName = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name)

/**
 * Inside `effect` code every `try` compiles to Effect (ADR-0010): clauses are alternatives over the
 * original outcome; an untyped clause also catches defects (as `Cause.UnknownError`); interruption is
 * never caught; `finally` always runs.
 */
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

  const tags = clauses.map((clause) => tagsOf(ctx, clause))
  for (const [i, clause] of clauses.entries()) {
    if (tags[i] === undefined && i < clauses.length - 1) {
      ctx.diagnostics.push(
        diagnosticError("EFX2023", "An untyped `catch` must be the last clause", clause.start, clause.start + 5)
      )
    }
  }
  const seen = new Set<string>()
  for (const [i, clause] of clauses.entries()) {
    for (const tag of tags[i] ?? []) {
      if (seen.has(tag)) {
        ctx.diagnostics.push(
          diagnosticError(
            "EFX2025",
            `\`${tag}\` is already caught by an earlier clause`,
            clause.start,
            clause.start + 5
          )
        )
      }
      seen.add(tag)
    }
  }
  for (const part of [node.block, ...clauses.map((c) => c.body)]) {
    const jump = findCrossingJump(part)
    if (jump !== undefined) {
      ctx.diagnostics.push(
        diagnosticError("EFX2021", "`break`/`continue` cannot cross a `try` inside `effect`", jump.start, jump.end)
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
        "A `try` inside `effect` must return on every path or on none",
        node.start,
        node.start + 3,
        "move the code after the `try` into each branch, or assign to a variable and return after the `try`"
      )
    )
  }

  const E = ref(ctx, "effect", "Effect")
  const gen = `${E}.gen(${containsThis(node) ? "{ self: this }, " : ""}function*() `
  ctx.s.update(node.start, node.block.start, `${anyReturn && allExit ? "return " : ""}yield* ${gen}`)

  const typedCount = tags.filter((t) => t !== undefined).length
  const untyped = clauses.length > 0 && tags[clauses.length - 1] === undefined
  const catchesDefects = untyped || tags.some((t) => t?.includes("UnknownError") === true)
  const grouped = typedCount > 1 && tags.every((t) => t === undefined || t.length === 1)
  const key = (tag: string) => (isIdentifierName(tag) ? tag : JSON.stringify(tag))
  const tagArgument = (list: Array<string>) =>
    list.length === 1 ? JSON.stringify(list[0]) : `[${list.map((t) => JSON.stringify(t)).join(", ")}]`
  const error = typedCount > 1 && !grouped ? unused(ctx, "error") : ""

  // Text that replaces `catch ` before each clause's handler `(param) => …`, then the closing text.
  const prefixes: Array<string> = clauses.map((_clause, i) => {
    const list = tags[i]
    if (list === undefined) {
      if (typedCount === 0) return `${E}.catch(`
      return `${grouped ? ") }" : ")"}, `
    }
    if (i === 0) {
      return grouped ? `${E}.catchTags({ ${key(list[0]!)}: ` : `${E}.catchTag(${tagArgument(list)}, `
    }
    return grouped
      ? `), ${key(list[0]!)}: `
      : `), (${error}) => ${E}.catchTag(${E}.fail(${error}), ${tagArgument(list)}, `
  })
  const closing = typedCount === 0
    ? "))"
    : grouped
    ? (untyped ? "))" : ") })")
    : `)${")".repeat(typedCount)}`

  let pipeOpen = ").pipe("
  if (catchesDefects) {
    const C = ref(ctx, "effect", "Cause")
    const defect = unused(ctx, "defect")
    pipeOpen += `${E}.catchDefect((${defect}) => ${E}.fail(new ${C}.UnknownError(${defect}))), `
  }
  let previousEnd: number = node.block.end
  clauses.forEach((clause, i) => {
    const prefix = `${i === 0 ? pipeOpen : ""}${prefixes[i]}`
    const typed = tags[i] !== undefined
    const param: Node | null = clause.param
    if (param?.type === "Identifier") {
      // the parameter name stays user text, so editor navigation and rename keep working on it
      const nameEnd = param.start + (param.name as string).length
      ctx.s.update(previousEnd, param.start, `${prefix}(`)
      if (typed && nameEnd < param.end) ctx.s.remove(nameEnd, param.end)
      ctx.s.update(param.end, clause.body.start, `) => ${gen}`)
    } else {
      ctx.s.update(previousEnd, clause.body.start, `${prefix}(${paramText(ctx, clause, typed)}) => ${gen}`)
    }
    previousEnd = clause.body.end
  })
  if (node.finalizer !== null) {
    const before = clauses.length === 0 ? ").pipe(" : `${closing}, `
    ctx.s.update(previousEnd, node.finalizer.start, `${before}${E}.ensuring(${gen}`)
    ctx.s.appendLeft(node.end, ")))")
  } else {
    ctx.s.appendLeft(node.end, `${closing})`)
  }

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
