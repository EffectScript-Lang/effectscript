import { type CompileOptions, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

export const ts = (source: string, options: CompileOptions = {}): string => {
  const result = toTypeScript(source, options)
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  if (errors.length > 0) throw new Error(errors.map((d) => `${d.code} ${d.message}`).join("\n"))
  return result.code
}

describe("effect expressions", () => {
  it("compiles single-parameter effect arrows", () => {
    expect(ts("const single = effect n => n * 2\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst single = Effect.fnUntraced(function*(n) { return n * 2 })\n"
      )
  })

  it("keeps the value of a body on the next line (ASI after return)", () => {
    expect(ts("const f = effect (n: number) =>\n  await succeed(n)\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst f = Effect.fnUntraced(function*(n: number) { return (\n  yield* Effect.succeed(n)) })\n"
      )
    expect(ts("const g = effect () => // a comment\n  1\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst g = Effect.fnUntraced(function*() { return ( // a comment\n  1) })\n"
      )
    for (const lineBreak of ["\r\n", "\r", "\u2028", "\u2029"]) {
      expect(ts(`const k = effect () =>${lineBreak}  1\n`), JSON.stringify(lineBreak)).toContain(
        `{ return (${lineBreak}  1) }`
      )
    }
    expect(ts("const h = effect () =>\n  ({ a: 1 })\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst h = Effect.fnUntraced(function*() { return (\n  ({ a: 1 })) })\n"
      )
  })

  it("compiles parenthesized object bodies", () => {
    expect(ts("const f = effect () => ({ a: 1 })\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst f = Effect.fnUntraced(function*() { return ({ a: 1 }) })\n"
      )
  })

  it("uses fnUntraced for computed effect methods", () => {
    expect(ts("const k = \"x\"\nconst o = { effect [k](n: number) { return n } }\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst k = \"x\"\nconst o = { [k]: Effect.fnUntraced(function*(n: number) { return n }) }\n"
      )
  })

  it("effect arrows inside plain functions are still effects", () => {
    expect(ts("function plain() {\n  return effect (n: number) => n\n}\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nfunction plain() {\n  return Effect.fnUntraced(function*(n: number) { return n })\n}\n"
      )
  })

  it("nests effect arrows inside effect declarations", () => {
    expect(ts("effect outer() {\n  const inner = effect (n: number) => n\n  return yield_(inner)\n}\n"))
      .toBe(
        "import * as Effect from \"effect/Effect\"\nconst outer = Effect.fn(\"outer\")(function*() {\n  const inner = Effect.fnUntraced(function*(n: number) { return n })\n  return yield_(inner)\n})\n"
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
      "import * as Effect from \"effect/Effect\"\nexport const api = { retry: Effect.retry }\n"
    )
  })

  it("imports a module referenced only in types", () => {
    expect(ts("export declare const x: Stream.Stream<number>\n"))
      .toBe("import * as Stream from \"effect/Stream\"\nexport declare const x: Stream.Stream<number>\n")
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

describe("main", () => {
  it("targets the configured runtime", () => {
    expect(ts("main { await sleep(1) }\n", { runtime: "bun" })).toBe(
      "import { BunRuntime, BunServices } from \"@effect/platform-bun\"\nimport * as Effect from \"effect/Effect\"\n" +
        "BunRuntime.runMain(Effect.gen(function*() { yield* Effect.sleep(1) }).pipe(Effect.provide(BunServices.layer)))\n"
    )
    expect(ts("main { await sleep(1) }\n", { runtime: "browser" })).toBe(
      "import { BrowserRuntime } from \"@effect/platform-browser\"\nimport * as Effect from \"effect/Effect\"\n" +
        "BrowserRuntime.runMain(Effect.gen(function*() { yield* Effect.sleep(1) }))\n"
    )
  })

  it("scopes main when it uses defer", () => {
    expect(ts("main {\n  defer log(\"bye\")\n}\n", { runtime: "browser" })).toContain(
      "}).pipe(Effect.scoped))"
    )
  })
})

describe("import extensions", () => {
  it("rewrites relative .efx specifiers when asked", () => {
    const source =
      "import { a } from \"./a.efx\"\nexport * from \"../b.efx\"\nconst c = import(\"./c.efx\")\nimport \"pkg/d.efx\"\n"
    expect(ts(source, { rewriteImportExtensions: "ts" })).toBe(
      "import { a } from \"./a.ts\"\nexport * from \"../b.ts\"\nconst c = import(\"./c.ts\")\nimport \"pkg/d.efx\"\n"
    )
    expect(ts(source)).toBe(source)
  })
})
