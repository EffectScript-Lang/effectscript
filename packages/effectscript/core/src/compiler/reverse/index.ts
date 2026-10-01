/**
 * `toEffectScript`: idiomatic Effect TypeScript → EffectScript, for the adoption-slice subset
 * (ADR-0023). Anything that doesn't match a canonical shape stays TypeScript, which is valid
 * EffectScript.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import { analyze, type ScopeAnalysis } from "../analyze/scope.ts"
import { children, type Node } from "../ast.ts"
import { parse } from "../parser/parse.ts"
import { excludedNames, namespaceExports } from "../prelude/tables.ts"
import { importedLocal, isMember } from "./origin.ts"
import { fieldType } from "./types.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface ConvertNote {
  readonly start: number
  readonly end: number
  readonly message: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface ConvertResult {
  readonly code: string
  /** Near misses that were left as TypeScript, and why. */
  readonly notes: ReadonlyArray<ConvertNote>
}

interface Ctx {
  readonly source: string
  readonly s: MagicString
  readonly analysis: ScopeAnalysis
  readonly effect: string | undefined
  readonly schema: string | undefined
  readonly notes: Array<ConvertNote>
}

const isGenerator = (node: Node | undefined): boolean =>
  node?.type === "FunctionExpression" && node.generator === true && node.async !== true && node.id === null

const nestedScopes = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression"
])

/** `Effect.x` → `x` when `x` is a builtin that is free everywhere in the file (spec §4.13). */
const unqualify = (ctx: Ctx, node: Node): void => {
  if (!isMember(node, ctx.effect)) return
  const name: string = node.property.name
  if (excludedNames.has(name) || !namespaceExports.get("Effect")!.has(name)) return
  const { innerBound, module } = ctx.analysis
  if (innerBound.has(name) || module.values.has(name) || module.types.has(name)) return
  ctx.s.remove(node.start, node.property.start)
}

const walkExpressions = (ctx: Ctx, node: Node): void => {
  unqualify(ctx, node)
  for (const child of children(node)) walkExpressions(ctx, child)
}

/** `yield* e` → `await e`; `return yield* Effect.fail(e)` / `return yield* new E(…)` → `throw …`. */
const convertBody = (ctx: Ctx, node: Node): void => {
  if (nestedScopes.has(node.type)) return walkExpressions(ctx, node)
  if (node.type === "ReturnStatement" && node.argument?.type === "YieldExpression" && node.argument.delegate) {
    const target: Node = node.argument.argument
    if (
      target.type === "CallExpression" && isMember(target.callee, ctx.effect, "fail") && target.arguments.length === 1
    ) {
      const error: Node = target.arguments[0]
      ctx.s.update(node.start, error.start, "throw ")
      ctx.s.remove(error.end, node.argument.end)
      return convertBody(ctx, error)
    }
    if (
      target.type === "NewExpression" && target.callee.type === "Identifier" &&
      ctx.analysis.localTags.has(target.callee.name)
    ) {
      ctx.s.update(node.start, target.start, "throw ")
      return convertBody(ctx, target)
    }
  }
  if (node.type === "YieldExpression") {
    if (!node.delegate) return
    ctx.s.update(node.start, node.start + "yield*".length, "await")
  }
  unqualify(ctx, node)
  for (const child of children(node)) convertBody(ctx, child)
}

/** `: Effect.fn.Return<A, E, R>` → `: A throws E needs R`. */
const convertReturnType = (ctx: Ctx, annotation: Node | null | undefined): void => {
  const type: Node | undefined = annotation?.typeAnnotation
  if (type?.type !== "TSTypeReference") return
  const name: Node = type.typeName
  const isReturn = name.type === "TSQualifiedName" && name.right.name === "Return" &&
    name.left.type === "TSQualifiedName" && name.left.right.name === "fn" &&
    name.left.left.type === "Identifier" && name.left.left.name === ctx.effect
  if (!isReturn) return
  const [success, error, requirements]: Array<Node> = (type.typeArguments ?? type.typeParameters)?.params ?? []
  if (success === undefined) return
  const slice = (n: Node) => ctx.source.slice(n.start, n.end)
  const throws = error !== undefined && error.type !== "TSNeverKeyword" ? ` throws ${slice(error)}` : ""
  const needs = requirements !== undefined && requirements.type !== "TSNeverKeyword"
    ? ` needs ${slice(requirements)}`
    : ""
  ctx.s.update(type.start, type.end, `${slice(success)}${throws}${needs}`)
}

