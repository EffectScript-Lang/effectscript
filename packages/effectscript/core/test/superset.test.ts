import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const root = path.resolve(import.meta.dirname, "../../../..")
const sources = ["packages/effect/src", "packages/platform/node/src", "packages/vitest/src", "packages/atom/react/src"]

describe("superset", () => {
  it("compiles real TypeScript to itself byte-for-byte", () => {
    const failures: Array<string> = []
    let count = 0
    for (const dir of sources) {
      const absolute = path.join(root, dir)
      for (const file of fs.readdirSync(absolute, { recursive: true, encoding: "utf8" })) {
        if (!/\.tsx?$/.test(file)) continue
        count++
        const source = fs.readFileSync(path.join(absolute, file), "utf8")
        const result = toTypeScript(source, { filename: file })
        if (result.diagnostics.length > 0) failures.push(`${dir}/${file}: ${result.diagnostics[0]!.message}`)
        else if (result.code !== source) failures.push(`${dir}/${file}: output differs`)
      }
    }
    expect(count).toBeGreaterThan(500)
    expect(failures).toEqual([])
  }, 120_000)
})
