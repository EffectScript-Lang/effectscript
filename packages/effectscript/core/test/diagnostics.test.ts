import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const codes = (source: string) => toTypeScript(source).diagnostics.map((d) => d.code)

describe("effect diagnostics", () => {
  it("EFX2001: effect arrows cannot use this", () => {
    expect(codes("class A { x = 1; f = effect () => this.x }\n")).toEqual(["EFX2001"])
  })

  it("EFX2002: effect class methods are not supported yet", () => {
    expect(codes("class A {\n  effect m() { return 1 }\n}\n")).toEqual(["EFX2002"])
  })

  it("EFX2003: unused effect block statement", () => {
    expect(codes("effect {\n  1\n}\n")).toEqual(["EFX2003"])
  })

  it("EFX2005: effect declaration without body", () => {
    expect(codes("effect f(): void\n")).toEqual(["EFX2005"])
  })
})

describe("try diagnostics", () => {
  it("EFX2020: mixed returns", () => {
    expect(
      codes(
        "effect f(x: Effect.Effect<number>) {\n  try {\n    if (Math.random()) return await x\n    await x\n  } catch {\n    return 0\n  }\n  return 1\n}\n"
      )
    )
      .toEqual(["EFX2020"])
  })

  it("EFX2021: break crossing the try boundary", () => {
    expect(
      codes(
        "effect f(x: Effect.Effect<number>) {\n  for (;;) {\n    try {\n      await x\n      break\n    } catch {}\n  }\n}\n"
      )
    )
      .toEqual(["EFX2021"])
  })

  it("EFX2022: typed catch on a plain try inside effect", () => {
    expect(codes("effect f() {\n  try {\n    JSON.parse(\"1\")\n  } catch (e: SyntaxError) {}\n}\n")).toEqual([
      "EFX2022"
    ])
  })

  it("EFX2023: untyped catch must be last", () => {
    expect(codes("effect f(x: Effect.Effect<number>) {\n  try {\n    await x\n  } catch (e) {} catch (e: A) {}\n}\n"))
      .toEqual(["EFX2023"])
  })

  it("EFX2024: multiple catch outside effect", () => {
    expect(codes("try {} catch (a) {} catch (b) {}\n")).toEqual(["EFX2024"])
  })
})

describe("resource diagnostics", () => {
  it("EFX2010: break inside for await", () => {
    expect(codes("effect f(s: Stream.Stream<number>) {\n  for await (const n of s) {\n    break\n  }\n}\n")).toEqual([
      "EFX2010"
    ])
  })

  it("EFX2011: defer outside effect", () => {
    expect(codes("function f() {\n  defer close()\n}\n")).toEqual(["EFX2011"])
  })

  it("EFX2012: for await without a declaration", () => {
    expect(codes("effect f(s: Stream.Stream<number>) {\n  let n = 0\n  for await (n of s) {}\n}\n")).toEqual([
      "EFX2012"
    ])
  })
})
