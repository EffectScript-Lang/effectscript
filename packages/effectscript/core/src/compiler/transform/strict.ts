/**
 * Strict-mode rules (§4.17, ADR-0028). Syntactic only; these handlers report and never edit.
 *
 * @since 4.0.0
 */
import { isTypeFree, isValueFree } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { diagnosticError, diagnosticWarning } from "../diagnostics.ts"
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

/** `xs.map(…)`, `xs.flatMap(…)`, `xs.filter(…)` or `Array.from(…)`: an array, not an effect (EFX8112). */
const isArrayBuilt = (node: Node): boolean =>
  node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed &&
  (["map", "flatMap", "filter"].includes(node.callee.property.name) ||
    (node.callee.object.type === "Identifier" && node.callee.object.name === "Array" &&
      node.callee.property.name === "from"))

const promiseAwait: Handler = (node, _parent, ctx) => {
  if (ctx.effect !== undefined && isArrayBuilt(node.argument)) {
    // `yield*` over an array runs its effects one by one and evaluates to `undefined`
    warn(
      ctx,
      "EFX8112",
      "`await` on an array: its effects run one by one, and the result is `undefined`",
      node,
      "use `await all(xs)` or `await forEach(items, (x) => …)`; only an array literal `await [a, b]` runs as `all`"
    )
  }
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

const warn = (ctx: Ctx, code: string, message: string, node: Node, hint?: string) =>
  ctx.diagnostics.push(diagnosticWarning(code, message, node.start, node.end, hint))

const isGlobalCall = (ctx: Ctx, callee: Node, object: string, members?: ReadonlyArray<string>): boolean =>
  members === undefined
    ? callee.type === "Identifier" && callee.name === object && isFree(ctx, object)
    : callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" &&
      callee.object.name === object && isFree(ctx, object) && members.includes(callee.property.name)

/** Warnings for calls inside `effect` code (EFX8102, 8105–8108). */
const callWarnings = (node: Node, ctx: Ctx): void => {
  if (ctx.effect === undefined) return
  const callee: Node = node.callee
  if (isGlobalCall(ctx, callee, "setTimeout") || isGlobalCall(ctx, callee, "setInterval")) {
    warn(ctx, "EFX8105", "Timers inside `effect` code", callee, "use `sleep(…)` or a `Schedule`")
  } else if (isGlobalCall(ctx, callee, "fetch")) {
    warn(ctx, "EFX8106", "`fetch` inside `effect` code", callee, "use `HttpClient`")
  } else if (isGlobalCall(ctx, callee, "Promise", ["all", "race", "allSettled", "any"])) {
    warn(ctx, "EFX8107", "Promise combinators inside `effect` code", callee, "use `await [..]`, `all` or `race`")
  } else if (isGlobalCall(ctx, callee, "JSON", ["parse"])) {
    warn(ctx, "EFX8108", "`JSON.parse` inside `effect` code", callee, "decode with a `schema`")
  } else if (callee.type === "MemberExpression" && !callee.computed && callee.property.name === "then") {
    warn(ctx, "EFX8102", "`.then` inside `effect` code", callee.property, "use `await` on an effect")
  }
}

const runAndWarn: Handler = (node, parent, ctx) => {
  callWarnings(node, ctx)
  return runInsideEffect(node, parent, ctx)
}

const newWarnings: Handler = (node, _parent, ctx) => {
  if (ctx.effect === undefined) return
  if (isGlobalCall(ctx, node.callee, "Promise")) {
    warn(ctx, "EFX8102", "`new Promise` inside `effect` code", node, "use an effect")
  } else if (isGlobalCall(ctx, node.callee, "Date") && node.arguments.length === 0) {
    warn(ctx, "EFX8109", "`new Date()` inside `effect` code", node, "use `DateTime.now`")
  }
}

const throwWarnings: Handler = (node, parent, ctx) => {
  primitiveThrow(node, parent, ctx)
  if (ctx.effect === undefined) return
  const argument: Node = node.argument
  if (argument.type === "NewExpression" && isGlobalCall(ctx, argument.callee, "Error")) {
    warn(ctx, "EFX8103", "`throw new Error(…)` inside `effect` code", argument, "declare an `error` and throw it")
  }
}

const asyncFunction: Handler = (node, _parent, ctx) => {
  if (ctx.outerEffect === undefined || node.async !== true || node.efx !== undefined) return
  warn(ctx, "EFX8102", "`async` function inside `effect` code", node, "use an `effect` function")
}

/** File-wide rules (EFX8101, 8104, 8110), from one scan of the program. */
const fileWarnings: Handler = (node, _parent, ctx) => {
  const effectLocal = importedLocal(ctx.analysis, "effect", "Effect") ?? "Effect"
  const visit = (n: Node): void => {
    if (n.type === "TSAnyKeyword") warn(ctx, "EFX8104", "Explicit `any`", n, "use `unknown` or a precise type")
    if (
      n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed &&
      n.callee.object.type === "Identifier" && n.callee.object.name === effectLocal &&
      ["gen", "fn", "fnUntraced"].includes(n.callee.property.name)
    ) {
      warn(
        ctx,
        "EFX8101",
        `\`Effect.${n.callee.property.name}\` written by hand`,
        n.callee,
        "use `effect` (`efx fix` converts it)"
      )
    }
    if (n.type === "ClassDeclaration" && n.efxKind === "service") {
      for (const member of n.body.body as Array<Node>) {
        const type: Node | undefined = member.value?.returnType?.typeAnnotation ?? member.typeAnnotation?.typeAnnotation
        if (
          type?.type === "TSUnionType" &&
          type.types.some((t: Node) => t.type === "TSNullKeyword" || t.type === "TSUndefinedKeyword")
        ) {
          warn(ctx, "EFX8110", "A nullable type in a service signature", type, "prefer `Option<T>`")
        }
      }
    }
    for (const child of children(n)) visit(child)
  }
  visit(node)
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const strictHandlers: HandlerGroup = {
  Program: fileWarnings,
  NewExpression: newWarnings,
  FunctionExpression: asyncFunction,
  ArrowFunctionExpression: asyncFunction,
  FunctionDeclaration: asyncFunction,
  ExpressionStatement: floatingEffect,
  CallExpression: runAndWarn,
  ThrowStatement: throwWarnings,
  ThrowExpression: throwWarnings,
  TryStatement: anyCatch,
  AwaitExpression: promiseAwait
}
