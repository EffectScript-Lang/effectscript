import { type CompileOptions, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

export const ts = (source: string, options: CompileOptions = {}): string => {
  const result = toTypeScript(source, options)
  if (result.diagnostics.length > 0) throw new Error(result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n"))
  return result.code
}

describe("effect expressions", () => {
  it("compiles single-parameter effect arrows", () => {
    expect(ts("const single = effect n => n * 2\n"))
      .toBe("import { Effect } from \"effect\"\nconst single = Effect.fnUntraced(function*(n) { return n * 2 })\n")
  })

  it("compiles parenthesized object bodies", () => {
    expect(ts("const f = effect () => ({ a: 1 })\n"))
      .toBe("import { Effect } from \"effect\"\nconst f = Effect.fnUntraced(function*() { return ({ a: 1 }) })\n")
  })

  it("uses fnUntraced for computed effect methods", () => {
    expect(ts("const k = \"x\"\nconst o = { effect [k](n: number) { return n } }\n"))
      .toBe(
        "import { Effect } from \"effect\"\nconst k = \"x\"\nconst o = { [k]: Effect.fnUntraced(function*(n: number) { return n }) }\n"
      )
  })

  it("effect arrows inside plain functions are still effects", () => {
    expect(ts("function plain() {\n  return effect (n: number) => n\n}\n"))
      .toBe(
        "import { Effect } from \"effect\"\nfunction plain() {\n  return Effect.fnUntraced(function*(n: number) { return n })\n}\n"
      )
  })

  it("nests effect arrows inside effect declarations", () => {
    expect(ts("effect outer() {\n  const inner = effect (n: number) => n\n  return yield_(inner)\n}\n"))
      .toBe(
        "import { Effect } from \"effect\"\nconst outer = Effect.fn(\"outer\")(function*() {\n  const inner = Effect.fnUntraced(function*(n: number) { return n })\n  return yield_(inner)\n})\n"
      )
  })
})

describe("prelude", () => {
  it("adds no imports when nothing from the prelude is used", () => {
    const source = "export const a = [1].map((n) => n)\nexport const r = fetch(\"/\")\nexport const s = String(1)\n"
    expect(ts(source)).toBe(source)
  })

  it("respects the no-prelude directive", () => {
    const source = "// @efx no-prelude\nexport const a = succeed(1)\n"
    expect(ts(source)).toBe(source)
  })

  it("keeps shadowed names", () => {
    const source = "const succeed = (n: number) => n\nexport const a = succeed(1)\n"
    expect(ts(source)).toBe(source)
  })

  it("expands shorthand builtins", () => {
    expect(ts("export const api = { retry }\n")).toBe(
      "import { Effect } from \"effect\"\nexport const api = { retry: Effect.retry }\n"
    )
  })

  it("imports a module referenced only in types", () => {
    expect(ts("export declare const x: Stream.Stream<number>\n"))
      .toBe("import { Stream } from \"effect\"\nexport declare const x: Stream.Stream<number>\n")
  })
})

describe("service keys", () => {
  it("derives keys from package and path, and honors `as`", () => {
    const opts = { packageName: "acme", filename: "src/db/Database.efx" }
    expect(ts("service Database {\n  effect ping(): void\n}\n", opts)).toContain("()(\"acme/db/Database\")")
    expect(ts("service Database as \"custom/Db\" {\n  effect ping(): void\n}\n", opts)).toContain("()(\"custom/Db\")")
    expect(ts("service Database {\n  effect ping(): void\n}\n")).toContain("()(\"Database\")")
  })
})
