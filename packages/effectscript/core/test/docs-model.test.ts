import { allExamples, docModule, modulePath } from "effectscript/docs/model"
import { describe, expect, it } from "vitest"

const source = `/**
 * Bank.
 *
 * @module
 */
import { Ledger } from "./ledger.efx"
import { Effect } from "effect"

/** Whole cents. */
export schema Money = Int & Brand<"Money">

/** An account. */
export schema Account {
  /** Its id. */
  id: string
  cents = Int.check(isGreaterThan(0))
}

export schema Shape =
  | Circle { r: number }
  | Square { s: number }

/** Not enough money. */
export error InsufficientFunds { needed: Money }

/** The users. */
export service Users {
  /** Finds one. */
  effect find(id: string): Account throws InsufficientFunds
  readonly size: number
  layer = { size: 1, find: effect (id) => new Account({ id, cents: 1 }) }
}

/**
 * Moves money.
 *
 * \`\`\`efx
 * await transfer(Money.make(1)) // => 1
 * \`\`\`
 */
export effect transfer(amount: Money, note?: string): number throws InsufficientFunds | NotFound needs Ledger | Users {
  return 1
}

export const double = effect (x: number): number => x * 2
export layer AppLive = Users.layer
export function plain(x: number): string { return "" }
export type T = string
export interface I { a: number }
export class C {}
export const k = 1
const hidden = 2
const shown = 3
export { shown }
export * from "./other.efx"
export { again } from "./again.efx"
export default effect run(): void {}
`

describe("docModule", () => {
  const { module, diagnostics } = docModule("/p/src/bank.efx", "bank", source)
  const byName = (name: string) => module.declarations.find((d) => d.name === name)!

  it("reads the module doc and exports in source order", () => {
    expect(diagnostics).toEqual([])
    expect(module.doc?.summary).toBe("Bank.")
    expect(module.declarations.map((d) => [d.kind, d.name])).toEqual([
      ["schema", "Money"],
      ["schema", "Account"],
      ["schema", "Shape"],
      ["error", "InsufficientFunds"],
      ["service", "Users"],
      ["effect", "transfer"],
      ["effect", "double"],
      ["layer", "AppLive"],
      ["function", "plain"],
      ["type", "T"],
      ["interface", "I"],
      ["class", "C"],
      ["const", "k"],
      ["const", "shown"],
      ["effect", "default"]
    ])
  })

  it("keeps signatures as written, without bodies", () => {
    expect(byName("Money").signature).toBe("schema Money = Int & Brand<\"Money\">")
    expect(byName("transfer").signature).toBe(
      "effect transfer(amount: Money, note?: string): number throws InsufficientFunds | NotFound needs Ledger | Users"
    )
    expect(byName("double").signature).toBe("const double = effect (x: number): number")
    expect(byName("plain").signature).toBe("function plain(x: number): string")
    expect(byName("AppLive").signature).toBe("layer AppLive = Users.layer")
    expect(byName("Account").signature).toBe("schema Account")
  })

  it("splits A / E / R and params", () => {
    const t = byName("transfer")
    expect([t.success, t.failure, t.requirements]).toEqual(["number", "InsufficientFunds | NotFound", "Ledger | Users"])
    expect(t.params).toEqual([{ name: "amount", type: "Money" }, { name: "note", type: "string" }])
    expect(byName("plain").success).toBe("string")
    expect(byName("plain").failure).toBeUndefined()
  })

  it("collects members with their docs", () => {
    expect(byName("Account").members.map((m) => [m.kind, m.name, m.signature, m.doc?.summary])).toEqual([
      ["field", "id", "id: string", "Its id."],
      ["field", "cents", "cents = Int.check(isGreaterThan(0))", undefined]
    ])
    expect(byName("Shape").members.map((m) => [m.kind, m.name])).toEqual([["variant", "Circle"], ["variant", "Square"]])
    const users = byName("Users").members
    expect(users.map((m) => [m.kind, m.name])).toEqual([["member", "find"], ["field", "size"], ["layer", "layer"]])
    expect(users[0]!.signature).toBe("effect find(id: string): Account throws InsufficientFunds")
    expect(users[0]!.failure).toBe("InsufficientFunds")
    expect(users[0]!.doc?.summary).toBe("Finds one.")
  })

  it("records relative imports and examples", () => {
    expect(module.imports.get("Ledger")).toEqual({ from: "./ledger.efx", imported: "Ledger" })
    expect(module.imports.has("Effect")).toBe(false)
    expect(allExamples(module).map((e) => [e.owner, e.example.code])).toEqual([
      ["transfer", "await transfer(Money.make(1)) // => 1"]
    ])
    expect(module.hasMain).toBe(false)
  })

  it("detects main and reports parse failures", () => {
    expect(docModule("m.efx", "m", "main {\n  await log(1)\n}\n").module.hasMain).toBe(true)
    const broken = docModule("b.efx", "b", "export const = 1")
    expect(broken.diagnostics.map((d) => d.code)).toEqual(["EFX1001"])
    expect(broken.module.declarations).toEqual([])
  })
})

describe("modulePath", () => {
  it("drops src/, the extension and index", () => {
    expect(modulePath("src/bank/transfer.efx")).toBe("bank/transfer")
    expect(modulePath("src/users/index.efx")).toBe("users")
    expect(modulePath("src/index.ts")).toBe("")
    expect(modulePath("lib/a.ts")).toBe("lib/a")
    expect(modulePath("src\\win\\b.efx")).toBe("win/b")
  })
})
