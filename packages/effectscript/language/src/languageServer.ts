/**
 * The standalone EffectScript language server (ADR-0040): `@volar/language-server` with
 * `volar-service-typescript` and an EffectScript service for the `await` guardrails (ADR-0039).
 * Editors without a TypeScript server plugin host (Neovim, Helix, Zed, …) run it over stdio.
 *
 * @since 4.0.0
 */
import {
  createConnection,
  createServer,
  createTypeScriptProject,
  type InitializeParams,
  loadTsdkByPath
} from "@volar/language-server/node.js"
import type { LanguagePlugin, LanguageService, LanguageServicePlugin } from "@volar/language-service"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type * as ts from "typescript"
import { create as createTypeScriptServices } from "volar-service-typescript"
import { URI } from "vscode-uri"
import { bindAt, bindHover, isPromiseAwait, promiseAwaitMessage } from "./guardrails.ts"
import { createLanguagePlugin, type EffectScriptVirtualCode } from "./languagePlugin.ts"

type TypeScript = typeof ts

/**
 * @since 4.0.0
 * @category models
 */
export interface LoadedTypeScript {
  readonly typescript: TypeScript
  readonly diagnosticMessages: ts.MapLike<string> | undefined
  /** Where it came from, for the log. */
  readonly from: string
}

/** The nearest `node_modules/typescript/lib` from `dir` up (never NODE_PATH, which pnpm sets). */
const workspaceTsdk = (dir: string): string | undefined => {
  for (let current = path.resolve(dir);; current = path.dirname(current)) {
    const lib = path.join(current, "node_modules", "typescript", "lib")
    if (fs.existsSync(path.join(lib, "typescript.js"))) return lib
    if (path.dirname(current) === current) return undefined
  }
}

const folders = (params: InitializeParams): Array<string> =>
  [...(params.workspaceFolders ?? []).map((f) => f.uri), ...(params.rootUri ? [params.rootUri] : [])]
    .filter((uri) => uri.startsWith("file:"))
    .map((uri) => fileURLToPath(uri))

/**
 * TypeScript 6 for the server (ADR-0019): `initializationOptions.typescript.tsdk`, then the
 * workspace's, then the one the server was installed with.
 *
 * @since 4.0.0
 * @category language server
 */
export const loadTypeScript = (params: InitializeParams, own: () => TypeScript): LoadedTypeScript => {
  const options = params.initializationOptions as { typescript?: { tsdk?: unknown } } | undefined
  const candidates = [
    ...(typeof options?.typescript?.tsdk === "string" ? [["tsdk", options.typescript.tsdk] as const] : []),
    ...folders(params).flatMap((folder) => {
      const lib = workspaceTsdk(folder)
      return lib === undefined ? [] : [["the workspace", lib] as const]
    })
  ]
  for (const [label, lib] of candidates) {
    try {
      const loaded = loadTsdkByPath(lib, params.locale)
      if (loaded.typescript.version.startsWith("6.")) {
        return {
          typescript: loaded.typescript as TypeScript,
          diagnosticMessages: loaded.diagnosticMessages as ts.MapLike<string> | undefined,
          from: `${label} (${lib})`
        }
      }
    } catch {
      // not a usable TypeScript: try the next one
    }
  }
  return { typescript: own(), diagnosticMessages: undefined, from: "bundled with the language server" }
}

/** The language plugin over URIs, as the server addresses scripts. */
const uriLanguagePlugin = (
  typescript: TypeScript,
  asFileName: (uri: URI) => string
): LanguagePlugin<URI, EffectScriptVirtualCode> => {
  const plugin = createLanguagePlugin(typescript)
  return {
    getLanguageId: (uri) => plugin.getLanguageId(asFileName(uri)),
    createVirtualCode: (uri, languageId, snapshot, context) =>
      plugin.createVirtualCode!(asFileName(uri), languageId, snapshot, context as never),
    typescript: plugin.typescript!
  }
}

