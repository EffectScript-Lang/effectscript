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

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !url.endsWith(".efx")) return nextLoad(url, context)
    const filename = fileURLToPath(url)
    const source = fs.readFileSync(filename, "utf8")
    const result = toTypeScript(source, { filename, runtime: "node" })
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
    return { format: "module", source: stripTypes(result.code, url), shortCircuit: true }
  }
})

/**
 * Transform mode handles non-erasable syntax (enums, parameter properties). Newer Node typings only
 * allow `"strip"`, so fall back to it where transform mode is rejected (ADR-0024).
 */
const stripTypes = (code: string, url: string): string => {
  try {
    const options = { mode: "transform", sourceMap: true, sourceUrl: url } as unknown as { mode: "strip" }
    return stripTypeScriptTypes(code, options)
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ERR_INVALID_ARG_VALUE") throw error
    return stripTypeScriptTypes(code, { mode: "strip", sourceUrl: url })
  }
}
