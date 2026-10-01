/**
 * Strict-mode rules (§4.17, ADR-0028). Syntactic only; these handlers report and never edit.
 *
 * @since 4.0.0
 */
import { isTypeFree, isValueFree } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { excludedNames, namespaceExports } from "../prelude/tables.ts"
import { importedLocal } from "../reverse/origin.ts"
import type { HandlerGroup } from "./registry.ts"

const isFree = (ctx: Ctx, name: string) => isValueFree(ctx.scope, name) && isTypeFree(ctx.scope, name)

/** The `Effect` namespace: an import from `effect` or the free prelude name. */
const isEffectNamespace = (ctx: Ctx, node: Node): boolean =>
  node.type === "Identifier" &&
  (node.name === importedLocal(ctx.analysis, "effect", "Effect") || (node.name === "Effect" && isFree(ctx, "Effect")))

const isBuiltin = (ctx: Ctx, name: string): boolean =>
  ctx.options.prelude && !excludedNames.has(name) && namespaceExports.get("Effect")!.has(name) && isFree(ctx, name)

/** `Effect.member` or the bare builtin `member`, returning `member`. */
const effectMember = (ctx: Ctx, callee: Node): string | undefined => {
  if (callee.type === "MemberExpression" && !callee.computed && isEffectNamespace(ctx, callee.object)) {
    return callee.property.name
  }
  if (callee.type === "Identifier" && isBuiltin(ctx, callee.name)) return callee.name
  return undefined
}

const isPureHelper = (name: string) => /^(is|run)[A-Z]/.test(name)
const runners = new Set(["runPromise", "runSync", "runFork", "runCallback", "runPromiseExit", "runSyncExit"])

const isModuleBinding = (ctx: Ctx, name: string, set: ReadonlySet<string>): boolean => {
  if (!set.has(name)) return false
  for (let scope: Ctx["scope"] | undefined = ctx.scope; scope !== undefined; scope = scope.parent) {
    if (scope.values.has(name)) return scope === ctx.analysis.module
  }
  return false
}

const floatingEffect: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined || node.expression.type !== "CallExpression") return
  const call: Node = node.expression
  const callee: Node = call.callee
  const member = effectMember(ctx, callee)
  const floating = (member !== undefined && !isPureHelper(member)) ||
    (callee.type === "Identifier" && isModuleBinding(ctx, callee.name, ctx.analysis.localEffects))
  if (!floating) return
  ctx.diagnostics.push(
    diagnosticError(
      "EFX8001",
      "This effect is created but never run (heuristic)",
      call.start,
      call.end,
      "`await` it, or remove it"
    )
  )
}

const runInsideEffect: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) return
  const member = effectMember(ctx, node.callee)
  if (member === undefined || !runners.has(member)) return
  ctx.diagnostics.push(
    diagnosticError(
      "EFX8003",
      `\`${member}\` runs an effect inside \`effect\` code`,
      node.callee.start,
      node.callee.end,
      "`await` the effect instead"
    )
  )
}

const primitiveThrow: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) return
  const argument: Node = node.argument
  const primitive = (argument.type === "Literal" && argument.regex === undefined) || argument.type === "TemplateLiteral"
  if (!primitive) return
  ctx.diagnostics.push(
    diagnosticError(
      "EFX8004",
      "Throwing a primitive inside `effect` code",
      argument.start,
      argument.end,
      "declare an `error` and throw it: `throw new MyError({ … })`"
    )
  )
}

const anyCatch: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) return
  for (const clause of node.handlers ?? (node.handler ? [node.handler] : []) as Array<Node>) {
    const annotation: Node | undefined = clause.param?.typeAnnotation?.typeAnnotation
    if (annotation?.type !== "TSAnyKeyword") continue
    ctx.diagnostics.push(
      diagnosticError(
        "EFX8005",
        "`catch (e: any)` inside `effect` code",
        annotation.start,
        annotation.end,
        "use `catch (e)`"
      )
    )
  }
}

/** A Promise visible in the syntax (EFX8111). */
const isVisiblePromise = (ctx: Ctx, node: Node): boolean => {
  if (node.type === "NewExpression") return node.callee.type === "Identifier" && node.callee.name === "Promise"
  if (node.type !== "CallExpression") return false
  const callee: Node = node.callee
  if (callee.type === "Identifier") {
    return (callee.name === "fetch" && isFree(ctx, "fetch")) ||
      isModuleBinding(ctx, callee.name, ctx.analysis.localAsync)
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    if (callee.object.type === "Identifier" && callee.object.name === "Promise" && isFree(ctx, "Promise")) return true
    return ["then", "catch", "finally"].includes(callee.property.name)
  }
  return false
}

const promiseAwait: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined || !isVisiblePromise(ctx, node.argument)) return
  ctx.diagnostics.push(
    diagnosticError(
      "EFX8111",
      "`await` on a Promise inside `effect` code",
      node.start,
      node.argument.end,
      "wrap it: `await tryPromise(() => …)`"
    )
  )
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const strictHandlers: HandlerGroup = {
  ExpressionStatement: floatingEffect,
  CallExpression: runInsideEffect,
  ThrowStatement: primitiveThrow,
  ThrowExpression: primitiveThrow,
  TryStatement: anyCatch,
  AwaitExpression: promiseAwait
}
