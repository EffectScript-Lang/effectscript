/**
 * `effectscript/bun` (spec §7.2): a Bun plugin that loads `.efx` modules, so `bun run x.efx` and
 * `bun test` work. Register it with the `effectscript/bun-preload` preload (bunfig.toml
 * `preload = ["effectscript/bun-preload"]`) or `Bun.plugin(efx())`.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import * as fs from "node:fs"
import * as path from "node:path"
import { children, type Node } from "./compiler/ast.ts"
import { toTypeScript } from "./compiler/compile.ts"
import { formatDiagnostic } from "./compiler/diagnostics.ts"
import type { Runtime } from "./compiler/options.ts"
import { type Mode, parse } from "./compiler/parser/parse.ts"
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
  readonly onResolve: (
    options: { readonly filter: RegExp },
    callback: (args: { readonly path: string; readonly importer: string }) => { readonly path: string } | undefined
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

const existing = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"]

/** `./x` → `./x.efx` or `./x/index.efx`, unless something else already resolves. */
const resolveEfx = (specifier: string, importer: string): string | undefined => {
  const base = path.resolve(path.dirname(importer), specifier)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return undefined
  if (existing.some((ext) => fs.existsSync(`${base}${ext}`) || fs.existsSync(path.join(base, `index${ext}`)))) {
    return undefined
  }
  return [`${base}.efx`, path.join(base, "index.efx")].find((file) => fs.existsSync(file))
}

/**
 * Rewrites extensionless relative specifiers that name an `.efx` file to explicit `.efx` paths.
 * Bun's runtime calls `onResolve` only for entry points, so imports from `.efx` modules are
 * resolved here, at load time.
 */
const explicitEfx = (code: string, mode: Mode, file: string): string => {
  const parsed = parse(code, { mode })
  if (parsed._tag === "Failure") return code
  const s = new MagicString(code)
  const visit = (node: Node): void => {
    const source: Node | null | undefined = node.source
    if (
      (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration" || node.type === "ImportExpression") &&
      source?.type === "Literal" && typeof source.value === "string" && /^\.\.?(\/|$)/.test(source.value)
    ) {
      const target = resolveEfx(source.value, file)
      if (target !== undefined) {
        const relative = path.relative(path.dirname(file), target).split(path.sep).join("/")
        s.update(source.start, source.end, JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`))
      }
    }
    for (const child of children(node)) visit(child)
  }
  visit(parsed.program)
  return s.toString()
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
    build.onResolve({ filter: /^\.\.?(\/|$)/ }, (args) => {
      if (args.importer === "" || path.extname(args.path) === ".efx") return undefined
      const file = resolveEfx(args.path, args.importer)
      return file === undefined ? undefined : { path: file }
    })
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
      return { contents: `${explicitEfx(result.code, result.mode, args.path)}${map}`, loader: result.mode }
    })
  }
})
