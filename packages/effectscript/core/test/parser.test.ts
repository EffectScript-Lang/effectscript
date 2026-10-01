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

import { children } from "effectscript/compiler/ast"

const find = (node: any, predicate: (n: any) => boolean): any => {
  if (predicate(node)) return node
  for (const child of children(node)) {
    const found = find(child, predicate)
    if (found !== undefined) return found
  }
  return undefined
}

describe("effect syntax", () => {
  it("parses effect declarations with throws/needs and trailing pipes", () => {
    const { program } = ok(
      "export effect getUser(id: string): User throws NotFound needs Db {\n  return await load(id)\n} |> retry(1) |> orDie\n"
    )
    const fn = program.body[0].declaration
    expect(fn.type).toBe("FunctionDeclaration")
    expect(fn.efx.kind).toBe("declaration")
    expect(fn.async).toBe(true)
    expect(fn.returnType.typeAnnotation.type).toBe("TSTypeReference")
    expect(fn.returnType.efxThrows.type).toBe("TSTypeReference")
    expect(fn.returnType.efxNeeds.type).toBe("TSTypeReference")
    expect(fn.body.body[0].argument.type).toBe("AwaitExpression")
    expect(fn.efxPipes.map((p: any) => p.type)).toEqual(["CallExpression", "Identifier"])
    expect(fn.efxPipeOps).toHaveLength(2)
  })

  it("parses export default effect declarations", () => {
    const { program } = ok("export default effect main() {\n  await run\n}\n")
    expect(program.body[0].type).toBe("ExportDefaultDeclaration")
    expect(program.body[0].declaration.efx.exportDefault).toBe(true)
  })

  it("parses effect blocks, arrows and object methods", () => {
    const { program } = ok(
      "const a = effect { await x }\nconst b = effect (n: number): string throws E => await f(n)\nconst c = effect n => n\nconst d = { effect m(x) { await x } }\n"
    )
    expect(program.body[0].declarations[0].init.type).toBe("EffectBlock")
    const b = program.body[1].declarations[0].init
    expect(b.type).toBe("ArrowFunctionExpression")
    expect(b.efx.kind).toBe("arrow")
    expect(b.body.type).toBe("AwaitExpression")
    expect(b.returnType.efxThrows.type).toBe("TSTypeReference")
    expect(program.body[2].declarations[0].init.efx.kind).toBe("arrow")
    const prop = program.body[3].declarations[0].init.properties[0]
    expect(prop.efxMethod).toBe(true)
    expect(prop.key.name).toBe("m")
    expect(prop.value.efx.kind).toBe("method")
    expect(prop.value.efx.keyword.start).toBe(prop.start)
  })

  it("parses effect class members, with and without bodies", () => {
    const { program } = ok("class S {\n  effect find(id: string): User throws E\n  effect load() { await x }\n}\n")
    const [find1, load] = program.body[0].body.body
    expect(find1.type).toBe("MethodDefinition")
    expect(find1.value.type).toBe("TSDeclareMethod")
    expect(find1.efx.kind).toBe("method")
    expect(find1.value.returnType.efxThrows.type).toBe("TSTypeReference")
    expect(load.type).toBe("MethodDefinition")
    expect(load.value.efx.kind).toBe("method")
  })

  it("parses throws in function types", () => {
    const { program } = ok("type F = (id: string) => User throws NotFound\n")
    expect(find(program, (n) => n.efxThrows !== undefined)).toBeDefined()
  })

  it("contextual words remain identifiers", () => {
    ok(
      "const effect = 1\neffect + 1\nfunction match(a: number) { return a }\nmatch(1)\n" +
        "const o = { effect: 1, effect2() {}, effect() {} }\nclass K { effect = 1; effect2() {} }\n" +
        "const main = () => 1\nmain()\nconst defer = (f: () => void) => f\ndefer(() => {})\n" +
        "const throws = 1, needs = 2\neffect\n{ }\n"
    )
  })
})

describe("try statements", () => {
  it("parses multiple typed catch clauses", () => {
    const { program } = ok("try { a } catch (e: A) { b } catch (e: B | C) { c } catch { d } finally { e }\n")
    const statement = program.body[0]
    expect(statement.handlers).toHaveLength(3)
    expect(statement.handler).toBe(statement.handlers[0])
    expect(statement.handlers[2].param).toBeNull()
    expect(statement.finalizer.type).toBe("BlockStatement")
  })
})
