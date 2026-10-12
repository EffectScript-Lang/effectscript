import { parse, toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { runCompiled } from "./utils/run.ts"
import { typecheck } from "./utils/typecheck.ts"

// the type-checking tests build a program over Effect's sources, slowly under load
vi.setConfig({ testTimeout: 180_000 })

const program = (source: string): any => {
  const result = parse(source)
  if (result._tag !== "Success") throw new Error(`parse failed: ${JSON.stringify(result.diagnostics)}`)
  return result.program
}

const failure = (source: string) => {
  const result = parse(source)
  if (result._tag === "Success") throw new Error(`expected a parse error: ${source}`)
  return result.diagnostics[0]!
}

/** A clause's checks as written. */
const checks = (source: string, clause: any): Array<string> | null =>
  clause?.checks.map((c: any) => source.slice(c.start, c.end)) ?? null

const compile = (source: string) => toTypeScript(source, { filename: "t.efx", packageName: "t" })

const code = (source: string): string => {
  const result = compile(source)
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}

describe("brand: parsing (ADR-0077)", () => {
  it("reads `brand Name = Type [where …]`, exported or not", () => {
    const source = "brand UserId = string\nexport brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })\n"
    const [plain, exported] = program(source).body
    expect([plain.type, plain.id.name, plain.efxWhere]).toEqual(["BrandDeclaration", "UserId", null])
    expect(exported.declaration.type).toBe("BrandDeclaration")
    expect(checks(source, exported.declaration.efxWhere)).toEqual(["isBetween({ minimum: 1, maximum: 65535 })"])
  })

  it("reads a list, on one line or continued after `where` and after a comma", () => {
    const one = "brand Pair = Int where isGreaterThan(0), isLessThan(10)\nconst x = 1\n"
    expect(checks(one, program(one).body[0].efxWhere)).toEqual(["isGreaterThan(0)", "isLessThan(10)"])
    expect(program(one).body[1].type).toBe("VariableDeclaration")
    const many = "brand P = Int where\n  isGreaterThan(0),\n  isLessThan(10)\nconst x = 1\n"
    expect(checks(many, program(many).body[0].efxWhere)).toEqual(["isGreaterThan(0)", "isLessThan(10)"])
    expect(program(many).body[1].type).toBe("VariableDeclaration")
  })

  it("reads checks without arguments written bare (ADR-0300)", () => {
    const source = "brand Name = string where isTrimmed, isNonEmpty\n"
    expect(checks(source, program(source).body[0].efxWhere)).toEqual(["isTrimmed", "isNonEmpty"])
  })

  it("declares its name, so `export { Name }` finds it", () => {
    expect(code("brand UserId = string\nexport { UserId }\n")).toContain("export { UserId }")
  })

  it("refuses type parameters, and a union after the checks", () => {
    expect(failure("brand Box<T> = string\n")).toMatchObject({
      code: "EFX3002",
      message: "A brand can't have type parameters"
    })
    expect(failure("brand B = string where isMaxLength(5) | null\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` comes after the whole type",
      hint: "write `T | null where …`"
    })
  })

  it("keeps `brand` and `where` as names everywhere else", () => {
    const source = [
      "const brand = (x: number) => x",
      "brand(1)",
      "brand as unknown",
      "const where = 2",
      "export const f = (where: number) => where",
      ""
    ].join("\n")
    expect(toTypeScript(source).code).toBe(source)
  })
})

describe("brand: compiling (ADR-0077)", () => {
  it("brands with the declared name, checks first", () => {
    expect(code("brand Port = Int where isGreaterThan(0), isLessThan(65536)\n")).toBe(
      "import * as Schema from \"effect/Schema\"\n" +
        "const Port = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThan(65536)).pipe(Schema.brand(\"Port\"))\n" +
        "type Port = typeof Port.Type\n"
    )
  })

  it("refuses a brand that includes null or undefined", () => {
    const result = compile("brand MaybeId = string | null\n")
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "EFX3006",
      message: "A brand can't include `null` or `undefined`",
      hint: "brand the value, and write `MaybeId | null` where it's used"
    }))
  })

  it("compiles the long form exactly as before", () => {
    expect(code("schema UserId = string & Brand<\"UserId\">\n")).toBe(code("brand UserId = string\n"))
  })

  it("maps a brand's name to its const, so hover and go to definition work", () => {
    const source = "brand UserId = string where isNonEmpty\n"
    const result = compile(source)
    const name = source.indexOf("UserId")
    const mapping = result.mappings.find((m) =>
      m.sourceOffsets[0]! <= name && name < m.sourceOffsets[0]! + m.lengths[0]!
    )!
    expect(mapping.data.navigation).toBe(true)
    const generated = mapping.generatedOffsets[0]! + (name - mapping.sourceOffsets[0]!)
    expect(result.code.slice(generated)).toMatch(/^UserId = Schema\.String\.check\(/)
  })

  it("checks in `make`", async () => {
    const mod = await runCompiled(`
      export brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })
      export const ok = Port.make(8080)
      export const refused = (() => {
        try {
          Port.make(70000)
          return false
        } catch {
          return true
        }
      })()
    `)
    expect(mod.ok).toBe(8080)
    expect(mod.refused).toBe(true)
  })
})

