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
import { doctestSource } from "./docs/doctest.ts"
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
  readonly configureServer?: (server: {
    readonly middlewares: {
      readonly use: (handler: (req: { url?: string }, res: unknown, next: () => void) => void) => void
    }
  }) => void
  readonly load?: (id: string) => string | undefined
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

const doctestQuery = /\?doctest$/

/** The `.efx`/`.ts` file whose examples a `…?doctest` id asks for (docs spec §2.3), or `undefined`. */
const doctestTarget = (id: string): string | undefined =>
  !id.startsWith("\0") && /\.(efx|ts)\?doctest$/.test(id) ? id.replace(doctestQuery, "") : undefined

/**
 * The `.efx` module of an id, or `undefined` (other files, asset queries). A `?doctest` module is
 * EffectScript whatever its target's extension, so it keeps its query.
 */
const efxFile = (id: string): string | undefined => {
  // asset queries and virtual modules (`\0…`) are someone else's
  if (assetQuery.test(id) || id.startsWith("\0")) return undefined
  if (doctestTarget(id) !== undefined) return id
  const file = id.replace(/[?#].*$/, "")
  return file.endsWith(".efx") ? file : undefined
}

/** The file on disk behind an `efxFile` result. */
const diskFile = (file: string): string => file.replace(doctestQuery, "")

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
    // a direct request for an .efx module (an HTML entry) is a JS request: Vite only knows that
    // for its own extensions, so it is marked with `?import`
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url !== undefined && /\.efx(\?|$)/.test(req.url) && !/[?&](import|raw|url)\b/.test(req.url)) {
          req.url = `${req.url}${req.url.includes("?") ? "&" : "?"}import`
        }
        next()
      })
    },
    // `x.efx?doctest`: the examples of x.efx as a test module (docs spec §2.3), compiled below
    load(id) {
      const target = doctestTarget(id)
      if (target === undefined) return undefined
      const source = fs.readFileSync(target, "utf8")
      const result = doctestSource(target, source)
      const errors = result.diagnostics.filter((d) => d.severity === "error")
      if (errors.length > 0) {
        const filename = path.relative(process.cwd(), target)
        throw new Error(errors.map((d) => formatDiagnostic(source, filename, d)).join("\n"))
      }
      return result.code
    },
    async transform(code, id, transformOptions) {
      const file = efxFile(id)
      if (file === undefined) return undefined
      const server = transformOptions?.ssr === true || this.environment?.config?.consumer === "server"
      const filename = path.relative(process.cwd(), diskFile(file))
      const result = toTypeScript(code, {
        filename,
        runtime: server ? "node" : options.clientRuntime ?? "browser",
        ...packageInfo(diskFile(file))
      })
      const errors = result.diagnostics.filter((d) => d.severity === "error")
      if (errors.length > 0) throw new Error(errors.map((d) => formatDiagnostic(code, filename, d)).join("\n"))
      compiled.set(file, result.mode)
      // Vite resolves map sources against the module's own directory
      const map = result.map === undefined ? undefined : { ...result.map, sources: [path.basename(diskFile(file))] }
      return { code: result.code, map }
    }
  },
  {
    name: "effectscript:strip-types",
    enforce: "pre",
    async transform(code, id) {
      const file = efxFile(id)
      const mode = file === undefined ? undefined : compiled.get(file)
      if (file === undefined || mode === undefined || !fs.existsSync(diskFile(file))) return undefined
      const { transformWithOxc } = await import("vite")
      const name = file === diskFile(file) ? `${file}.${mode}` : `${diskFile(file)}.doctest.${mode}`
      const result = await transformWithOxc(code, name, { lang: mode, sourcemap: true })
      return { code: result.code, map: result.map }
    }
  }
]
