import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

describe("error status (ADR-0064)", () => {
  it("refuses a status that isn't an HTTP status code", () => {
    for (const code of ["99", "600", "404.5", "\"404\""]) {
      const result = toTypeScript(`error A status ${code} {}`)
      expect(result.diagnostics.map((d) => d.message)).toEqual([
        "An error's status is an HTTP status code, from 100 to 599"
      ])
    }
  })

  it("keeps status a name elsewhere: a schema field, a class field, a variable", () => {
    const source = "schema A { status: number }\nclass B { status = 1 }\nconst status = 2\nlet s = status\n"
    expect(toTypeScript(source).diagnostics).toEqual([])
  })

  it("converts a hand-written annotation back only when it is the status alone", () => {
    const ts = (annotations: string) =>
      `import * as Schema from "effect/Schema"\nclass A extends Schema.TaggedError<A>()("A", {}, ${annotations}) {}\n`
    expect(toEffectScript(ts("{ httpApiStatus: 404 }"), { filename: "a.ts" }).code).toBe("error A status 404 {}\n")
    expect(toEffectScript(ts("{ httpApiStatus: 404, title: \"x\" }"), { filename: "a.ts" }).code).toContain(
      "Schema.TaggedError"
    )
  })
})
