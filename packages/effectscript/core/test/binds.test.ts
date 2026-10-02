import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

/** The source text of each bind. */
const binds = (source: string, recover = false) =>
  toTypeScript(source, { recover }).binds.map((b) => [source.slice(b.start, b.end), b.start] as const)

describe("CompileResult.binds (Plan 11 Task 1, ADR-0039)", () => {
  it("marks each await that became yield*, at its keyword", () => {
    const source = "effect a() {\n  const x = await b()\n  const [p, q] = await [c(), d()]\n  return await e(x)\n}\n"
    expect(binds(source)).toEqual([
      ["await", source.indexOf("await b")],
      ["await", source.indexOf("await [")],
      ["await", source.indexOf("await e")]
    ])
  })

  it("marks nested and parenthesized binds, and `using … await`", () => {
    const source = "effect a() {\n  using r = await open()\n  return (await f()) + (await g(await h()))\n}\n"
    expect(binds(source).map(([, at]) => source.slice(at, at + 11))).toEqual([
      "await open(",
      "await f()) ",
      "await g(awa",
      "await h()))"
    ])
  })

  it("leaves async functions and top-level await alone", () => {
    const source =
      "async function f() { await fetch(\"x\") }\nconst y = await Promise.resolve(1)\neffect g() {\n  const h = async () => await f()\n  return await z()\n}\n"
    expect(binds(source)).toEqual([["await", source.indexOf("await z")]])
  })

  it("is empty for a file without effect code", () => {
    expect(toTypeScript("export const a = 1\n").binds).toEqual([])
  })

  it("keeps binds outside the neutralized lines of recovered code", () => {
    const source = "effect a() {\n  const x = await b()\n  const y = x.\n}\n"
    const result = toTypeScript(source, { recover: true })
    expect(result.recovered).toBe(true)
    expect(binds(source, true)).toEqual([["await", source.indexOf("await b")]])
  })
})
