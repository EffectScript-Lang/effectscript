/**
 * The playground's logic, without Monaco or a worker, so tests run it directly (ADR-0054): compiling
 * both ways, diagnostics and notes with line and column, dropping stale results, and share hashes.
 */
import { toEffectScript, toTypeScript } from "effectscript/compiler"

/** Larger sources are refused: the compiler runs on every keystroke. */
export const maxSource = 200_000

export interface Request {
  readonly seq: number
  readonly direction: "toTypeScript" | "toEffectScript"
  readonly source: string
}

export interface Problem {
  readonly code: string
  readonly message: string
  readonly severity: "error" | "warning"
  /** 1-based line and column of the start, and of the end. */
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
}

export interface Note {
  readonly message: string
  readonly line: number
  readonly column: number
}

export interface Response {
  readonly seq: number
  readonly code: string
  readonly diagnostics: ReadonlyArray<Problem>
  readonly notes: ReadonlyArray<Note>
}

const position = (source: string, offset: number) => {
  let line = 1
  let last = -1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      last = i
    }
  }
  return { line, column: offset - last }
}

/** Compiles one request. Never throws: an internal error becomes a diagnostic. */
export const compile = (request: Request): Response => {
  const { direction, seq, source } = request
  if (source.length > maxSource) {
    return {
      seq,
      code: "",
      notes: [],
      diagnostics: [{
        code: "EFX0000",
        message: `This source is too large for the playground (over ${maxSource} characters)`,
        severity: "error",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1
      }]
    }
  }
  try {
    if (direction === "toTypeScript") {
      const result = toTypeScript(source, { filename: "playground.efx", recover: true })
      return {
        seq,
        code: result.code,
        notes: [],
        diagnostics: result.diagnostics.map((d) => {
          const start = position(source, d.start)
          const end = position(source, Math.max(d.end, d.start + 1))
          return {
            code: d.code,
            message: d.message,
            severity: d.severity,
            line: start.line,
            column: start.column,
            endLine: end.line,
            endColumn: end.column
          }
        })
      }
    }
    const result = toEffectScript(source, { filename: "playground.ts" })
    return {
      seq,
      code: result.code,
      diagnostics: [],
      notes: result.notes.map((n) => ({ message: n.message, ...position(source, n.start) }))
    }
  } catch (error) {
    return {
      seq,
      code: "",
      notes: [],
      diagnostics: [{
        code: "EFX1000",
        message: `Internal error: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1
      }]
    }
  }
}

/** Sequence numbers for requests: only the newest request's result is applied. */
export const createTracker = () => {
  let latest = 0
  return {
    next: () => ++latest,
    accept: (seq: number) => seq === latest
  }
}

/** `#code=` plus the base64url of the code's UTF-8. */
export const encodeHash = (code: string): string => {
  const bytes = new TextEncoder().encode(code)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `#code=${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

/** The code in a share hash, or `undefined` when it is missing, malformed or too large. */
export const decodeHash = (hash: string): string | undefined => {
  const match = /^#code=([A-Za-z0-9_-]+)$/.exec(hash)
  if (match === null || match[1]!.length > Math.ceil((maxSource * 4) / 3) + 4) return undefined
  try {
    const base64 = match[1]!.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}
