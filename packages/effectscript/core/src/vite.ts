/**
 * `effectscript/vite` (spec §7.2): `.efx` support for Vite, Vitest, Astro and Vite+.
 *
 * It returns two plugins. The first compiles `.efx` → TypeScript (with a source map). The second
 * strips the types with Vite's own oxc transform, so Vite chains the two maps back to the `.efx`.
 * The runtime is `browser` for client code and `node` for SSR and Vitest.
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
 * The part of a Vite plugin this package uses (structural: Vite is an optional peer).
 *
 * @since 4.0.0
 * @category models
 */
export interface VitePlugin {
  readonly name: string
  readonly enforce?: "pre" | "post"
  readonly config?: (config: { readonly resolve?: { readonly extensions?: ReadonlyArray<string> } }) => object
  readonly transform?: (
    this: { readonly environment?: { readonly config?: { readonly consumer?: string } } },
    code: string,
    id: string,
    options?: { readonly ssr?: boolean }
  ) => Promise<{ readonly code: string; readonly map: unknown } | undefined>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface VitePluginOptions {
  /** The runtime of `main` blocks in client code (default `"browser"`); SSR and tests use `"node"`. */
  readonly clientRuntime?: Runtime | undefined
}

const defaultExtensions = [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"]
const assetQuery = /[?&](raw|url|inline|worker|sharedworker)\b/

/** The `.efx` file of a module id, or `undefined` (other files, asset queries). */
const efxFile = (id: string): string | undefined => {
  if (assetQuery.test(id)) return undefined
  const file = id.replace(/[?#].*$/, "")
  return file.endsWith(".efx") ? file : undefined
}

/** Compiled modules waiting for the type-stripping step, by `.efx` file. */
const compiled = new Map<string, "ts" | "tsx">()

/**
 * The Vite plugins.
 *
 * @since 4.0.0
 * @category plugins
 */
export const efx = (options: VitePluginOptions = {}): [VitePlugin, VitePlugin] => [
  {
    name: "effectscript",
    enforce: "pre",
    config: (config) => ({
      resolve: { extensions: [...(config.resolve?.extensions ?? defaultExtensions), ".efx"] }
    }),
    async transform(code, id, transformOptions) {
      const file = efxFile(id)
      if (file === undefined) return undefined
      const server = transformOptions?.ssr === true || this.environment?.config?.consumer === "server"
      const filename = path.relative(process.cwd(), file)
      const result = toTypeScript(code, {
        filename,
        runtime: server ? "node" : options.clientRuntime ?? "browser",
        ...packageInfo(file)
      })
      const errors = result.diagnostics.filter((d) => d.severity === "error")
      if (errors.length > 0) throw new Error(errors.map((d) => formatDiagnostic(code, filename, d)).join("\n"))
      compiled.set(file, result.mode)
      return { code: result.code, map: result.map }
    }
  },
  {
    name: "effectscript:strip-types",
    enforce: "pre",
    async transform(code, id) {
      const file = efxFile(id)
      const mode = file === undefined ? undefined : compiled.get(file)
      if (file === undefined || mode === undefined || !fs.existsSync(file)) return undefined
      const { transformWithOxc } = await import("vite")
      const result = await transformWithOxc(code, `${file}.${mode}`, { lang: mode, sourcemap: true })
      return { code: result.code, map: result.map }
    }
  }
]
