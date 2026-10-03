import { convertBlock, convertMarkdown, jsdocExamples, tokens } from "@effectscript/effect-docs/translate"
import { toTypeScript } from "effectscript/compiler"
import ts from "typescript"
import { describe, expect, it } from "vitest"

const effectCode =
  "import { Effect } from \"effect\"\n\nexport const f = Effect.fn(\"f\")(function*(n: number) {\n  return n + 1\n})\n"

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
        code:
          "import { Effect } from \"effect\"\n\nconst program = Effect.succeed(1).pipe(\n  Effect.map((n) => n + 1)\n)\n",
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

describe("Plan 13 review fixes", () => {
  it("keeps a block as TypeScript when, as EffectScript, it wouldn't compile back (I2)", () => {
    // EffectScript would import Option automatically; the original relies on a global
    const block = convertBlock("declare const Option: { some: (n: number) => unknown }\nOption.some(1)\n")
    expect(block.valid).toBe(true)
    const prelude = convertBlock("const o = Option.some(1)\n")
    expect(prelude).toMatchObject({ changed: false, parsed: true, valid: false })
    expect(convertMarkdown("```ts\nconst o = Option.some(1)\n```\n").markdown).toBe(
      "```ts\nconst o = Option.some(1)\n```\n"
    )
  })

  it("leaves v3 examples as TypeScript and out of the corpus (I5)", () => {
    const md =
      "**v3**\n\n```ts\nimport { Effect } from \"effect\"\nconst x = Effect.gen(function*() { return 1 })\n```\n\n**v4**\n\n```ts\nimport { Effect } from \"effect\"\nconst y = Effect.gen(function*() { return 1 })\n```\n"
    const converted = convertMarkdown(md)
    expect(converted.markdown).toContain("**v3**\n\n```ts\nimport { Effect } from \"effect\"\nconst x = Effect.gen(")
    expect(converted.markdown).toContain("**v4**\n\n```efx\n")
    expect(converted.blocks).toHaveLength(1)
  })

  it("counts tokens inside template literals (I6)", () => {
    const template = "const a = `x ${b} y`"
    const after = "const c = d + e + f"
    expect(tokens(`${template}\n${after}\n`)).toBe(tokens(`${template}\n`) + tokens(`${after}\n`))
  })

  it("names the documented symbol for export specifiers, members and namespace members (I3)", () => {
    const source = [
      "export declare namespace Schema {",
      "  /**",
      "   * ```ts",
      "   * type T = 1",
      "   * ```",
      "   */",
      "  type Type<S> = S",
      "}",
      "export interface Service {",
      "  /**",
      "   * ```ts",
      "   * const m = 1",
      "   * ```",
      "   */",
      "  readonly method: () => void",
      "}",
      "/**",
      " * ```ts",
      " * const s = 1",
      " * ```",
      " */",
      "// @ts-expect-error",
      "export const some = 1",
      "const let_ = 1",
      "export {",
      "  /**",
      "   * ```ts",
      "   * const l = 1",
      "   * ```",
      "   */",
      "  let_ as let",
      "}",
      ""
    ].join("\n")
    expect(jsdocExamples(source).map((e) => e.symbol)).toEqual(["Schema.Type", "Service.method", "some", "let"])
  })
})

describe("Plan 21: odd Markdown keeps its text", () => {
  const fence = (lang: string, body: string, marker = "```") => `${marker}${lang}\n${body}${marker}`

  it("leaves a ts fence that sits inside another fence", () => {
    const md = `${fence("md", `${fence("ts", effectCode)}\n`, "````")}\n`
    expect(convertMarkdown(md).markdown).toBe(md)
  })

  it("leaves code indented four spaces, even when it looks like a fence", () => {
    const md = `Text\n\n    ${fence("ts", effectCode).split("\n").join("\n    ")}\n`
    expect(convertMarkdown(md).markdown).toBe(md)
  })

  it("converts only the languages it knows: ts-node stays", () => {
    const md = `${fence("ts-node", effectCode)}\n`
    expect(convertMarkdown(md).markdown).toBe(md)
  })

  it("keeps CRLF line endings and a byte order mark", () => {
    const md = `﻿# Title\r\n\r\n${fence("ts", effectCode).replace(/\n/g, "\r\n")}\r\n`
    const out = convertMarkdown(md).markdown
    expect(out.startsWith("﻿# Title\r\n")).toBe(true)
    expect(out).toContain("```efx\r\n")
    expect(out.replace(/\r\n/g, "")).not.toContain("\n")
  })

  it("doesn't start a converted fence with a blank line where the import was", () => {
    const out = convertMarkdown(`${fence("ts", effectCode)}\n`).markdown
    expect(out.startsWith("```efx\nexport effect f(")).toBe(true)
    expect(convertBlock(effectCode).efx.startsWith("\n")).toBe(false)
  })
})