/** `const f = Effect.fn("f")(function*(…) {…}, …pipes)` → `effect f(…) {…} |> …pipes`. */
const convertDeclaration = (ctx: Ctx, statement: Node): void => {
  if (statement.kind !== "const" || statement.declarations.length !== 1) return
  const declarator: Node = statement.declarations[0]
  const call: Node | null = declarator.init
  if (declarator.id.type !== "Identifier" || call?.type !== "CallExpression") return
  const head: Node = call.callee
  if (head.type !== "CallExpression" || !isMember(head.callee, ctx.effect, "fn")) return
  const [fn, ...pipes]: Array<Node> = call.arguments
  if (!isGenerator(fn) || declarator.id.typeAnnotation) return
  const name: string = declarator.id.name
  const span: Node | undefined = head.arguments[0]
  if (head.arguments.length !== 1 || span?.type !== "Literal" || span.value !== name) {
    ctx.notes.push({
      start: statement.start,
      end: statement.end,
      message: `\`${name}\` stays TypeScript: its span name ${
        span?.type === "Literal" ? JSON.stringify(span.value) : "is not a string literal"
      } differs from the binding`
    })
    return
  }
  const star = ctx.source.indexOf("*", fn.start)
  ctx.s.update(statement.start, star + 1, `effect ${name}`)
  convertReturnType(ctx, fn.returnType)
  if (pipes.length === 0) {
    ctx.s.remove(fn.end, call.end)
  } else {
    pipes.forEach((pipe, i) => ctx.s.update(i === 0 ? fn.end : pipes[i - 1]!.end, pipe.start, " |> "))
    ctx.s.remove(pipes[pipes.length - 1]!.end, call.end)
    for (const pipe of pipes) walkExpressions(ctx, pipe)
  }
  for (const param of fn.params) walkExpressions(ctx, param)
  convertBody(ctx, fn.body)
}

/** `class X extends Schema.TaggedError<X>()("X", {…}) {}` → `error X {…}`; `Schema.Class` → `schema`. */
const convertClass = (ctx: Ctx, cls: Node): void => {
  const outer: Node | null = cls.superClass
  if (ctx.schema === undefined || cls.id === null || outer?.type !== "CallExpression") return
  const inner: Node = outer.callee
  if (inner.type !== "CallExpression") return
  const name: string = cls.id.name
  let keyword: "error" | "schema" | undefined
  let fields: Node | undefined
  if (isMember(inner.callee, ctx.schema, "TaggedError") && inner.arguments.length === 0) {
    const [tag, object] = outer.arguments
    if (tag?.type !== "Literal" || tag.value !== name) {
      ctx.notes.push({
        start: cls.start,
        end: cls.end,
        message: `\`${name}\` stays TypeScript: its tag differs from its name`
      })
      return
    }
    keyword = "error"
    fields = object
  } else if (isMember(inner.callee, ctx.schema, "Class") && inner.arguments[0]?.value === name) {
    keyword = "schema"
    fields = outer.arguments[0]
  }
  if (
    keyword === undefined || fields?.type !== "ObjectExpression" ||
    outer.arguments.length !== (keyword === "error" ? 2 : 1)
  ) {
    return
  }
  if (cls.body.body.length > 0) {
    ctx.notes.push({
      start: cls.start,
      end: cls.end,
      message: `\`${name}\` stays TypeScript: class members are not converted yet`
    })
    return
  }
  const properties: Array<Node> = fields.properties
  const types = properties.map((property) => fieldType(ctx.source, ctx.schema!, property))
  if (types.some((t) => t === undefined)) {
    ctx.notes.push({
      start: cls.start,
      end: cls.end,
      message: `\`${name}\` stays TypeScript: a field schema has no type form`
    })
    return
  }
  ctx.s.update(cls.start, fields.start, `${keyword} ${name} `)
  ctx.s.remove(fields.end, cls.end)
  properties.forEach((property, i) => {
    const field = types[i]!
    ctx.s.update(property.key.end, property.value.end, `${field.optional}: ${field.type}`)
    const next = properties[i + 1]
    if (next !== undefined) {
      const comma = ctx.source.indexOf(",", property.end)
      if (ctx.source.slice(comma, next.start).includes("\n")) ctx.s.remove(comma, comma + 1)
      else ctx.s.update(comma, comma + 1, ";")
    }
  })
  // a trailing comma before the closing brace
  const last = properties[properties.length - 1]
  if (last !== undefined) {
    const tail = ctx.source.slice(last.end, fields.end - 1)
    const comma = tail.indexOf(",")
    if (comma !== -1) ctx.s.remove(last.end + comma, last.end + comma + 1)
  }
}

