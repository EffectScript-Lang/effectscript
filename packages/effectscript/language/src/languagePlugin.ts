/**
 * The Volar language plugin for `.efx` (ADR-0019): one TS/TSX virtual file per source, produced by
 * the EffectScript compiler with incomplete-code recovery (ADR-0020).
 *
 * @since 4.0.0
 */
import type { CodeMapping, IScriptSnapshot, LanguagePlugin, VirtualCode } from "@volar/language-core"
import type { TypeScriptServiceScript } from "@volar/typescript"
import { type Diagnostic, type SourceRange, toTypeScript } from "effectscript/compiler"
import { packageInfo } from "effectscript/project"
import type * as ts from "typescript"

/**
 * @since 4.0.0
 * @category models
 */
export interface EffectScriptVirtualCode extends VirtualCode {
  readonly mode: "ts" | "tsx"
  /** The effect binds of the source (ADR-0039). */
  readonly binds: ReadonlyArray<SourceRange>
  /** The EffectScript compiler diagnostics, in source positions. */
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

/** A snapshot over a string; `runTsc` passes the `tsc.js` namespace, which has no `ScriptSnapshot`. */
const stringSnapshot = (text: string): IScriptSnapshot => ({
  getText: (start, end) => text.slice(start, end),
  getLength: () => text.length,
  getChangeRange: () => undefined
})

/**
 * @since 4.0.0
 * @category models
 */
export interface LanguagePluginOptions {
  /** Called after every compile with its diagnostics (review I1) and effect binds (ADR-0039). */
  readonly onCompile?: (
    fileName: string,
    source: string,
    diagnostics: ReadonlyArray<Diagnostic>,
    binds: ReadonlyArray<SourceRange>
  ) => void
}

/**
 * @since 4.0.0
 * @category constructors
 */
export const createLanguagePlugin = (
  typescript: { readonly ScriptKind: typeof ts.ScriptKind },
  options: LanguagePluginOptions = {}
): LanguagePlugin<string, EffectScriptVirtualCode> => ({
  getLanguageId: (fileName) => (fileName.endsWith(".efx") ? "effectscript" : undefined),
  createVirtualCode(fileName, languageId, snapshot) {
    if (languageId !== "effectscript") return undefined
    const source = snapshot.getText(0, snapshot.getLength())
    const result = toTypeScript(source, { filename: fileName, recover: true, ...packageInfo(fileName) })
    options.onCompile?.(fileName, source, result.diagnostics, result.binds)
    return {
      id: "root",
      languageId: result.mode === "tsx" ? "typescriptreact" : "typescript",
      mode: result.mode,
      binds: result.binds,
      diagnostics: result.diagnostics,
      snapshot: stringSnapshot(result.code),
      mappings: result.mappings as Array<CodeMapping>
    }
  },
  typescript: {
    extraFileExtensions: [{ extension: "efx", isMixedContent: true, scriptKind: typescript.ScriptKind.Deferred }],
    getServiceScript: (root: VirtualCode): TypeScriptServiceScript => {
      const mode = (root as EffectScriptVirtualCode).mode
      return {
        code: root,
        extension: mode === "tsx" ? ".tsx" : ".ts",
        scriptKind: mode === "tsx" ? typescript.ScriptKind.TSX : typescript.ScriptKind.TS
      }
    }
  }
})
