/**
 * `efx-tsc`: real `tsc` (TypeScript 6) with `.efx` support and diagnostics mapped back to `.efx`
 * positions (ADR-0019). Arguments are tsc's own (`-p tsconfig.json`, `--noEmit`, …). EffectScript
 * compiler errors are reported in tsc's format and count towards the exit code (review I1).
 *
 * @since 4.0.0
 */
import { runTsc } from "@volar/typescript/lib/quickstart/runTsc.js"
import { type Diagnostic, lineColumn } from "effectscript/compiler"
import { createRequire } from "node:module"
import * as path from "node:path"
import { createLanguagePlugin } from "./languagePlugin.ts"

/**
 * Runs tsc with the EffectScript language plugin. Exits the process with tsc's exit code, or 2
 * when only EffectScript compiler errors were found.
 *
 * @since 4.0.0
 * @category cli
 */
export const runEfxTsc = (): void => {
  const require = createRequire(import.meta.url)
  const errors = new Map<string, { readonly source: string; readonly diagnostics: ReadonlyArray<Diagnostic> }>()
  const exit = process.exit.bind(process)
  process.exit = ((code?: number) => {
    let found = false
    for (const [fileName, { diagnostics, source }] of errors) {
      for (const d of diagnostics) {
        if (d.severity !== "error") continue
        found = true
        const { column, line } = lineColumn(source, d.start)
        process.stdout.write(
          `${path.relative(process.cwd(), fileName)}(${line},${column + 1}): error ${d.code}: ${d.message}\n`
        )
      }
    }
    return exit(found && (code ?? 0) === 0 ? 2 : code)
  }) as typeof process.exit
  runTsc(
    require.resolve("typescript/lib/tsc"),
    { extraSupportedExtensions: [".efx"], extraExtensionsToRemove: [] },
    (ts) => [
      createLanguagePlugin(ts, {
        onCompile: (fileName, source, diagnostics) => errors.set(fileName, { source, diagnostics })
      })
    ]
  )
}
