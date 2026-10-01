/**
 * @since 0.1.0
 */
import type { Diagnostic } from "./diagnostics.ts"
import type { Mode } from "./parser/parse.ts"

/**
 * @since 0.1.0
 * @category models
 */
export type Runtime = "node" | "bun" | "deno" | "browser"

/**
 * @since 0.1.0
 * @category models
 */
export interface CompileOptions {
  readonly filename?: string | undefined
  readonly packageName?: string | undefined
  readonly packageRoot?: string | undefined
  readonly runtime?: Runtime | undefined
  readonly prelude?: boolean | undefined
  readonly rewriteImportExtensions?: "ts" | "js" | false | undefined
  readonly sourceMap?: boolean | undefined
}

/**
 * @since 0.1.0
 * @category models
 */
export interface ResolvedOptions {
  readonly filename: string
  readonly packageName: string | undefined
  readonly packageRoot: string | undefined
  readonly runtime: Runtime
  readonly prelude: boolean
  readonly rewriteImportExtensions: "ts" | "js" | false
  readonly sourceMap: boolean
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const resolveOptions = (options: CompileOptions): ResolvedOptions => ({
  filename: options.filename ?? "input.efx",
  packageName: options.packageName,
  packageRoot: options.packageRoot,
  runtime: options.runtime ?? "node",
  prelude: options.prelude ?? true,
  rewriteImportExtensions: options.rewriteImportExtensions ?? false,
  sourceMap: options.sourceMap ?? true
})

/**
 * Volar-compatible code information.
 *
 * @since 0.1.0
 * @category models
 */
export interface CodeInformation {
  readonly verification: boolean
  readonly completion: boolean
  readonly semantic: boolean
  readonly navigation: boolean
  readonly structure: boolean
  readonly format: boolean
}

/**
 * Volar-compatible mapping (`@volar/language-core` `CodeMapping`).
 *
 * @since 0.1.0
 * @category models
 */
export interface CodeMapping {
  readonly sourceOffsets: Array<number>
  readonly generatedOffsets: Array<number>
  readonly lengths: Array<number>
  readonly generatedLengths?: Array<number>
  readonly data: CodeInformation
}

/**
 * @since 0.1.0
 * @category models
 */
export interface SourceMapV3 {
  readonly version: number
  readonly file?: string
  readonly sources: Array<string>
  readonly sourcesContent?: Array<string | null>
  readonly names: Array<string>
  readonly mappings: string
}

/**
 * @since 0.1.0
 * @category models
 */
export interface CompileResult {
  readonly code: string
  readonly mode: Mode
  readonly map: SourceMapV3 | undefined
  readonly mappings: ReadonlyArray<CodeMapping>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}
