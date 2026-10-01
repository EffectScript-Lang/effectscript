import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"

export const fixturesDir = path.join(import.meta.dirname, "..", "fixtures")

export const listFixtures = (): Array<string> =>
  fs.readdirSync(fixturesDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".efx"))
    .map((file) => file.split(path.sep).join("/"))
    .sort()

export const compileFixture = (file: string) => {
  const source = fs.readFileSync(path.join(fixturesDir, file), "utf8")
  const result = toTypeScript(source, { filename: file, packageName: "fixtures" })
  const outFile = file.replace(/\.efx$/, result.mode === "tsx" ? ".tsx" : ".ts")
  return { source, result, outFile }
}
