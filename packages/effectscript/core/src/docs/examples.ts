/**
 * `// =>` assertions in `efx` examples (ADR-0042) → calls to `effectscript/doctest`.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import type { Node } from "../compiler/ast.ts"
import { type Diagnostic, diagnosticError } from "../compiler/diagnostics.ts"
import { parse } from "../compiler/parser/parse.ts"
import type { DocExample } from "./comment.ts"

/**
 * @since 4.0.0
 * @category constants
 */
export const helpers = "$efxDoctest"

const prefix = "effect {\n"

/**
 * @since 4.0.0
 * @category rewriting
 */
export const rewriteExample = (
  example: DocExample
): { readonly lines: ReadonlyArray<string>; readonly diagnostics: ReadonlyArray<Diagnostic> } => {
  const wrapped = `${prefix}${example.code}\n}`
  const lineStarts = [0]
  for (let i = 0; i < example.code.length; i++) if (example.code[i] === "\n") lineStarts.push(i + 1)
  /** offset in example.code → source offset */
  const toSource = (offset: number): number => {
    let line = 0
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line++
    return example.offsets[line]! + (offset - lineStarts[line]!)
  }
  const at = (code: string, message: string, start: number, end: number, hint?: string) =>
    diagnosticError(code, message, toSource(Math.max(0, start)), toSource(Math.max(start, end)), hint)
  const parsed = parse(wrapped)
  if (parsed._tag === "Failure") {
    const d = parsed.diagnostics[0]!
    const offset = Math.min(Math.max(0, d.start - prefix.length), Math.max(0, example.code.length - 1))
    return { lines: example.code.split("\n"), diagnostics: [at("EFX9301", `This example doesn't parse: ${d.message}`, offset, offset + 1)] }
  }
  const block: Node = parsed.program.body[0].expression?.body ?? parsed.program.body[0].body
  const statements: ReadonlyArray<Node> = block.body
  const s = new MagicString(example.code)
  const diagnostics: Array<Diagnostic> = []
  for (const comment of parsed.comments) {
    if (!comment.line) continue
    const text = wrapped.slice(comment.start + 2, comment.end).trim()
    if (!text.startsWith("=>")) continue
    const start = comment.start - prefix.length
    const end = comment.end - prefix.length
    const expected = text.slice(2).trim()
    const statement = [...statements].reverse().find((st) => st.end - prefix.length <= start)
    const sameLine = statement !== undefined && !example.code.slice(statement.end - prefix.length, start).includes("\n")
    const awaited: Node | undefined = statement?.type === "ExpressionStatement" && statement.expression.type === "AwaitExpression"
      ? statement.expression.argument
      : undefined
    if (expected === "dies") {
      if (!sameLine || awaited === undefined) {
        diagnostics.push(at("EFX9303", "`// => dies` must follow `await <effect>` on the same line", start, end, "write `await e // => dies`"))
        continue
      }
      s.appendLeft(awaited.start - prefix.length, `${helpers}.dies(`)
      s.appendRight(awaited.end - prefix.length, ")")
      continue
    }
    const throwsMatch = /^throws\b\s*(.*)$/.exec(expected)
    if (throwsMatch !== null) {
      const name = throwsMatch[1]!.trim()
      const operand: Node | undefined = statement?.type === "ExpressionStatement" && statement.expression.type === "AwaitExpression"
        ? statement.expression.argument
        : undefined
      if (!sameLine || operand === undefined || !/^[A-Za-z_$][\w$]*$/.test(name)) {
        diagnostics.push(at("EFX9303", "`// => throws Name` must follow `await <effect>` on the same line", start, end, "write `await e // => throws ErrorName`"))
        continue
      }
      s.appendLeft(operand.start - prefix.length, `${helpers}.failsWith(`)
      s.appendRight(operand.end - prefix.length, `, ${JSON.stringify(name)})`)
      continue
    }
    if (!sameLine || expected === "") {
      diagnostics.push(at("EFX9302", "`// => expected` must follow an expression or a `const` on the same line", start, end))
      continue
    }
    if (statement.type === "ExpressionStatement") {
      const e: Node = statement.expression
      s.appendLeft(e.start - prefix.length, `${helpers}.assertDoc(`)
      s.appendRight(e.end - prefix.length, `, (${expected}))`)
    } else if (
      statement.type === "VariableDeclaration" && statement.kind === "const" && statement.declarations.length === 1 &&
      statement.declarations[0].id.type === "Identifier"
    ) {
      const name: string = statement.declarations[0].id.name
      s.appendRight(statement.end - prefix.length, `${example.code[statement.end - prefix.length - 1] === ";" ? "" : ";"} ${helpers}.assertDoc(${name}, (${expected}))`)
    } else {
      diagnostics.push(at("EFX9302", "`// => expected` must follow an expression or a `const` on the same line", start, end))
    }
  }
  return { lines: s.toString().split("\n"), diagnostics }
}
