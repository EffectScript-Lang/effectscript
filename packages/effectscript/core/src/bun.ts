/**
 * `effectscript/bun` (spec §7.2): a Bun plugin that loads `.efx` modules, so `bun ./x.efx` and
 * `bun test` work. Import `.efx` modules with their extension (ADR-0035). Register it with the `effectscript/bun-preload` preload (bunfig.toml
 * `preload = ["effectscript/bun-preload"]`) or `Bun.plugin(efx())`.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { toTypeScript } from "./compiler/compile.ts"
import { formatDiagnostic } from "./compiler/diagnostics.ts"
import type { Runtime } from "./compiler/options.ts"
import { packageInfo } from "./project.ts"

/**
 * The part of Bun's plugin builder this plugin uses (structural: no Bun types needed).
 *
 * @since 4.0.0
 * @category models
 */
export interface BunPluginBuilder {
  readonly onLoad: (
    options: { readonly filter: RegExp },
    callback: (args: { readonly path: string }) => { readonly contents: string; readonly loader: "ts" | "tsx" }
  ) => void
}

/**
 * @since 4.0.0
 * @category models
 */
export interface BunPlugin {
  readonly name: string
  readonly setup: (build: BunPluginBuilder) => void
}

/**
 * @since 4.0.0
 * @category models
 */
export interface BunPluginOptions {
  /** The runtime `main` blocks target (default `"bun"`). */
  readonly runtime?: Runtime | undefined
}

/**
 * The Bun plugin.
 *
 * @since 4.0.0
 * @category plugins
 */
export const efx = (options: BunPluginOptions = {}): BunPlugin => ({
  name: "effectscript",
  setup(build) {
    build.onLoad({ filter: /\.efx$/ }, (args) => {
      const source = fs.readFileSync(args.path, "utf8")
      const filename = path.relative(process.cwd(), args.path)
      const result = toTypeScript(source, { filename, runtime: options.runtime ?? "bun", ...packageInfo(args.path) })
      const errors = result.diagnostics.filter((d) => d.severity === "error")
      if (errors.length > 0) throw new Error(errors.map((d) => formatDiagnostic(source, filename, d)).join("\n"))
      const map = result.map === undefined
        ? ""
        : `\n//# sourceMappingURL=data:application/json;base64,${
          Buffer.from(JSON.stringify(result.map)).toString("base64")
        }`
      return { contents: `${result.code}${map}`, loader: result.mode }
    })
  }
})