/**
 * Declares the semantic token legend for effect binds (`keyword` + `effect`, ADR-0039). The
 * results come from `withEffectScript`, in source positions: Volar hands service plugins only the
 * compiled TypeScript of an `.efx` file.
 *
 * @since 4.0.0
 * @category language server
 */
export const effectScriptLegend = (): LanguageServicePlugin => ({
  name: "effectscript",
  capabilities: { semanticTokensProvider: { legend: { tokenTypes: ["keyword"], tokenModifiers: ["effect"] } } },
  create: () => ({})
})

type Position = { readonly line: number; readonly character: number }

/** Offsets ↔ LSP positions over a text. */
const lines = (text: string) => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return {
    positionAt: (offset: number): Position => {
      let line = 0
      while (line + 1 < starts.length && starts[line + 1]! <= offset) line++
      return { line, character: offset - starts[line]! }
    },
    offsetAt: (p: Position): number => (starts[p.line] ?? text.length) + p.character
  }
}

/** Relative-encoded semantic tokens → absolute `[line, character, length, type, modifiers]`. */
const decodeTokens = (data: ReadonlyArray<number>): Array<Array<number>> => {
  const out: Array<Array<number>> = []
  let line = 0
  let character = 0
  for (let i = 0; i + 4 < data.length; i += 5) {
    line += data[i]!
    character = data[i] === 0 ? character + data[i + 1]! : data[i + 1]!
    out.push([line, character, data[i + 2]!, data[i + 3]!, data[i + 4]!])
  }
  return out
}

const encodeTokens = (tokens: ReadonlyArray<ReadonlyArray<number>>): Array<number> => {
  const data: Array<number> = []
  let line = 0
  let character = 0
  for (const [l, c, length, type, modifiers] of tokens) {
    data.push(l! - line, l === line ? c! - character : c!, length!, type!, modifiers!)
    line = l!
    character = c!
  }
  return data
}

/**
 * Adds EffectScript's results to a project's language service, in `.efx` source positions:
 * compiler diagnostics, the bind hover, and bind semantic tokens (ADR-0039).
 *
 * @since 4.0.0
 * @category language server
 */
export const withEffectScript = (service: LanguageService): LanguageService => {
  const root = (uri: URI) => {
    const script = service.context.language.scripts.get(uri)
    const code = script?.generated?.root as EffectScriptVirtualCode | undefined
    if (script === undefined || code?.binds === undefined) return undefined
    const text = script.snapshot.getText(0, script.snapshot.getLength())
    return { code, text, ...lines(text) }
  }
  return {
    ...service,
    async getDiagnostics(uri, response, token) {
      const items = await service.getDiagnostics(uri, response, token)
      const efx = root(uri)
      if (efx === undefined) return items
      const compiler = efx.code.diagnostics.map((d) => ({
        range: { start: efx.positionAt(d.start), end: efx.positionAt(d.end) },
        severity: d.severity === "error" ? 1 as const : 2 as const,
        code: d.code,
        source: "effectscript",
        message: `${d.code}: ${d.message}`
      }))
      return [...compiler, ...items]
    },
    async getHover(uri, position, token) {
      const efx = root(uri)
      const bind = efx === undefined ? undefined : bindAt(efx.code.binds, efx.offsetAt(position))
      if (efx === undefined || bind === undefined) return service.getHover(uri, position, token)
      return {
        contents: { kind: "markdown", value: `**await** (effect bind)\n\n${bindHover}` },
        range: { start: efx.positionAt(bind.start), end: efx.positionAt(bind.end) }
      }
    },
    async getSemanticTokens(uri, range, legend, reportProgress, token) {
      const result = await service.getSemanticTokens(uri, range, legend, reportProgress, token)
      const efx = root(uri)
      const type = legend.tokenTypes.indexOf("keyword")
      const modifier = legend.tokenModifiers.indexOf("effect")
      if (efx === undefined || type === -1 || modifier === -1) return result
      const binds = efx.code.binds.map((b) => {
        const at = efx.positionAt(b.start)
        return [at.line, at.character, b.end - b.start, type, 1 << modifier]
      })
      // a bind replaces whatever token TypeScript gave the same span
      const taken = new Set(binds.map(([l, c]) => `${l}:${c}`))
      const merged = [...decodeTokens(result?.data ?? []).filter(([l, c]) => !taken.has(`${l}:${c}`)), ...binds]
        .sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!)
      return { ...result, data: encodeTokens(merged) }
    }
  }
}

