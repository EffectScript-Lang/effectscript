import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-docs-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  return dir
}
const run = (dir: string, ...args: Array<string>) =>
  spawnSync(process.execPath, [efx, "docs", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const money = "/** Whole cents. */\nexport schema Money = Int & Brand<\"Money\">\n"
const pay =
  "import { Money } from \"./money.efx\"\n/**\n * Pays.\n *\n * @returns The new balance.\n */\nexport effect pay(amount: Money): Money {\n  return amount\n}\n"

describe("efx docs (Plan 12 Task 6)", () => {
  it("writes one page per module and an index, replacing old output", () => {
    const dir = project({
      "src/money.efx": money,
      "src/pay.efx": pay,
      "src/pay.test.efx": "doctest \"./pay.efx\"\n",
      "docs/api/stale.md": "old"
    })
    const result = run(dir)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(fs.readdirSync(path.join(dir, "docs/api")).sort()).toEqual(["index.md", "money.md", "pay.md"])
    expect(fs.readFileSync(path.join(dir, "docs/api/pay.md"), "utf8")).toContain(
      "[`Money`](./money.md#money): Whole cents."
    )
    expect(result.stdout).toContain("Wrote 3 pages to docs/api")
  })

  it("--check writes nothing and fails on example errors", () => {
    const dir = project({
      "src/a.efx": "/**\n * A.\n *\n * ```efx\n * a() // =>\n * ```\n */\nexport const a = () => 1\n"
    })
    const result = run(dir, "--check")
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("EFX9302")
    expect(result.stderr).toContain("src/a.efx:5")
    expect(fs.existsSync(path.join(dir, "docs/api"))).toBe(false)
  })

  it("--strict warns about tags that repeat the signature (EFX9306)", () => {
    const dir = project({ "src/money.efx": money, "src/pay.efx": pay })
    expect(run(dir, "--check").status).toBe(0)
    const strict = run(dir, "--check", "--strict")
    expect(strict.status).toBe(1)
    expect(strict.stderr).toContain("EFX9306")
  })

  it("honors --out and explicit paths, and tolerates no exports", () => {
    const dir = project({ "lib/x.ts": "/** X. */\nexport const x: number = 1\n", "lib/empty.ts": "const y = 1\n" })
    expect(run(dir, "lib", "--out", "site/ref").status).toBe(0)
    expect(fs.readdirSync(path.join(dir, "site/ref")).sort()).toEqual(["index.md", "lib"])
    expect(fs.existsSync(path.join(dir, "site/ref/lib/empty.md"))).toBe(false)
  })
})
