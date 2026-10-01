import { parse } from "effectscript/compiler/parser/parse"
import { describe, expect, it } from "vitest"

const ok = (source: string) => {
  const result = parse(source)
  if (result._tag === "Failure") throw new Error(result.diagnostics.map((d) => d.message).join("\n"))
  return result
}

describe("parse modes", () => {
  it("parses plain TypeScript in ts mode", () => {
    expect(ok("const id = <T>(x: T) => x\nconst n = <number>1\n").mode).toBe("ts")
  })

  it("parses JSX in tsx mode", () => {
    expect(ok("const el = <div className=\"a\">{1}</div>\n").mode).toBe("tsx")
  })

  it("falls back to ts when a JSX-looking file is TypeScript", () => {
    expect(ok("// closing tag text: </div>\nconst id = <T>(x: T) => x\n").mode).toBe("ts")
  })

  it("reports the furthest error as an EFX1001 diagnostic", () => {
    const result = parse("const a = 1\nconst = 2\n")
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.diagnostics[0]!.code).toBe("EFX1001")
      expect(result.diagnostics[0]!.start).toBe(18)
    }
  })
})

describe("pipeline token", () => {
  it("parses |> as a left-associative PipelineExpression", () => {
    const { program } = ok("const z = a |> f |> g(1)\n")
    const init = program.body[0].declarations[0].init
    expect(init.type).toBe("PipelineExpression")
    expect(init.left.type).toBe("PipelineExpression")
    expect(init.right.type).toBe("CallExpression")
  })

  it("binds looser than ?? and tighter than the conditional", () => {
    const { program } = ok("const z = a ?? b |> f\nconst y = c ? d : e |> f\n")
    expect(program.body[0].declarations[0].init.left.type).toBe("LogicalExpression")
    expect(program.body[1].declarations[0].init.type).toBe("ConditionalExpression")
  })

  it("does not tokenize |> inside types", () => {
    expect(ok("type A = Array<string | number>\n").mode).toBe("ts")
  })
})