/** Removes import specifiers of `effect` that the converted code no longer references. */
const removeUnusedImports = (code: string, locals: ReadonlyArray<string>): string => {
  const parsed = parse(code)
  if (parsed._tag === "Failure") return code
  const used = new Set<string>()
  const visit = (node: Node, parent: Node | undefined): void => {
    if (node.type === "ImportDeclaration") return
    if (node.type === "Identifier") {
      const isKey = parent?.type === "MemberExpression" && parent.property === node && !parent.computed
      if (!isKey) used.add(node.name)
    }
    for (const child of children(node)) visit(child, node)
  }
  visit(parsed.program, undefined)
  const s = new MagicString(code)
  for (const statement of parsed.program.body as Array<Node>) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== "effect") continue
    const specifiers: Array<Node> = statement.specifiers
    const unused = specifiers.filter((spec) => locals.includes(spec.local.name) && !used.has(spec.local.name))
    if (unused.length === 0) continue
    if (unused.length === specifiers.length) {
      const end = code[statement.end] === "\n" ? statement.end + 1 : statement.end
      s.remove(statement.start, end)
      continue
    }
    for (const spec of unused) {
      const index = specifiers.indexOf(spec)
      const next = specifiers[index + 1]
      if (next !== undefined) s.remove(spec.start, next.start)
      else s.remove(specifiers[index - 1]!.end, spec.end)
    }
  }
  return s.toString()
}

/**
 * Converts idiomatic Effect TypeScript to EffectScript (the adoption-slice subset, ADR-0023).
 *
 * @since 4.0.0
 * @category reverse
 */
export const toEffectScript = (source: string): ConvertResult => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return { code: source, notes: parsed.diagnostics.map((d) => ({ start: d.start, end: d.end, message: d.message })) }
  }
  const analysis = analyze(parsed.program)
  const ctx: Ctx = {
    source,
    s: new MagicString(source),
    analysis,
    effect: importedLocal(analysis, "effect", "Effect"),
    schema: importedLocal(analysis, "effect", "Schema"),
    notes: []
  }
  if (ctx.effect === undefined && ctx.schema === undefined) return { code: source, notes: [] }
  for (const top of parsed.program.body as Array<Node>) {
    const statement: Node = top.type === "ExportNamedDeclaration" && top.declaration !== null ? top.declaration : top
    if (statement.type === "VariableDeclaration") convertDeclaration(ctx, statement)
    else if (statement.type === "ClassDeclaration") convertClass(ctx, statement)
  }
  if (!ctx.s.hasChanged()) return { code: source, notes: ctx.notes }
  const locals = [ctx.effect, ctx.schema].filter((name): name is string => name !== undefined)
  return { code: removeUnusedImports(ctx.s.toString(), locals), notes: ctx.notes }
}
