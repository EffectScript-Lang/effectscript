/**
 * `efx-tsc`: real `tsc` (TypeScript 6) with `.efx` support and diagnostics mapped back to `.efx`
 * positions (ADR-0019). Arguments are tsc's own (`-p tsconfig.json`, `--noEmit`, …).
 *
 * @since 4.0.0
 */
import { runTsc } from "@volar/typescript/lib/quickstart/runTsc.js"
import { createRequire } from "node:module"
import { createLanguagePlugin } from "./languagePlugin.ts"

/**
 * Runs tsc with the EffectScript language plugin. Exits the process with tsc's exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const runEfxTsc = (): void => {
  const require = createRequire(import.meta.url)
  runTsc(
    require.resolve("typescript/lib/tsc"),
    { extraSupportedExtensions: [".efx"], extraExtensionsToRemove: [] },
    (ts) => [createLanguagePlugin(ts)]
  )
}