describe("where: a check without arguments drops its `()` (ADR-0300)", () => {
  it("compiles a bare Schema check to its call, exactly as the called form", () => {
    const bare = code("brand Name = string where isTrimmed, isNonEmpty\n")
    expect(bare).toContain("const Name = Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty()).pipe(")
    expect(bare).toBe(code("brand Name = string where isTrimmed(), isNonEmpty()\n"))
    expect(code("schema Ratio = number where isFinite\n")).toBe(code("schema Ratio = number where isFinite()\n"))
    expect(code("schema Ratio = number where isFinite\n")).toContain("Schema.Number.check(Schema.isFinite())")
  })

  it("leaves a local binding as written, uncalled", () => {
    const out = code("const isShort = Schema.isMaxLength(5)\nbrand Code = string where isShort, isTrimmed\n")
    expect(out).toContain("Schema.String.check(isShort, Schema.isTrimmed())")
  })

  it("leaves a check that needs arguments to TypeScript's own error", () => {
    const out = code("export brand Short = string where isMaxLength\n")
    expect(out).toContain("Schema.String.check(Schema.isMaxLength())")
    const errors = typecheck(new Map([["where-bare.ts", out]]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^where-bare\.ts:\d+:\d+ Expected 1-2 arguments, but got 0\./)
  })
})

describe("where: parsing class fields and aliases (ADR-0077)", () => {
  it("reads checks after a field's type, and leaves a member named `where` alone", () => {
    const source = [
      "schema Server {",
      "  host: string where isNonEmpty",
      "  alias?: string where isTrimmed(), isMaxLength(20)",
      "  where: string",
      "  c: number",
      "  where(x: number) { return x }",
      "}",
      ""
    ].join("\n")
    const members = program(source).body[0].body.body
    expect(members.map((m: any) => [m.type, m.key.name, checks(source, m.efxWhere)])).toEqual([
      ["PropertyDefinition", "host", ["isNonEmpty"]],
      ["PropertyDefinition", "alias", ["isTrimmed()", "isMaxLength(20)"]],
      ["PropertyDefinition", "where", null],
      ["PropertyDefinition", "c", null],
      ["MethodDefinition", "where", null]
    ])
  })

  it("reads an alias's checks", () => {
    const source = "schema Percent = number where isBetween({ minimum: 0, maximum: 100 })\n"
    expect(checks(source, program(source).body[0].efxWhere)).toEqual(["isBetween({ minimum: 0, maximum: 100 })"])
  })

  it("refuses checks where they can't go, each with its own message", () => {
    expect(failure("schema X { tags: Array<string where isNonEmpty> }\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` checks a field or a declaration, not a nested type",
      hint: "write the field as `name = <Schema expression>`"
    })
    expect(failure("schema X { a: string where isMaxLength(5) | null }\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` comes after the whole type"
    })
    expect(failure("config C { port: Int where isGreaterThan(0) }\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` isn't available on `config` fields",
      hint: "give the field a `brand` or alias type that carries the checks"
    })
    expect(failure("schema X { a: Int where isGreaterThan(0) = Int }\n")).toMatchObject({
      code: "EFX3005",
      message: "A field with `where` checks can't also have `= <schema>`"
    })
    expect(failure("command go(--count: Int where isGreaterThan(0)) {}\n")).toMatchObject({
      code: "EFX3005",
      message: "`where` isn't available on `command` parameters",
      hint: "check the value in the command's body"
    })
  })

  it("keeps a plain class's member named `where` and a type literal's `where` member", () => {
    const source = [
      "type Query = {",
      "  limit: number",
      "  where: string",
      "}",
      "class Repo {",
      "  table: string = \"\"",
      "  where(filter: string) { return filter }",
      "}",
      ""
    ].join("\n")
    expect(toTypeScript(source).code).toBe(source)
  })
})

describe("where: compiling class fields and aliases (ADR-0077)", () => {
  it("keeps null and undefined outside the checks, and `?` around them", () => {
    const out = code([
      "schema S {",
      "  a?: string where isMaxLength(2)",
      "  b?: string | undefined where isMaxLength(2)",
      "  c: string | null where isMaxLength(2)",
      "  d: string | undefined where isMaxLength(2)",
      "  e: string | null | undefined where isMaxLength(2)",
      "  f?: string | null | undefined where isMaxLength(2)",
      "}",
      ""
    ].join("\n"))
    expect(out).toContain("a: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("b: Schema.optional(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("c: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("d: Schema.UndefinedOr(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("e: Schema.NullishOr(Schema.String.check(Schema.isMaxLength(2))),")
    expect(out).toContain("f: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(2))))")
  })

  it("writes a list from several lines on one line, and splits nothing inside a check", () => {
    const out = code(
      "schema S {\n  age: Int where\n    isBetween({ minimum: 0, maximum: 150 }),\n    isLessThan(9)\n}\n"
    )
    expect(out).toContain("age: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 150 }), Schema.isLessThan(9))")
  })

  it("qualifies builtins only: a module binding and an arrow parameter stay as written", () => {
    const out = code([
      "const isUUID = Schema.isUUID(4)",
      "schema S {",
      "  id: string where isUUID, isNonEmpty",
      "  email: string where makeFilter((check: string) => check.includes(\"@\"))",
      "  ratio: number where makeFilter((isFinite: number) => isFinite > 0)",
      "}",
      ""
    ].join("\n"))
    expect(out).toContain("id: Schema.String.check(isUUID, Schema.isNonEmpty()),")
    expect(out).toContain("email: Schema.String.check(Schema.makeFilter((check: string) => check.includes(\"@\"))),")
    expect(out).toContain("ratio: Schema.Number.check(Schema.makeFilter((isFinite: number) => isFinite > 0))")
  })

  it("compiles both spellings of a check without arguments to the same TypeScript (ADR-0300)", () => {
    expect(code("schema S {\n  name: string where isTrimmed, isNonEmpty\n  n: number where isFinite\n}\n")).toBe(
      code("schema S {\n  name: string where isTrimmed(), isNonEmpty()\n  n: number where isFinite()\n}\n")
    )
  })

  it("refuses checks on null alone", () => {
    expect(compile("schema S { a: null where isFinite }\n").diagnostics).toContainEqual(expect.objectContaining({
      code: "EFX3005",
      message: "`where` needs a type to check besides `null` and `undefined`"
    }))
  })

  it("compiles `=` checks exactly as `where` checks", () => {
    expect(code("schema S { age = Int.check(isGreaterThan(0)) }\n")).toBe(
      code("schema S { age: Int where isGreaterThan(0) }\n")
    )
  })

  it("runs the checks when decoding", async () => {
    const { Exit } = await import("effect")
    const mod = await runCompiled(`
      import { Schema } from "effect"
      export schema Signup {
        name: string where isTrimmed, isNonEmpty
        nickname?: string where isMaxLength(3)
        manager: string | null where isMaxLength(2)
      }
      export const decode = (input: unknown) => Schema.decodeUnknownExit(Signup)(input)
    `)
    expect(Exit.isSuccess(mod.decode({ name: "Ada", manager: null }))).toBe(true)
    expect(Exit.isFailure(mod.decode({ name: " Ada", manager: null }))).toBe(true)
    expect(Exit.isFailure(mod.decode({ name: "Ada", nickname: "toolong", manager: null }))).toBe(true)
    expect(Exit.isFailure(mod.decode({ name: "Ada", manager: "abc" }))).toBe(true)
  })
})

describe("where: fields written out whole (ADR-0077)", () => {
  it("splits a type literal's members and a signature's fields at the next name", () => {
    const literal =
      "schema Mixed = { a: number where isFinite; b: string; c?: Int where isGreaterThan(0), isLessThan(9), d: string; \"x-id\": string where isUUID(), readonly e: number }\n"
    expect(
      program(literal).body[0].typeAnnotation.members.map((
        m: any
      ) => [literal.slice(m.key.start, m.key.end), checks(literal, m.efxWhere)])
    )
      .toEqual([["a", ["isFinite"]], ["b", null], ["c", ["isGreaterThan(0)", "isLessThan(9)"]], ["d", null], [
        "\"x-id\"",
        ["isUUID()"]
      ], ["e", null]])
    const rpc =
      "rpc Users {\n  get(id: string where isUUID, limit?: Int where isGreaterThan(0), isLessThan(100), page: Int): User\n}\n"
    expect(program(rpc).body[0].lines[0].fields.map((f: any) => [f.key.name, checks(rpc, f.efxWhere)]))
      .toEqual([["id", ["isUUID"]], ["limit", ["isGreaterThan(0)", "isLessThan(100)"]], ["page", null]])
  })

  it("qualifies a check once when a commented struct alias is rendered twice", () => {
    const out = code("schema Point = {\n  // across\n  x: number where isFinite\n  y: number\n}\n")
    expect(out).toContain("x: Schema.Number.check(Schema.isFinite())")
    expect(out).not.toContain("Schema.Schema.")
    expect(out).not.toContain("()()")
  })

  it("puts a tool parameter's checks in the JSON Schema the model reads", async () => {
    const { Tool } = await import("effect/ai")
    const mod = await runCompiled(`
      /** Searches the catalog. */
      export tool Search(query: string where isNonEmpty, limit?: Int where isBetween({ minimum: 1, maximum: 50 })): Array<string>
    `)
    expect(Tool.getJsonSchema(mod.Search)).toMatchObject({
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 50 }
      },
      required: ["query"]
    })
  })
})

const back = (ts: string): string => toEffectScript(ts, { filename: "t.ts", packageName: "t" }).code

describe("brand and where: the reverse compiler (ADR-0077)", () => {
  it("gives a brand back when its key is its name, and keeps any other key", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "export const UserId = Schema.String.pipe(Schema.brand(\"UserId\"))",
      "export type UserId = typeof UserId.Type",
      "const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).pipe(Schema.brand(\"Port\"))",
      "type Port = typeof Port.Type",
      "const Legacy = Schema.String.pipe(Schema.brand(\"billing/Legacy\"))",
      "type Legacy = typeof Legacy.Type",
      "const Plan = Schema.Literals([\"free\", \"pro\"]).pipe(Schema.brand(\"Plan\"))",
      "type Plan = typeof Plan.Type",
      "const MaybeId = Schema.NullOr(Schema.String).pipe(Schema.brand(\"MaybeId\"))",
      "type MaybeId = typeof MaybeId.Type",
      ""
    ].join("\n"))
    expect(efx).toContain("export brand UserId = string\n")
    expect(efx).toContain("brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })\n")
    expect(efx).toContain("schema Legacy = string & Brand<\"billing/Legacy\">\n")
    expect(efx).toContain("brand Plan = \"free\" | \"pro\"\n")
    // a brand can't include `null` (EFX3006): it stays TypeScript
    expect(efx).not.toContain("brand MaybeId")
  })

  it("gives checked fields back with the checks after the type, and leaves non-`where` shapes as `=` fields", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "export class S extends Schema.Class<S>(\"S\")({",
      "  a: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2))),",
      "  b: Schema.optional(Schema.String.check(Schema.isMaxLength(2))),",
      "  c: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2), Schema.isTrimmed())),",
      "  d: Schema.NullOr(Schema.String).check(Schema.isNonEmpty()),",
      "  e: Schema.String.check(Schema.isTrimmed()).check(Schema.isNonEmpty())",
      "}) {}",
      ""
    ].join("\n"))
    expect(efx).toContain("a?: string where isMaxLength(2)\n")
    expect(efx).toContain("b?: string | undefined where isMaxLength(2)\n")
    expect(efx).toContain("c: string | null where isMaxLength(2), isTrimmed\n")
    // a check on the nullable union, and two chained checks, aren't what `where` writes
    expect(efx).toContain("d = NullOr(Schema.String).check(isNonEmpty())\n")
    expect(efx).toContain("e = Schema.String.check(isTrimmed()).check(isNonEmpty())\n")
  })

  it("writes a check without arguments bare, and a call with arguments as a call (ADR-0300)", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "export const Ratio = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))",
      "export type Ratio = typeof Ratio.Type",
      "export const Name = Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty()).pipe(Schema.brand(\"Name\"))",
      "export type Name = typeof Name.Type",
      ""
    ].join("\n"))
    expect(efx).toContain("export schema Ratio = number where isFinite, isGreaterThan(0)\n")
    expect(efx).toContain("export brand Name = string where isTrimmed, isNonEmpty\n")
  })

  it("keeps `Schema.` on a builtin whose name the module binds", () => {
    const efx = back([
      "import { Schema } from \"effect\"",
      "const isTrimmed = (s: string) => s.trim() === s",
      "export class S extends Schema.Class<S>(\"S\")({",
      "  a: Schema.String.check(Schema.isTrimmed())",
      "}) {}",
      ""
    ].join("\n"))
    expect(efx).toContain("a: string where Schema.isTrimmed()\n")
  })
})
