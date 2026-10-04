import { toTypeScript } from "effectscript/compiler"
import { parse } from "effectscript/compiler/parser/parse"
import { describe, expect, it } from "vitest"

const program = (source: string) => {
  const result = parse(source)
  if (result._tag === "Failure") throw new Error(result.diagnostics.map((d) => d.message).join("\n"))
  return result.program
}
const init = (source: string) => program(source).body[0].declarations[0].init
const names = (pattern: any) =>
  pattern.tags.map((t: any) => t.type === "MemberExpression" ? `${t.object.name}.${t.property.name}` : t.name)

describe("parse: is (ADR-0087)", () => {
  it("parses a test", () => {
    const node = init("const a = e is TimeoutError\n")
    expect(node.type).toBe("IsExpression")
    expect(node.subject.name).toBe("e")
    expect(names(node.pattern)).toEqual(["TimeoutError"])
    expect(node.pattern.negated).toBe(false)
  })

  it("parses dotted names, or, not and parentheses", () => {
    expect(names(init("const a = e is Cause.TimeoutError or RateLimited\n").pattern)).toEqual([
      "Cause.TimeoutError",
      "RateLimited"
    ])
    const not = init("const a = e is not A\n").pattern
    expect([not.negated, not.parenthesized, names(not)]).toEqual([true, false, ["A"]])
    const group = init("const a = e is not (A or B)\n").pattern
    expect([group.negated, group.parenthesized, names(group)]).toEqual([true, true, ["A", "B"]])
    const plain = init("const a = e is (A or B)\n").pattern
    expect([plain.negated, plain.parenthesized, names(plain)]).toEqual([false, true, ["A", "B"]])
  })

  it("parses a predicate where an expression starts", () => {
    const call = program("retry({ times: 2, while: is TimeoutError })\n").body[0].expression
    const predicate = call.arguments[0].properties[1].value
    expect(predicate.type).toBe("IsExpression")
    expect(predicate.subject).toBe(null)
    expect(names(predicate.pattern)).toEqual(["TimeoutError"])
    expect(init("const p = is not Closed\n").pattern.negated).toBe(true)
  })

  it("binds like instanceof", () => {
    const and = init("const a = ok && e is A\n")
    expect([and.type, and.right.type]).toEqual(["LogicalExpression", "IsExpression"])
    const plus = init("const a = x + y is A\n")
    expect([plus.type, plus.subject.type]).toEqual(["IsExpression", "BinaryExpression"])
    const awaited = init("const a = await load() is A\n")
    expect([awaited.type, awaited.subject.type]).toEqual(["IsExpression", "AwaitExpression"])
  })

  it("wraps after `or`, not before it", () => {
    expect(names(init("const a = e is A or\n  B\n").pattern)).toEqual(["A", "B"])
    const body = program("const a = e is A\nor(b)\n").body
    expect(body.map((s: any) => s.type)).toEqual(["VariableDeclaration", "ExpressionStatement"])
  })

  it("reads a line that starts with `is` as a predicate, not a test", () => {
    const body = program("const ok = error\n  is RateLimited\n").body
    expect(body.map((s: any) => s.type)).toEqual(["VariableDeclaration", "ExpressionStatement"])
    expect(body[1].expression.subject).toBe(null)
  })

  it("keeps a pattern that isn't a name for EFX7004", () => {
    expect(init("const a = x is 404\n").pattern.tags[0].type).toBe("Literal")
  })

  it.each([
    ["a call", "is(x)\n"],
    ["a method", "const same = Object.is(a, b)\n"],
    ["variables", "const is = 1, or = 2, not = 3\n"],
    ["as", "const g = is as Guard\n"],
    ["satisfies", "const g = is satisfies Guard\n"],
    ["for of", "for (is of list) {}\n"],
    ["a type predicate", "function f(x: unknown): x is string { return true }\n"],
    ["an arrow's type predicate", "const g = (x: unknown): x is string => true\n"],
    ["a conditional with a predicate arrow", "const h = ok ? (x: unknown): x is string => true : undefined\n"],
    ["a call on the next line", "e\nis(A)\n"]
  ])("keeps %s as TypeScript", (_, source) => {
    expect(toTypeScript(source, { filename: "plain.efx" }).code).toBe(source)
  })
})
