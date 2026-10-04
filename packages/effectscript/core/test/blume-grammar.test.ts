import * as fs from "node:fs"
import * as path from "node:path"
import { createHighlighter } from "shiki"
import { describe, expect, it } from "vitest"

const grammars = path.join(import.meta.dirname, "../grammars")
const grammar = (f: string) => JSON.parse(fs.readFileSync(path.join(grammars, f), "utf8"))

/** Each token's text, mapped to its full scope stack. */
const scopesOf = async (code: string) => {
  const highlighter = await createHighlighter({
    themes: ["dark-plus"],
    langs: [
      "tsx",
      { ...grammar("effectscript.injection.tmLanguage.json"), name: "efx-injection", injectTo: ["source.efx"] },
      { ...grammar("effectscript.tmLanguage.json"), name: "efx", embeddedLangs: ["tsx"] }
    ]
  })
  const out = new Map<string, string>()
  for (
    const line of highlighter.codeToTokensBase(code, {
      lang: "efx" as "tsx",
      theme: "dark-plus",
      includeExplanation: true
    })
  ) {
    for (const token of line) {
      for (const part of token.explanation ?? []) {
        out.set(part.content.trim(), part.scopes.map((s) => s.scopeName).join(" "))
      }
    }
  }
  return out
}

describe("efx signature scopes (ADR-0081)", () => {
  it("scopes the return type, each thrown error and each needed service", async () => {
    const s = await scopesOf(
      "export effect loadUser(id: string): User throws UserNotFound | Timeout needs Database {\n}"
    )
    expect(s.get("User")).toContain("meta.return-type.efx")
    expect(s.get("UserNotFound")).toContain("meta.throws-clause.efx")
    expect(s.get("Timeout")).toContain("meta.throws-clause.efx")
    expect(s.get("Database")).toContain("meta.needs-clause.efx")
    expect(s.get("throws")).toContain("keyword.other.throws.efx")
    expect(s.get("needs")).toContain("keyword.other.throws.efx")
  })

  it("scopes service members and generic return types", async () => {
    const s = await scopesOf("service Users {\n  effect all(): ReadonlyArray<User> throws DbError\n}")
    expect(s.get("ReadonlyArray<User>") ?? s.get("ReadonlyArray")).toContain("meta.return-type.efx")
    expect(s.get("DbError")).toContain("meta.throws-clause.efx")
  })

  it("leaves parameter types and ordinary code alone", async () => {
    const s = await scopesOf("export effect f(id: UserId): User {\n  const x = a ? b : c\n}")
    expect(s.get("UserId") ?? "").not.toContain("meta.return-type.efx")
    expect(s.get("c") ?? "").not.toContain("meta.return-type.efx")
    expect(s.get("User")).toContain("meta.return-type.efx")
  })
})

describe("efx is scopes (ADR-0087)", () => {
  it("scopes is, not and or as operators and each tag as a type", async () => {
    const s = await scopesOf("const ok = error is not (RateLimited or Cause.TimeoutError)")
    expect(s.get("is")).toContain("keyword.operator.expression.is.efx")
    expect(s.get("not")).toContain("keyword.operator.expression.is.efx")
    expect(s.get("or")).toContain("keyword.operator.expression.is.efx")
    expect(s.get("RateLimited")).toContain("entity.name.type.efx")
    expect(s.get("Cause.TimeoutError")).toContain("entity.name.type.efx")
    const p = await scopesOf("retry({ times: 2, while: is TimeoutError })")
    expect(p.get("is")).toContain("keyword.operator.expression.is.efx")
    expect(p.get("TimeoutError")).toContain("entity.name.type.efx")
  })

  it.each(["const same = Object.is(a, b)", "const is = 1", "const g = is as Guard", "for (is of list) {}"])(
    "leaves is alone in %s",
    async (code) => {
      expect((await scopesOf(code)).get("is") ?? "").not.toContain("keyword.operator.expression.is.efx")
    }
  )
})

describe("efx brand and where scopes (ADR-0077)", () => {
  it("scopes `brand` as a declaration and `where` as a keyword", async () => {
    const s = await scopesOf(
      "export brand Port = Int where isBetween({ minimum: 1, maximum: 65535 })\nschema S {\n  name: string where isNonEmpty\n}"
    )
    expect(s.get("brand")).toContain("storage.type.efx")
    expect(s.get("where")).toContain("keyword.other.where.efx")
  })

  it("leaves a variable named `where` alone", async () => {
    const s = await scopesOf("const where = 1\nconsole.log(where)\nexport const f = (where: number) => where")
    expect(s.get("where") ?? "").not.toContain("keyword.other.where.efx")
  })
})
