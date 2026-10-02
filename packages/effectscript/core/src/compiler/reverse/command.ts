/**
 * `const c = Command.make("c", { k: Flag/Argument chain, … }, Effect.fn("c")(function*({ k, … }) {…}))`
 * → `command c(--k: T = v, …) {…}` (spec §4.14): the inverse of `transform/command.ts`, which
 * regenerates the whole header, so the reverse writes its canonical layout.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { jsdocBefore, kebab } from "../transform/command.ts"
import { isGenerator } from "./blockers.ts"
import type { Visit } from "./body.ts"
import { commaToPipe, commentsIn, type ReverseCtx, separatorComma, slice, within } from "./context.ts"
import { returnTypeProblem } from "./effects.ts"
import { importedLocal, isMember } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { hasFinalizer, inFrame } from "./resources.ts"
import { schemaToType } from "./types.ts"

const nativeNames = new Set(["Int", "Finite", "Date", "Redacted"])
const cli = "effect/cli"

const isString = (node: Node | undefined): node is Node => node?.type === "Literal" && typeof node.value === "string"
const isLiteral = (node: Node): boolean =>
  node.type === "Literal" && node.regex === undefined && node.bigint === undefined

/** A JSDoc text the forward compiler reads back to the same description: one normalized line. */
const docText = (text: string): boolean =>
  text === text.replace(/\s+/g, " ").trim() && !text.includes("*/") &&
  !text.includes("@alias")

/** One `k: Flag/Argument…` entry as an EffectScript parameter, or `undefined`. */
const parameterOf = (ctx: ReverseCtx, property: Node, flag: string | undefined, argument: string | undefined) => {
  if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) return undefined
  if (property.shorthand || property.key.type !== "Identifier") return undefined
  const name: string = property.key.name
  let value: Node = property.value
  let steps: Array<Node> = []
  if (
    value.type === "CallExpression" && value.callee.type === "MemberExpression" && !value.callee.computed &&
    value.callee.property.name === "pipe"
  ) {
    steps = [...value.arguments]
    value = value.callee.object
  }
  if (value.type !== "CallExpression" || value.callee.type !== "MemberExpression") return undefined
  const kind = isMember(value.callee, flag) ? "flag" : isMember(value.callee, argument) ? "argument" : undefined
  if (kind === undefined) return undefined
  const local = kind === "flag" ? flag! : argument!
  const constructor: string = value.callee.property.name
  const args: Array<Node> = value.arguments
  const cliName = kind === "flag" ? kebab(name) : name
  const step = (member: string) =>
    isMember(steps[0], local, member) ||
    (steps[0]?.type === "CallExpression" && isMember(steps[0].callee, local, member))
  let type: string | undefined
  if (constructor === "Literals" && args.length === 2 && isString(args[0]) && args[0].value === cliName) {
    const list = args[1]!
    if (
      list.type !== "ArrayExpression" || list.elements.length < 2 || !(list.elements as Array<Node>).every(isLiteral)
    ) {
      return undefined
    }
    type = (list.elements as Array<Node>).map((e) => slice(ctx, e)).join(" | ")
  } else if (args.length === 1 && isString(args[0]) && args[0].value === cliName) {
    if (constructor === "String" && step("withSchema")) {
      const schema: Node | undefined = steps[0]!.arguments?.[0]
      const mapped = schema === undefined || ctx.schema === undefined
        ? undefined
        : schemaToType(ctx.source, ctx.schema, schema)
      // the forward compiler uses `withSchema` only for types without a native constructor
      if (
        mapped === undefined || steps[0]!.arguments.length !== 1 || ["string", "boolean"].includes(mapped) ||
        nativeNames.has(mapped) ||
        (schema!.type === "CallExpression" && isMember(schema!.callee, ctx.schema, "Literals"))
      ) {
        return undefined
      }
      type = mapped
      steps = steps.slice(1)
    } else if (constructor === "String") type = "string"
    else if (constructor === "Boolean" && kind === "flag") type = "boolean"
    else if (nativeNames.has(constructor)) type = constructor
  }
  if (type === undefined) return undefined
  // the remaining steps, in the forward order: optional, withDefault, withAlias, withDescription
  let optional = ""
  let fallback = ""
  let alias: string | undefined
  let description: string | undefined
  if (step("optional") && steps[0]!.type !== "CallExpression") {
    optional = "?"
    steps = steps.slice(1)
  }
  if (step("withDefault") && steps[0]!.arguments.length === 1 && optional === "") {
    fallback = ` = ${slice(ctx, steps[0]!.arguments[0])}`
    steps = steps.slice(1)
  }
  if (step("withAlias") && steps[0]!.arguments.length === 1 && isString(steps[0]!.arguments[0])) {
    alias = steps[0]!.arguments[0].value
    if (!/^\S+$/.test(alias!)) return undefined
    steps = steps.slice(1)
  }
  if (step("withDescription") && steps[0]!.arguments.length === 1 && isString(steps[0]!.arguments[0])) {
    description = steps[0]!.arguments[0].value
    if (description === "" || !docText(description!)) return undefined
    steps = steps.slice(1)
  }
  if (steps.length > 0) return undefined
  const doc = description === undefined && alias === undefined
    ? ""
    : `/** ${
      [description, alias === undefined ? undefined : `@alias ${alias}`].filter((p) => p !== undefined).join(" ")
    } */ `
  return { name, text: `${doc}${kind === "flag" ? "--" : ""}${name}${optional}: ${type}${fallback}` }
}

