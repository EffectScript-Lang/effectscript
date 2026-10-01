import { type CompileOptions, toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs/promises"
import * as path from "node:path"

const dir = path.join(import.meta.dirname, "..", ".runtime")
let counter = 0

/** Compiles EffectScript and imports the result through vitest's TS pipeline. */
export const runCompiled = async (source: string, options: CompileOptions = {}): Promise<any> => {
  const result = toTypeScript(source, options)
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  if (errors.length > 0) throw new Error(errors.map((d) => `${d.code} ${d.message}`).join("\n"))
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `case-${process.pid}-${counter++}.${result.mode}`)
  await fs.writeFile(file, result.code)
  return import(/* @vite-ignore */ file)
}
