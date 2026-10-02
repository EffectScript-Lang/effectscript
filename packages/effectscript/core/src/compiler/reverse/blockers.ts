/**
 * §6.3 blockers: generator bodies whose meaning would change as `effect` code, so they stay
 * TypeScript. The forward compiler treats a body's direct level (not nested functions or classes)
 * as `effect` code; these checks look at the same level.
 *
 * @since 4.0.0
 */
import { children, type Node } from "../ast.ts"

const functions = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])
const classes = new Set(["ClassDeclaration", "ClassExpression"])
const nonArrows = new Set(["FunctionDeclaration", "FunctionExpression", "ClassDeclaration", "ClassExpression"])

/**
 * The first node satisfying `predicate` without entering nodes whose type is in `stop`.
 *
 * @since 4.0.0
 * @category utils
 */
export const find = (node: Node, predicate: (node: Node) => boolean, stop: ReadonlySet<string>): Node | undefined => {
  if (predicate(node)) return node
  for (const child of children(node)) {
    if (stop.has(child.type)) continue
    const found = find(child, predicate, stop)
    if (found !== undefined) return found
  }
  return undefined
}

const levelStops = new Set([...functions, ...classes])

/**
 * The first node at the generator's `effect` level satisfying `predicate`.
 *
 * @since 4.0.0
 * @category utils
 */
export const atLevel = (body: Node, predicate: (node: Node) => boolean): Node | undefined =>
  find(body, predicate, levelStops)

const consoleMethods = new Set(["log", "info", "warn", "error", "debug"])

const isGlobalMember = (node: Node, object: string, property?: string): boolean =>
  node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" &&
  node.object.name === object && (property === undefined || node.property.name === property)

/** Conservative mirror of the forward ambient capture (spec §4.15), ignoring bindings. */
const isAmbient = (node: Node): boolean => {
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed) {
    const callee: Node = node.callee
    if (isGlobalMember(callee, "console") && consoleMethods.has(callee.property.name)) return true
    if (
      node.arguments.length === 0 && (isGlobalMember(callee, "Date", "now") || isGlobalMember(callee, "Math", "random"))
    ) {
      return true
    }
  }
  return node.type === "MemberExpression" && isGlobalMember(node.object, "process", "env")
}

/**
 * What the strict rules that are errors inside `effect` code need to know (spec §4.17).
 *
 * @since 4.0.0
 * @category models
 */
export interface StrictInfo {
  /** The local name of `Effect`. */
  readonly effect: string | undefined
  /** Module-level bindings that become pipe-less `effect` declarations (the forward `localEffects`). */
  readonly effects: ReadonlySet<string>
}

const runners = new Set(["runPromise", "runSync", "runFork", "runCallback", "runPromiseExit", "runSyncExit"])

const effectMember = (info: StrictInfo, callee: Node): string | undefined =>
  callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" &&
    callee.object.name === info.effect
    ? callee.property.name
    : undefined

/** Mirrors the error-severity strict rules EFX8001, EFX8003 and EFX8111 (ADR-0028). */
const strictError = (info: StrictInfo, node: Node): string | undefined => {
  if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression") {
    const callee: Node = node.expression.callee
    const member = effectMember(info, callee)
    if (
      (member !== undefined && !/^(is|run)[A-Z]/.test(member)) ||
      (callee.type === "Identifier" && info.effects.has(callee.name))
    ) {
      return "an effect created but not yielded would be an error inside `effect` code (EFX8001)"
    }
  }
  if (node.type === "CallExpression" && runners.has(effectMember(info, node.callee) ?? "")) {
    return "running an effect inside `effect` code is an error (EFX8003)"
  }
  if (node.type === "YieldExpression" && node.delegate) {
    const argument: Node = node.argument
    const promise = argument.type === "NewExpression"
      ? argument.callee.type === "Identifier" && argument.callee.name === "Promise"
      : argument.type === "CallExpression" && (
        (argument.callee.type === "Identifier" && argument.callee.name === "fetch") ||
        (argument.callee.type === "MemberExpression" && !argument.callee.computed && (
          (argument.callee.object.type === "Identifier" && argument.callee.object.name === "Promise") ||
          ["then", "catch", "finally"].includes(argument.callee.property.name)
        ))
      )
    if (promise) return "it awaits what looks like a Promise, an error inside `effect` code (EFX8111)"
  }
  return undefined
}

/**
 * Why `fn` (a generator function expression) can't become `effect` code, or `undefined`.
 *
 * @since 4.0.0
 * @category reverse
 */
export const blocker = (
  fn: Node,
  kind: "declaration" | "block" | "arrow" | "method",
  info: StrictInfo
): string | undefined => {
  const body: Node = fn.body
  if (atLevel(body, (n) => n.type === "YieldExpression" && !n.delegate)) return "it uses `yield` without `*`"
  if (atLevel(body, (n) => n.type === "TryStatement")) {
    return "a `try` inside it would become an Effect `try` (ADR-0010)"
  }
  if (atLevel(body, (n) => n.type === "VariableDeclaration" && /using/.test(n.kind))) {
    return "a `using` declaration inside it would acquire a scoped resource (ADR-0011)"
  }
  const ambient = atLevel(body, isAmbient)
  if (ambient !== undefined) {
    return `\`${
      ambient.type === "CallExpression"
        ? `${ambient.callee.object.name}.${ambient.callee.property.name}`
        : "process.env"
    }\` would be captured as an Effect inside \`effect\` code (spec §4.15)`
  }
  let strict: string | undefined
  atLevel(body, (n) => (strict = strictError(info, n)) !== undefined)
  if (strict !== undefined) return strict
  const arrowScope = (predicate: (n: Node) => boolean) => find(body, predicate, nonArrows)
  if (arrowScope((n) => n.type === "Identifier" && n.name === "arguments")) return "it uses `arguments`"
  if (kind === "arrow" && arrowScope((n) => n.type === "ThisExpression")) {
    return "`this` would change meaning in an `effect` arrow"
  }
  if (kind === "arrow" && fn.params.some((p: Node) => p.type === "Identifier" && p.name === "this")) {
    return "`this` would change meaning in an `effect` arrow"
  }
  return undefined
}