/**
 * Wraps the TypeScript services so a Promise `await`ed inside `effect` code reads as such
 * (ADR-0039). Their diagnostics are on the compiled TypeScript; the wrapper maps each candidate back
 * to the `.efx` source before checking it against the binds.
 *
 * @since 4.0.0
 * @category language server
 */
export const withPromiseAwaitMessages = (
  plugins: ReadonlyArray<LanguageServicePlugin>
): Array<LanguageServicePlugin> =>
  plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context)
      const provide = instance.provideDiagnostics
      if (provide === undefined) return instance
      return {
        ...instance,
        async provideDiagnostics(document, token) {
          const diagnostics = await provide.call(instance, document, token)
          const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri))
          if (diagnostics == null || decoded === undefined) return diagnostics
          const script = context.language.scripts.get(decoded[0])
          const root = script?.generated?.root as EffectScriptVirtualCode | undefined
          const code = script?.generated?.embeddedCodes.get(decoded[1])
          if (script === undefined || root?.binds === undefined || code === undefined) return diagnostics
          const map = context.language.maps.get(code, script)
          const source = script.snapshot.getText(0, script.snapshot.getLength())
          return diagnostics.map((d) => {
            if (d.code !== 2488) return d
            for (const [start] of map.toSourceLocation(document.offsetAt(d.range.start))) {
              const message = typeof d.message === "string" ? d.message : (d.message as { value: string }).value
              if (isPromiseAwait(source, root.binds, 2488, message, start)) {
                return { ...d, message: promiseAwaitMessage }
              }
            }
            return d
          })
        }
      }
    }
  }))

/**
 * Starts the language server on stdio.
 *
 * @since 4.0.0
 * @category language server
 */
export const startLanguageServer = (
  own: () => TypeScript = () => createRequire(import.meta.url)("typescript")
): void => {
  const connection = createConnection()
  const server = createServer(connection)
  let loaded: LoadedTypeScript | undefined
  connection.onInitialize((params) => {
    loaded = loadTypeScript(params, own)
    const { typescript, diagnosticMessages } = loaded
    const project = createTypeScriptProject(typescript, diagnosticMessages, ({ uriConverter }) => ({
      languagePlugins: [uriLanguagePlugin(typescript, (uri) => uriConverter.asFileName(uri))]
    }))
    const services = new WeakMap<LanguageService, LanguageService>()
    const wrap = (service: LanguageService) => {
      if (!services.has(service)) services.set(service, withEffectScript(service))
      return services.get(service)!
    }
    return server.initialize(
      params,
      {
        ...project,
        setup: (s) => project.setup(s),
        reload: () => project.reload(),
        getLanguageService: async (uri) => wrap(await project.getLanguageService(uri)),
        getExistingLanguageServices: async () => (await project.getExistingLanguageServices()).map(wrap)
      },
      [effectScriptLegend(), ...withPromiseAwaitMessages(createTypeScriptServices(typescript))]
    )
  })
  connection.onInitialized(() => {
    server.initialized()
    connection.console.info(`EffectScript language server: TypeScript ${loaded!.typescript.version}, ${loaded!.from}`)
  })
  connection.onShutdown(() => server.shutdown())
  connection.listen()
}