/**
 * Rewrites a top-level `Command.make` declaration. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertCommand = (ctx: ReverseCtx, statement: Node, outerStart: number, visit: Visit): boolean => {
  const Command = importedLocal(ctx.analysis, cli, "Command")
  if (Command === undefined || statement.type !== "VariableDeclaration" || statement.kind !== "const") return false
  if (statement.declarations.length !== 1) return false
  const declarator: Node = statement.declarations[0]
  if (declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || declarator.init === null) return false
  const name: string = declarator.id.name
  let make: Node = declarator.init
  const pipe = make.type === "CallExpression" && make.callee.type === "MemberExpression" && !make.callee.computed &&
      make.callee.property.name === "pipe"
    ? make
    : undefined
  if (pipe !== undefined) make = pipe.callee.object
  if (make.type !== "CallExpression" || !isMember(make.callee, Command, "make") || make.arguments.length !== 3) {
    return false
  }
  const [id, entries, handler]: Array<Node> = make.arguments
  if (!isString(id) || id.value !== name || entries?.type !== "ObjectExpression") return false
  // the handler: `Effect.fn("c")(function*({ a, b }) {…}[, Effect.scoped])`
  if (handler?.type !== "CallExpression" || handler.callee.type !== "CallExpression") return false
  const head: Node = handler.callee
  if (!isMember(head.callee, ctx.effect, "fn") || head.arguments.length !== 1 || !isString(head.arguments[0])) {
    return false
  }
  if (head.arguments[0].value !== name) return false
  const fn: Node = handler.arguments[0]
  const scoped = handler.arguments.length === 2 && isMember(handler.arguments[1], ctx.effect, "scoped") &&
    hasFinalizer(ctx, fn.body)
  if (!isGenerator(fn) || (handler.arguments.length !== 1 && !scoped) || fn.returnType) return false
  if (returnTypeProblem(ctx, fn.returnType) !== undefined) return false
  // parameters, and the destructured bindings in the same order
  const flag = importedLocal(ctx.analysis, cli, "Flag")
  const argument = importedLocal(ctx.analysis, cli, "Argument")
  const params = (entries.properties as Array<Node>).map((p) => parameterOf(ctx, p, flag, argument))
  if (params.some((p) => p === undefined)) return false
  const names = (params as Array<{ name: string }>).map((p) => p.name)
  const binding: Node | undefined = fn.params[0]
  if (
    names.length === 0 ? fn.params.length !== 0 : (
      fn.params.length !== 1 || binding!.type !== "ObjectPattern" ||
      binding!.properties.length !== names.length ||
      !(binding!.properties as Array<Node>).every((p, i) =>
        p.type === "Property" && p.shorthand && p.key.type === "Identifier" && p.key.name === names[i]
      )
    )
  ) {
    return false
  }
  // `.pipe(Command.withDescription(D), …)`: D comes from the JSDoc before the declaration
  const doc = jsdocBefore(ctx.source, 0, outerStart)
  const described = doc !== undefined && doc.description !== ""
  let pipes: Array<Node> = pipe === undefined ? [] : [...pipe.arguments]
  if (described) {
    const first = pipes[0]
    if (
      first?.type !== "CallExpression" || !isMember(first.callee, Command, "withDescription") ||
      first.arguments.length !== 1 || !isString(first.arguments[0]) || first.arguments[0].value !== doc!.description
    ) {
      return false
    }
    pipes = pipes.slice(1)
  }
  if (!pipes.every((p) => isPlainStep(p)) || commentsIn(ctx, statement.start, fn.body.start).length > 0) return false
  if (commentsIn(ctx, fn.body.end, statement.end).length > 0) return false
  // rewrite: the header, then the pipes after the body
  const list = (params as Array<{ text: string }>).map((p) => `  ${p.text},\n`).join("")
  ctx.s.update(statement.start, fn.body.start, `command ${name}(${list === "" ? "" : `\n${list}`}) `)
  if (pipes.length === 0) {
    ctx.s.remove(fn.body.end, statement.end)
  } else {
    ctx.s.update(fn.body.end, pipes[0]!.start, " |> ")
    pipes.forEach((step, i) => {
      if (i > 0) commaToPipe(ctx, separatorComma(ctx, pipes[i - 1]!.end, step.start), step)
      within(ctx, "Command", () => visit(step, pipe!, false))
    })
    ctx.s.remove(pipes[pipes.length - 1]!.end, statement.end)
  }
  within(ctx, "Effect", () => inFrame(ctx, scoped, () => visit(fn.body, fn, true)))
  return true
}
