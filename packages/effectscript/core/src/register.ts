/**
 * `node --import effectscript/register app.ts`: runs `.efx` modules on Node (ADR-0021).
 *
 * `.efx` files compile with the `node` runtime, then Node's `stripTypeScriptTypes` in transform
 * mode removes types (including non-erasable syntax such as enums). `.efx` that compiles to TSX is
 * rejected: Node has no JSX transform.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import { registerHooks, stripTypeScriptTypes } from "node:module"
import { fileURLToPath } from "node:url"
import { toTypeScript } from "./compiler/compile.ts"
import { formatDiagnostic } from "./compiler/diagnostics.ts"
import { packageInfo } from "./project.ts"

// Stack traces from `.efx` code point at `.efx` positions (review I6, ADR-0026).
process.setSourceMapsEnabled(true)

/**
 * Runs `strip` with Node's "stripTypeScriptTypes is an experimental feature" warning dropped:
 * EffectScript uses it on purpose (ADR-0026), and the warning would open every `efx run`
 * (ADR-0057). The filter is only in place during the call; the program's own warnings, and Node's
 * errors for bad arguments, are untouched (Plan 21).
 */
const quietly = <A>(strip: () => A): A => {
  const emitWarning = process.emitWarning
  process.emitWarning = function(this: unknown, warning: unknown, ...rest: Array<unknown>) {
    const text = typeof warning === "string" ? warning : warning instanceof Error ? warning.message : undefined
    if (text?.startsWith("stripTypeScriptTypes is an experimental feature")) return
    return (emitWarning as (...args: Array<unknown>) => void).call(process, warning, ...rest)
  } as typeof process.emitWarning
  try {
    return strip()
  } finally {
    process.emitWarning = emitWarning
  }
}

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !url.endsWith(".efx")) return nextLoad(url, context)
    const filename = fileURLToPath(url)
    const source = fs.readFileSync(filename, "utf8")
    const result = toTypeScript(source, { filename, runtime: "node", ...packageInfo(filename) })
    const errors = result.diagnostics.filter((d) => d.severity === "error")
    if (errors.length > 0) {
      throw new SyntaxError(errors.map((d) => formatDiagnostic(source, filename, d)).join("\n\n"))
    }
    if (result.mode === "tsx") {
      throw new SyntaxError(
        `${filename} - error EFX1101: JSX can't run through effectscript/register (Node has no JSX transform); ` +
          "use Bun, Vite or `efx build`"
      )
    }
    const stripped = stripTypes(result.code, url)
    const map = stripped.positionsPreserved && result.map !== undefined
      ? `\n//# sourceMappingURL=data:application/json;base64,${
        Buffer.from(JSON.stringify({ ...result.map, sources: [url] })).toString("base64")
      }`
      : ""
    return { format: "module", source: `${stripped.code}${map}`, shortCircuit: true }
  }
})

/**
 * Strip mode replaces types with whitespace, so positions survive and the compiler's `.efx` → TS
 * source map applies to the JavaScript as is. Non-erasable syntax (enums, …) needs transform mode,
 * where available; positions are then approximate (ADR-0026).
 */
const stripTypes = (code: string, url: string): { readonly code: string; readonly positionsPreserved: boolean } => {
  try {
    return { code: quietly(() => stripTypeScriptTypes(code, { mode: "strip" })), positionsPreserved: true }
  } catch (strip) {
    if ((strip as { code?: unknown }).code !== "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") throw strip
    try {
      const options = { mode: "transform", sourceMap: true, sourceUrl: url } as unknown as { mode: "strip" }
      return { code: quietly(() => stripTypeScriptTypes(code, options)), positionsPreserved: false }
    } catch (transform) {
      if ((transform as { code?: unknown }).code === "ERR_INVALID_ARG_VALUE") throw strip
      throw transform
    }
  }
}
