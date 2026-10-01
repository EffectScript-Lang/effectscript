/**
 * @since 0.1.0
 */

/**
 * @since 0.1.0
 * @category models
 */
export type Severity = "error" | "warning"

/**
 * @since 0.1.0
 * @category models
 */
export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly start: number
  readonly end: number
  readonly severity: Severity
  readonly hint?: string | undefined
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const diagnosticError = (
  code: string,
  message: string,
  start: number,
  end: number,
  hint?: string
): Diagnostic => ({ code, message, start, end, severity: "error", hint })

/**
 * @since 0.1.0
 * @category constructors
 */
export const diagnosticWarning = (
  code: string,
  message: string,
  start: number,
  end: number,
  hint?: string
): Diagnostic => ({ code, message, start, end, severity: "warning", hint })

/**
 * 1-based line, 0-based column.
 *
 * @since 0.1.0
 * @category utils
 */
export const lineColumn = (source: string, offset: number): { readonly line: number; readonly column: number } => {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: offset - lineStart }
}

/**
 * @since 0.1.0
 * @category utils
 */
export const formatDiagnostic = (source: string, filename: string, diagnostic: Diagnostic): string => {
  const { column, line } = lineColumn(source, diagnostic.start)
  const text = source.split("\n")[line - 1] ?? ""
  const width = Math.max(1, Math.min(diagnostic.end - diagnostic.start, text.length - column))
  const gutter = " ".repeat(String(line).length)
  const hint = diagnostic.hint === undefined ? "" : `\n\nhint: ${diagnostic.hint}`
  return `${filename}:${line}:${column + 1} - ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}\n\n` +
    `${line} | ${text}\n${gutter} | ${" ".repeat(column)}${"^".repeat(width)}${hint}`
}
