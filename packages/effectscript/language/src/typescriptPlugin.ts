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
import { type Compiled, decorateGuardrails } from "./guardrails.ts"
import { createLanguagePlugin } from "./languagePlugin.ts"

/** The latest EffectScript compile per file: its diagnostics, source and binds. */
const compiles = new Map<string, Compiled & { readonly diagnostics: ReadonlyArray<Diagnostic> }>()

const volarPlugin = createLanguageServicePlugin((typescript) => ({
  languagePlugins: [
    createLanguagePlugin(typescript, {
      onCompile: (fileName, source, diagnostics, binds) => compiles.set(fileName, { source, diagnostics, binds })
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
  const typescript = modules.typescript
  return {
    ...plugin,
    create(info) {
      const service = decorateGuardrails(plugin.create(info), (fileName) => compiles.get(fileName), typescript)
      const getSyntacticDiagnostics = service.getSyntacticDiagnostics.bind(service)
      return new Proxy(service, {
        get(target, key, receiver) {
          if (key !== "getSyntacticDiagnostics") return Reflect.get(target, key, receiver)
          return (fileName: string): Array<ts.DiagnosticWithLocation> => {
            const diagnostics = getSyntacticDiagnostics(fileName)
            if (!fileName.endsWith(".efx")) return diagnostics
            const file = target.getProgram()?.getSourceFile(fileName)
            const extra = (compiles.get(fileName)?.diagnostics ?? []).map((d) => toTypeScriptDiagnostic(d, file))
            return [...diagnostics, ...extra]
          }
        }
      })
    }
  }
}

export default typescriptPlugin
