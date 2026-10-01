/**
 * `defer`, `using x = await e` and `for await` inside `effect` code.
 *
 * @since 0.1.0
 */
import { children, containsThis, type Node } from "../ast.ts"
import { type Handler, makeFrame, withEffect } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"
import { findCrossingJump, isEffectful } from "./try.ts"

const deferStatement: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) {
    ctx.diagnostics.push(
      diagnosticError("EFX2011", "`defer` is only valid inside `effect` code", node.keyword.start, node.keyword.end)
    )
    return true
  }
  ctx.effect.scoped = true
  const E = ref(ctx, "effect", "Effect")
  const argument: Node = node.argument
  if (argument.type === "BlockStatement" && isEffectful(argument)) {
    // `defer { … await … }`: the finalizer is its own effect (ADR-0011)
    ctx.s.update(node.start, argument.start, `yield* ${E}.addFinalizer(() => ${E}.gen(function*() `)
    ctx.s.appendLeft(argument.end, "))")
    withEffect(ctx, makeFrame(argument, "block"), () => walk(argument, node, ctx))
    return true
  }
  if (argument.type === "BlockStatement") {
    ctx.s.update(node.start, argument.start, `yield* ${E}.addFinalizer(() => ${E}.sync(() => `)
    ctx.s.appendLeft(argument.end, "))")
  } else {
    ctx.s.update(node.start, argument.start, `yield* ${E}.addFinalizer(() => `)
    ctx.s.appendLeft(argument.end, ")")
  }
  withEffect(ctx, undefined, () => walk(argument, node, ctx))
  return true
}

const usingDeclaration: Handler = (node, parent, ctx) => {
  if (ctx.effect === undefined || node.kind !== "using") return
  if (!node.declarations.every((d: Node) => d.init?.type === "AwaitExpression")) return
  if (parent !== ctx.effect.node.body) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2013",
        "`using … await` must be at the top level of an `effect`",
        node.start,
        node.start + 5,
        "move it to the top of the `effect`, or put the block in its own `effect { … }` and `await` it"
      )
    )
  }
  ctx.effect.scoped = true
  ctx.s.update(node.start, node.start + 5, "const")
}

const loopTypes = /^(For|ForIn|ForOf|While|DoWhile)Statement$/

/** `continue` statements that target this loop (unlabeled, not inside a nested loop). */
const loopContinues = (node: Node, out: Array<Node> = []): Array<Node> => {
  for (const child of children(node)) {
    if (child.type === "ContinueStatement" && child.label === null) out.push(child)
    else if (!loopTypes.test(child.type) && child.efx === undefined && !/Function|Class|EffectBlock/.test(child.type)) {
      loopContinues(child, out)
    }
  }
  return out
}

const forAwait: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined || node.await !== true) return
  const left: Node = node.left
  if (left.type !== "VariableDeclaration") {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2012",
        "`for await` in `effect` code needs a `const` or `let` declaration",
        left.start,
        left.end
      )
    )
    return true
  }
  const jump = findCrossingJump(node.body)
  const escape = jump?.type === "BreakStatement" ? jump : findReturn(node.body)
  if (escape !== undefined) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX2010",
        "`break` and `return` are not supported inside `for await` in `effect` code",
        escape.start,
        escape.end,
        "use `continue`, or collect with Stream operators"
      )
    )
  }
  const E = ref(ctx, "effect", "Effect")
  const gen = `${E}.gen(${containsThis(node.body) ? "{ self: this }, " : ""}function*() `
  const id: Node = left.declarations[0].id
  ctx.s.remove(left.start, id.start)
  ctx.s.update(node.start, left.start, `yield* ${ref(ctx, "effect", "Stream")}.runForEach(`)
  ctx.s.move(node.right.start, node.right.end, left.start)
  ctx.s.appendRight(left.start, ", (")
  ctx.s.update(left.end, node.right.start, `) => ${gen}`)
  ctx.s.remove(node.right.end, node.body.start)
  ctx.s.appendLeft(node.end, "))")
  for (const statement of loopContinues(node.body)) ctx.s.update(statement.start, statement.start + 8, "return")
  walk(node.right, node, ctx)
  walk(node.body, node, ctx)
  return true
}

const findReturn = (node: Node): Node | undefined => {
  if (node.type === "ReturnStatement") return node
  if (/Function|Class|EffectBlock/.test(node.type) || node.efx !== undefined) return undefined
  for (const child of children(node)) {
    const found = findReturn(child)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const resourceHandlers: HandlerGroup = {
  DeferStatement: deferStatement,
  VariableDeclaration: usingDeclaration,
  ForOfStatement: forAwait
}
