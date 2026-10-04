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
  for (const line of highlighter.codeToTokensBase(code, { lang: "efx", theme: "dark-plus", includeExplanation: true })) {
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
