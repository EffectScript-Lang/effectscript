// @vitest-environment happy-dom
import { markFacts } from "effectscript/blume-facts"
import { describe, expect, it } from "vitest"

const facts = (head: string, rows: string) => `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
const row = (label: string) => `<tr><td><strong>${label}</strong></td><td><code>X</code></td></tr>`
const marks = () => [...document.querySelectorAll("tr[data-efx-fact]")].map((r) => (r as HTMLElement).dataset.efxFact)

describe("markFacts (spec §4.4)", () => {
  it("marks Returns, Fails with and Needs in an efx docs facts table", () => {
    document.body.innerHTML = facts("<th></th><th></th>", row("id") + row("Returns") + row("Fails with") + row("Needs"))
    expect(markFacts(document)).toBe(3)
    expect(marks()).toEqual(["a", "e", "r"])
  })

  it("leaves a table with a real header alone, even with a Returns row", () => {
    document.body.innerHTML = facts("<th>Name</th><th>Value</th>", row("Returns"))
    expect(markFacts(document)).toBe(0)
  })

  it("needs the label to be the whole first cell, in bold", () => {
    document.body.innerHTML = facts(
      "<th></th><th></th>",
      "<tr><td>Returns</td><td>x</td></tr><tr><td><strong>Returns</strong> early</td><td>x</td></tr>"
    )
    expect(markFacts(document)).toBe(0)
  })

  it("is idempotent, for Blume's client-side navigation", () => {
    document.body.innerHTML = facts("<th></th><th></th>", row("Returns"))
    markFacts(document)
    expect(markFacts(document)).toBe(1)
    expect(marks()).toEqual(["a"])
  })

  it("also accepts a table whose empty header row Blume dropped", () => {
    document.body.innerHTML = `<table><tbody>${row("Needs")}</tbody></table>`
    expect(markFacts(document)).toBe(1)
  })
})
