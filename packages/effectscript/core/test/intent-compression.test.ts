import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const compile = (efx: string) => {
  const result = toTypeScript(efx, { filename: "a.efx" })
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([])
  return result.code
}
const back = (ts: string) => toEffectScript(ts, { filename: "a.ts" }).code

describe("one form per intent (ADR-0091)", () => {
  describe("A1: one pipeline form", () => {
    it("pipes Effect's own constructors with `.pipe(…)`, as their types declare", () => {
      expect(compile("export const a = Stream.make(1, 2) |> Stream.map((n) => n * 2)\n"))
        .toContain("Stream.make(1, 2).pipe(Stream.map((n) => n * 2))")
      expect(compile("export const b = Schema.String |> Schema.brand(\"B\")\n")).toContain("Schema.String.pipe(")
      expect(compile("export const c = succeed(1) |> map((n) => n + 1)\n")).toContain("Effect.succeed(1).pipe(")
      expect(compile("import { Stream as S } from \"effect\"\nexport const d = S.make(1) |> S.take(1)\n"))
        .toContain("S.make(1).pipe(S.take(1))")
    })

    it("keeps `pipe(…)` for what isn't a Pipeable, and for a data-last call", () => {
      expect(compile("export const a = Data.struct({ a: 1 }) |> JSON.stringify\n")).toContain("pipe(Data.struct(")
      expect(compile("export const f = Option.map((n: number) => n) |> String\n")).toContain("pipe(Option.map(")
      expect(compile("const Stream = { make: (n: number) => n }\nexport const g = Stream.make(1) |> String\n"))
        .toContain("pipe(Stream.make(1), String)")
    })

    it("converts `.pipe(…)` on those heads back to `|>`", () => {
      const ts =
        "import { Option, Schema, Stream } from \"effect\"\nexport const a = Stream.make(1, 2).pipe(Stream.map((n) => n * 2), Stream.take(1))\nexport const b = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))\nexport const c = Option.some(1).pipe(Option.getOrElse(() => 0))\n"
      expect(back(ts)).toBe(
        "export const a = Stream.make(1, 2) |> Stream.map((n) => n * 2) |> Stream.take(1)\nexport const b = Schema.String |> Schema.check(Schema.isMinLength(1))\nexport const c = Option.some(1) |> Option.getOrElse(() => 0)\n"
      )
    })
  })

  describe("A2: implementations take their parameter types from their declaration", () => {
    const service = (impl: string) =>
      `service S {\n  effect find(id: string, limit?: number): string\n  effect all(...tags: string[]): number\n  effect named({ name }: { name: string }): string\n  layer test = ${impl}\n}\n`

    it("compiles an untyped implementation exactly as the typed one", () => {
      expect(
        compile(
          service(
            "{ find: effect (id, limit) => id, all: effect (...tags) => tags.length, named: effect (n) => n.name }"
          )
        )
      )
        .toBe(
          compile(
            service(
              "{ find: effect (id: string, limit?: number) => id, all: effect (...tags: string[]) => tags.length, named: effect (n: { name: string }) => n.name }"
            )
          )
        )
    })

    it("types a bare arrow parameter, a default and a method", () => {
      const code = compile(
        service(
          "{ find: effect id => id, all: effect (...tags) => 0, named: effect ({ name } = { name: \"x\" }) => name }"
        )
      )
      expect(code).toContain("function*(id: string)")
      expect(code).toContain("function*({ name }: { name: string } = { name: \"x\" })")
      const method = compile(
        `service S {\n  effect find(id: string): string\n  layer = effect {\n    return { effect find(id) { return id } }\n  }\n}\n`
      )
      expect(method).toContain("Effect.fn(\"S.find\")(function*(id: string)")
    })

    it("keeps a type the implementation writes, and the types of a `default`", () => {
      expect(
        compile(service("{ find: effect (id: unknown) => String(id), all: effect () => 0, named: effect () => \"\" }"))
      )
        .toContain("function*(id: unknown)")
      const greeter = compile(
        `service G {\n  effect greet(name: string): string\n  default = { greet: effect (name) => name }\n}\n`
      )
      expect(greeter).toContain("function*(name: string)")
    })

    it("converts back without the repeated types, and keeps the ones that differ", () => {
      const efx = service(
        "{ find: effect (id) => id, all: effect (...tags) => tags.length, named: effect (n) => n.name }"
      )
      expect(back(compile(efx))).toBe(efx)
      const differs = service(
        "{ find: effect (id: unknown) => String(id), all: effect () => 0, named: effect () => \"\" }"
      )
      expect(back(compile(differs))).toBe(differs)
    })
  })

  describe("A3: `T[]` in schema positions", () => {
    it("writes `T[]`, and `Array<T>` where `T` would need parentheses", () => {
      const efx =
        "schema S {\n  tags: string[]\n  users: User[]\n  roles: Array<\"admin\" | \"member\">\n  nested: string[][]\n}\n\nschema User { id: string }\n"
      expect(back(compile(efx))).toBe(efx)
      expect(compile(efx)).toBe(compile(efx.replace("tags: string[]", "tags: ReadonlyArray<string>")))
    })
  })

  describe("A4: an empty error needs no body", () => {
    it("compiles `error X` and `error X status N` as `{}` did", () => {
      expect(compile("export error Forbidden\n")).toBe(compile("export error Forbidden {}\n"))
      expect(compile("error Gone status 410\n")).toBe(compile("error Gone status 410 {}\n"))
    })

    it("still reads a body on the next line, and converts back without one", () => {
      expect(compile("error Late\n{\n  at: number\n}\n")).toContain("at: Schema.Number")
      expect(back(compile("export error Forbidden\nerror Gone status 410\n"))).toBe(
        "export error Forbidden\nerror Gone status 410\n"
      )
    })
  })

  describe("A5: a service's fields are read-only", () => {
    it("compiles a field as `readonly` whether or not it says so", () => {
      const efx = "service S {\n  size: number\n  effect get(): number\n}\n"
      expect(compile(efx)).toContain("readonly size: number")
      expect(compile(efx)).toBe(compile(efx.replace("  size", "  readonly size")))
      expect(back(compile(efx))).toBe(efx)
    })

    it("leaves a service with a mutable field as TypeScript", () => {
      const ts =
        "import { Context } from \"effect\"\nexport class S extends Context.Service<S, {\n  size: number\n}>()(\"a/S\") {}\n"
      expect(back(ts)).toBe(ts)
    })
  })
})
