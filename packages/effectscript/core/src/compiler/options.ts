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
  /** Recover from parse errors for editors (ADR-0020). Never use for builds. Browser-safe. */
  readonly recover?: boolean | undefined
  /** Ambient capture of `console`/`Date`/`Math`/`process.env` in `effect` code (§4.15). Default `true`; `// @efx no-ambient` turns it off. Browser-safe. */
  readonly ambient?: boolean | undefined
  /** Promote strict-mode warnings to errors (ADR-0028). Default `false`; `// @efx strict` turns it on. Browser-safe. */
  readonly strict?: boolean | undefined
  /** The installed `effect` version, compared with a `// @effect X.Y` header (EFX1003). Project-only: supplied by integrations. */
  readonly effectVersion?: string | undefined
  /** `"otlp"`: `main` provides OTLP telemetry from `OTEL_*` configuration (ADR-0029). `// @efx observability otlp` turns it on. Browser-safe. */
  readonly observability?: "otlp" | undefined
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
  readonly recover: boolean
  readonly ambient: boolean
  readonly strict: boolean
  readonly effectVersion: string | undefined
  readonly observability: "otlp" | undefined
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
  sourceMap: options.sourceMap ?? true,
  recover: options.recover ?? false,
  ambient: options.ambient ?? true,
  strict: options.strict ?? false,
  effectVersion: options.effectVersion,
  observability: options.observability
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
  /** The compile succeeded when no diagnostic has severity `"error"` (ADR-0017). */
  readonly diagnostics: ReadonlyArray<Diagnostic>
  /** With `recover`: whether failing lines were neutralized to produce `code` (ADR-0020). */
  readonly recovered?: boolean | undefined
}
