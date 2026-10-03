import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const repo = path.join(import.meta.dirname, "../../../..")

describe(".gitattributes (Plan 20 Task 4)", () => {
  it("marks EffectScript's generated files as generated, and each entry matches a tracked file", () => {
    const lines = fs.readFileSync(path.join(repo, ".gitattributes"), "utf8").split("\n")
      .filter((line) => line.startsWith("packages/effectscript/") && line.includes("linguist-generated"))
    expect(lines.length).toBeGreaterThan(5)
    for (const line of lines) {
      const pattern = line.split(" ")[0]!
      const tracked = spawnSync("git", ["ls-files", "--", `:(glob)${pattern}`], { cwd: repo, encoding: "utf8" }).stdout
      expect(tracked.trim(), pattern).not.toBe("")
    }
    const checked = spawnSync(
      "git",
      [
        "check-attr",
        "linguist-generated",
        "--",
        "packages/effectscript/effect-docs/content/LLMS.efx.md",
        "packages/effectscript/core/src/cli/main.efx"
      ],
      { cwd: repo, encoding: "utf8" }
    ).stdout
    expect(checked).toContain("LLMS.efx.md: linguist-generated: true")
    // the source of the compiled CLI is not generated
    expect(checked).toContain("main.efx: linguist-generated: unspecified")
  })
})
