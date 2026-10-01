/**
 * The TypeScript server plugin: VS Code's built-in TS server (and any tsserver host) loads it to
 * serve `.efx` files and `.ts` files that import them (ADR-0019). EffectScript compiler diagnostics
 * are added to the syntactic diagnostics of `.efx` files (review I1).
 *
 * @since 4.0.0
 */
import { createLanguageServicePlugin } from "@volar/typescript/lib/quickstart/createLanguageServicePlugin.js"
import type { Diagnostic } from "effectscript/compiler"
import type * as ts from "typescript"
import { createLanguagePlugin } from "./languagePlugin.ts"

/** The latest EffectScript compiler diagnostics per file. */
const compilerDiagnostics = new Map<string, ReadonlyArray<Diagnostic>>()

const volarPlugin = createLanguageServicePlugin((typescript) => ({
  languagePlugins: [
    createLanguagePlugin(typescript, {
      onCompile: (fileName, _source, diagnostics) => compilerDiagnostics.set(fileName, diagnostics)
    })
  ]
}))

const toTypeScriptDiagnostic = (
  diagnostic: Diagnostic,
  file: ts.SourceFile | undefined
): ts.DiagnosticWithLocation => ({
  // EFX2003 → 92003: outside TypeScript's own code ranges
  code: 90000 + Number(diagnostic.code.slice(3)),
  category: diagnostic.severity === "error" ? 1 : 0,
  messageText: `${diagnostic.code}: ${diagnostic.message}`,
  start: diagnostic.start,
  length: Math.max(0, diagnostic.end - diagnostic.start),
  file: file as ts.SourceFile,
  source: "effectscript"
})

/**
 * The tsserver plugin factory.
 *
 * @since 4.0.0
 * @category plugins
 */
export const typescriptPlugin: ts.server.PluginModuleFactory = (modules) => {
  const plugin = volarPlugin(modules)
  return {
    ...plugin,
    create(info) {
      const service = plugin.create(info)
      const getSyntacticDiagnostics = service.getSyntacticDiagnostics.bind(service)
      return new Proxy(service, {
        get(target, key, receiver) {
          if (key !== "getSyntacticDiagnostics") return Reflect.get(target, key, receiver)
          return (fileName: string): Array<ts.DiagnosticWithLocation> => {
            const diagnostics = getSyntacticDiagnostics(fileName)
            if (!fileName.endsWith(".efx")) return diagnostics
            const file = target.getProgram()?.getSourceFile(fileName)
            const extra = (compilerDiagnostics.get(fileName) ?? []).map((d) => toTypeScriptDiagnostic(d, file))
            return [...diagnostics, ...extra]
          }
        }
      })
    }
  }
}

export default typescriptPlugin
