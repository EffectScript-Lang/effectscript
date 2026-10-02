import { convertBlock, convertMarkdown, jsdocExamples, tokens } from "@effectscript/docs/translate"
import { toTypeScript } from "effectscript/compiler"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const effectCode = "import { Effect } from \"effect\"\n\nexport const f = Effect.fn(\"f\")(function*(n: number) {\n  return n + 1\n})\n"

/** Tokens of TypeScript code, for the round trip contract (ADR-0030). */
const scan = (code: string) => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code)
  const out: Array<string> = []
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) out.push(scanner.getTokenText())
  return out
}

describe("convertBlock (Plan 13 Task 1, ADR-0050)", () => {
  it("re-sugars Effect code and round-trips it", () => {
    const block = convertBlock(effectCode)
    expect(block.changed).toBe(true)
    expect(block.parsed).toBe(true)
    expect(block.efx).toContain("export effect f(n: number)")
    expect(scan(toTypeScript(block.efx).code)).toEqual(scan(effectCode))
  })

  it("keeps plain TypeScript, and marks code that doesn't parse", () => {
    expect(convertBlock("const a = 1\n")).toMatchObject({ efx: "const a = 1\n", changed: false, parsed: true })
    expect(convertBlock("const a = {\n  ...\n}\n")).toMatchObject({ changed: false, parsed: false })
  })
})

describe("convertMarkdown (Plan 13 Task 1)", () => {
  it("rewrites ts, typescript and tsx fences, keeping info strings and everything else", () => {
    const md = [
      "# Title with `inline` code",
      "",
      "```ts",
      effectCode.trimEnd(),
      "```",
      "",
      "- a list item:",
      "",
      "  ```typescript",
      "  const x = 1",
      "  ```",
      "",
      "~~~ts",
      "const tilde = 1",
      "~~~",
      "",
      "```ts",
      "const broken = {",
      "```",
      "",
      "```sh",
      "npm i effect",
      "```",
      ""
    ].join("\n")
    const converted = convertMarkdown(md)
    expect(converted.markdown).toBe(
      [
        "# Title with `inline` code",
        "",
        "```efx",
        convertBlock(effectCode).efx.trimEnd(),
        "```",
        "",
        "- a list item:",
        "",
        "  ```efx",
        "  const x = 1",
        "  ```",
        "",
        "~~~efx",
        "const tilde = 1",
        "~~~",
        "",
        "```ts",
        "const broken = {",
        "```",
        "",
        "```sh",
        "npm i effect",
        "```",
        ""
      ].join("\n")
    )
    expect(converted.blocks.map((b) => [b.changed, b.parsed])).toEqual([[true, true], [false, true], [false, true], [
      false,
      false
    ]])
  })
})

describe("jsdocExamples (Plan 13 Task 1)", () => {
  const source = [
    "/**",
    " * The module.",
    " *",
    " * ```ts",
    " * import { Option } from \"effect\"",
    " * ```",
    " *",
    " * @since 2.0.0",
    " */",
    "",
    "/**",
    " * Maps.",
    " *",
    " * **Example** (Mapping a value)",
    " *",
    " * ```ts import.meta.vitest",
    " * import { Effect } from \"effect\"",
    " *",
    " * const program = Effect.succeed(1).pipe(",
    " *   Effect.map((n) => n + 1)",
    " * )",
    " * ```",
    " */",
    "export const map: {",
    "  <A, B>(f: (a: A) => B): <E, R>(self: Effect<A, E, R>) => Effect<B, E, R>",
    "} = null as any",
    "",
    "export declare namespace Option {",
    "  /**",
    "   * ```ts",
    "   * type V = 1",
    "   * ```",
    "   */",
    "  export type Value<T> = T",
    "}",
    "",
    "/**",
    " * ```ts",
    " * declare const a: number",
    " * ```",
    " */",
    "export function overloaded(a: number): number",
    "export function overloaded(a: string): string",
    ""
  ].join("\n")

  it("extracts every fence exactly, with its symbol and title", () => {
    expect(jsdocExamples(source)).toEqual([
      { symbol: undefined, title: undefined, code: "import { Option } from \"effect\"\n", line: 4 },
      {
        symbol: "map",
        title: "Mapping a value",
        code: "import { Effect } from \"effect\"\n\nconst program = Effect.succeed(1).pipe(\n  Effect.map((n) => n + 1)\n)\n",
        line: 16
      },
      { symbol: "Option.Value", title: undefined, code: "type V = 1\n", line: 30 },
      { symbol: "overloaded", title: undefined, code: "declare const a: number\n", line: 38 }
    ])
  })
})

describe("tokens (Plan 13 Task 1)", () => {
  it("counts scanner tokens, not characters", () => {
    expect(tokens("const a = 1 // comment\n")).toBe(4)
    expect(tokens("export effect f() {\n  return await g()\n}\n")).toBe(12)
  })
})
