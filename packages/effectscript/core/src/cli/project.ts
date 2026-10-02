/**
 * The engines behind `efx build` and the CLI version: plain functions the `.efx` command modules
 * call (ADR-0032).
 *
 * @since 4.0.0
 */
import { readFileSync } from "node:fs"
import * as path from "node:path"
import { formatDiagnostic, lineColumn, toEffectScript, toTypeScript } from "../compiler/index.ts"
import { packageInfo } from "../project.ts"
import { loadTypeScript } from "./typescript.ts"

/**
 * The `effectscript` package version.
 *
 * @since 4.0.0
 * @category cli
 */
export const version: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version

/**
 * `efx build`: loads TypeScript 6 lazily (everything else works without it, review I7) and builds
 * the project. Returns the exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const buildProject = async (project: string): Promise<number> => {
  const ts = await loadTypeScript(process.cwd())
  if (typeof ts === "string") {
    process.stderr.write(`${ts}\n`)
    return 1
  }
  const { build } = await import("./build.ts")
  const result = build(ts, { project })
  for (const error of result.errors) process.stderr.write(`${error}\n\n`)
  return result.ok ? 0 : 1
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Printed {
  readonly output: string
  /** Diagnostics or conversion notes, formatted for stderr. */
  readonly messages: ReadonlyArray<string>
  readonly ok: boolean
}

/**
 * `efx print`: one file converted to TypeScript (`.efx` by default) or EffectScript.
 *
 * @since 4.0.0
 * @category cli
 */
export const printFile = (file: string, to: "ts" | "efx" | undefined): Printed => {
  let source: string
  try {
    source = readFileSync(file, "utf8")
  } catch {
    return { output: "", messages: [`efx print: can't read ${file}`], ok: false }
  }
  const filename = path.relative(process.cwd(), file)
  const options = { filename, ...packageInfo(file) }
  if ((to ?? (file.endsWith(".efx") ? "ts" : "efx")) === "ts") {
    const result = toTypeScript(source, options)
    const errors = result.diagnostics.filter((d) => d.severity === "error")
    return {
      output: errors.length > 0 ? "" : result.code,
      messages: result.diagnostics.map((d) => formatDiagnostic(source, filename, d)),
      ok: errors.length === 0
    }
  }
  const result = toEffectScript(source, options)
  return {
    output: result.code,
    messages: result.notes.map((note) => {
      const { column, line } = lineColumn(source, note.start)
      return `${filename}:${line}:${column}: ${note.message}`
    }),
    ok: true
  }
}
