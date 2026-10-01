/**
 * EffectScript compiler: `.efx` → idiomatic Effect TypeScript.
 *
 * @since 0.1.0
 */
export { type Node } from "./ast.ts"
export { toTypeScript } from "./compile.ts"
export {
  type Diagnostic,
  diagnosticError,
  diagnosticWarning,
  formatDiagnostic,
  lineColumn,
  type Severity
} from "./diagnostics.ts"
export {
  type CodeInformation,
  type CodeMapping,
  type CompileOptions,
  type CompileResult,
  type ResolvedOptions,
  type Runtime,
  type SourceMapV3
} from "./options.ts"
export { type Mode, parse, type ParseResult } from "./parser/parse.ts"
export { type ConvertNote, type ConvertResult, toEffectScript } from "./reverse/index.ts"
