import { toEffectScript } from "effectscript/compiler"
import { verdict } from "effectscript/compiler/reverse/verify"
import { describe, expect, it } from "vitest"

// ADR-0306: outside compiler output, a round trip holds when the code compiles back to the same
// syntax tree and comments; semicolons, trailing commas and layout aside.
describe("reverse: round trips compare syntax trees (ADR-0306)", () => {
  it("converts a file formatted with semicolons", () => {
    const ts = `import * as Schema from "effect/Schema";

export const Link = Schema.Struct({
  code: Schema.String,
  url: Schema.String,
});
export type Link = typeof Link.Type;
`
    expect(toEffectScript(ts).code.trim()).toBe("export schema Link = { code: string; url: string }")
  })

  it.each([
    ["an empty statement", "if (x);\nfoo()\n", "if (x)\nfoo()\n"],
    ["a line that would join the previous one", "a;\n(b)\n", "a\n(b)\n"],
    [
      "a line break after return",
      "const f = () => {\n  return (\n    x\n  ) * 2\n}\n",
      "const f = () => {\n  return\n  x * 2\n}\n"
    ],
    ["a literal's spelling", "const x = 'a'\n", "const x = \"a\"\n"]
  ])("still tells apart %s", (_name, ts, efx) => {
    expect(verdict(ts, efx, {})).toBe(0)
  })

  it("ignores semicolons, trailing commas and redundant parentheses", () => {
    expect(verdict("const a = (b);\nf(a, b,);\n", "const a = b\nf(a, b)\n", {})).toBe(1)
  })
})
