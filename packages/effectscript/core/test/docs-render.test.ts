import { docModule, modulePath } from "effectscript/docs/model"
import { pageFile, renderIndex, renderModule, slug } from "effectscript/docs/render"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const dir = path.join(import.meta.dirname, "docs/fixtures")
const files = ["bank/index.efx", "bank/accounts.efx", "bank/ledger.efx", "bank/transfer.efx"]
const site = {
  modules: files.map((f) =>
    docModule(path.join(dir, f), modulePath(`src/${f}`), fs.readFileSync(path.join(dir, f), "utf8")).module
  )
}

describe("render", () => {
  it("slugs like GitHub", () => {
    expect(slug("Users.find")).toBe("usersfind")
    expect(slug("$weird_Name")).toBe("weird_name")
    expect(slug("a b")).toBe("a-b")
  })

  it("names page files after module paths", () => {
    expect(site.modules.map(pageFile)).toEqual(["bank.md", "bank/accounts.md", "bank/ledger.md", "bank/transfer.md"])
  })

  for (const module of site.modules) {
    it(`renders ${module.path}`, async () => {
      await expect(renderModule(site, module)).toMatchFileSnapshot(path.join(dir, "__out__", pageFile(module)))
    })
  }

  it("renders the index", async () => {
    await expect(renderIndex(site, "API")).toMatchFileSnapshot(path.join(dir, "__out__", "index.md"))
  })

  it("links each row to the right page and quotes the definition's summary", () => {
    const page = renderModule(site, site.modules.find((m) => m.path === "bank/transfer")!)
    expect(page).toContain("| **amount** | [`Money`](./accounts.md#money): An amount of money in whole cents. |")
    expect(page).toContain("| **Returns** | [`Receipt`](#receipt): Proof that a transfer happened. |")
    expect(page).toContain(
      "| **Fails with** | [`InsufficientFunds`](./accounts.md#insufficientfunds): An account has less money than the transfer needs.<br>[`AccountNotFound`](./accounts.md#accountnotfound): No account has this id. |"
    )
    expect(page).toContain("| **Needs** | [`Ledger`](./ledger.md#ledger): The store of balances. |")
  })
})
