/**
 * `command name(args, --flags) { … }` → `Command.make("name", { … }, Effect.fn("name")(…))` (§4.14).
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Ctx, type Handler, makeFrame, withEffect, withNamespace } from "../context.ts"
import { diagnosticError } from "../diagnostics.ts"
import { ref } from "../names.ts"
import { typeToSchema } from "../schema/mapping.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

const nativeTypes: Record<string, string> = {
  TSStringKeyword: "String",
  TSBooleanKeyword: "Boolean"
}
const nativeNames = new Set(["Int", "Finite", "Date", "Redacted"])

/** `dryRun` → `dry-run`. */
const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()

/** The JSDoc comment that ends right before `end` (only whitespace or a separator in between). */
const jsdocBefore = (
  source: string,
  from: number,
  end: number
): { description: string; alias?: string } | undefined => {
  const gap = source.slice(from, end)
  // the last `/**` in the gap: earlier doc comments belong to earlier declarations
  // stop at the comment's own `*/` (review I4)
  const match = /^\/\*\*((?:(?!\*\/)[\s\S])*)\*\/[\s,]*$/.exec(gap.slice(Math.max(0, gap.lastIndexOf("/**"))))
  if (match === null) return undefined
  const text = match[1]!.split("\n").map((line) => line.replace(/^\s*\*?\s?/, "")).join(" ")
  const alias = /@alias\s+(\S+)/.exec(text)?.[1]
  const description = text.replace(/@alias\s+\S+/, "").replace(/\s+/g, " ").trim()
  return alias === undefined ? { description } : { description, alias }
}

const parameter = (ctx: Ctx, param: Node, previousEnd: number): string => {
  const kind = param.flag ? ref(ctx, "effect/cli", "Flag") : ref(ctx, "effect/cli", "Argument")
  const name = param.name.name as string
  const cliName = JSON.stringify(param.flag ? kebab(name) : name)
  const type: Node = param.annotation
  const slice = (n: Node) => ctx.source.slice(n.start, n.end)
  const steps: Array<string> = []
  let base: string
  if (nativeTypes[type.type] !== undefined && !(type.type === "TSBooleanKeyword" && !param.flag)) {
    base = `${kind}.${nativeTypes[type.type]}(${cliName})`
  } else if (
    type.type === "TSTypeReference" && type.typeName.type === "Identifier" && nativeNames.has(type.typeName.name)
  ) {
    base = `${kind}.${type.typeName.name}(${cliName})`
  } else if (type.type === "TSUnionType" && type.types.every((t: Node) => t.type === "TSLiteralType")) {
    base = `${kind}.Literals(${cliName}, [${type.types.map((t: Node) => slice(t.literal)).join(", ")}])`
  } else {
    base = `${kind}.String(${cliName})`
    steps.push(`${kind}.withSchema(${typeToSchema(ctx, type)})`)
  }
  if (param.optional && param.value !== null) {
    ctx.diagnostics.push(
      diagnosticError(
        "EFX9001",
        "A parameter can't be both optional (`?`) and have a default",
        param.start,
        param.end,
        "drop `?`: a parameter with a default is never missing"
      )
    )
  } else if (param.optional) steps.push(`${kind}.optional`)
  if (param.value !== null) steps.push(`${kind}.withDefault(${slice(param.value)})`)
  const doc = jsdocBefore(ctx.source, previousEnd, param.start)
  if (doc?.alias !== undefined) steps.push(`${kind}.withAlias(${JSON.stringify(doc.alias)})`)
  if (doc !== undefined && doc.description !== "") {
    steps.push(`${kind}.withDescription(${JSON.stringify(doc.description)})`)
  }
  return `${name}: ${base}${steps.length > 0 ? `.pipe(${steps.join(", ")})` : ""}`
}

const commandDeclaration: Handler = (node, parent, ctx) => {
  const name: string = node.id.name
  const Command = ref(ctx, "effect/cli", "Command")
  const E = ref(ctx, "effect", "Effect")
  const params: Array<Node> = node.params
  const open = ctx.source.indexOf("(", node.id.end)
  const entries = params.map((param, i) => `  ${parameter(ctx, param, i === 0 ? open + 1 : params[i - 1]!.end)}`)
  const bindings = params.map((param) => param.name.name).join(", ")
  ctx.s.update(
    node.keyword.start,
    node.body.start,
    `const ${name} = ${Command}.make(${JSON.stringify(name)}, ${
      entries.length === 0 ? "{}" : `{\n${entries.join(",\n")}\n}`
    }, ${E}.fn(${JSON.stringify(name)})(function*(${bindings === "" ? "" : `{ ${bindings} }`}) `
  )
  // the handler is an ordinary effect function: `defer`/`using` make it scoped (review I1)
  const frame = makeFrame(node, "block")
  withEffect(ctx, frame, () => withNamespace(ctx, "Effect", () => walk(node.body, node, ctx)))
  ctx.s.appendLeft(node.body.end, frame.scoped ? `, ${E}.scoped))` : "))")
  const start = parent?.type === "ExportNamedDeclaration" ? parent.start : node.start
  const doc = jsdocBefore(ctx.source, 0, start)
  const description = doc !== undefined && doc.description !== ""
    ? `${Command}.withDescription(${JSON.stringify(doc.description)})`
    : undefined
  const pipes: Array<Node> = node.efxPipes ?? []
  if (description === undefined && pipes.length === 0) return true
  if (pipes.length === 0) {
    ctx.s.appendLeft(node.body.end, `.pipe(${description})`)
    return true
  }
  let previousEnd: number = node.body.end
  pipes.forEach((pipe, i) => {
    const text = i === 0 ? `.pipe(${description === undefined ? "" : `${description}, `}` : ", "
    ctx.s.update(previousEnd, pipe.start, text)
    withNamespace(ctx, "Command", () => walk(pipe, node, ctx))
    previousEnd = pipe.end
  })
  ctx.s.appendLeft(previousEnd, ")")
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const commandHandlers: HandlerGroup = {
  CommandDeclaration: commandDeclaration
}
