/**
 * @since 0.1.0
 */
import { tsPlugin } from "@sveltejs/acorn-typescript"
import * as acorn from "acorn"
import type { Node } from "../ast.ts"
import { type Diagnostic, diagnosticError } from "../diagnostics.ts"
import { efxPlugin } from "./plugin.ts"

/**
 * @since 0.1.0
 * @category models
 */
export type Mode = "ts" | "tsx"

/**
 * @since 0.1.0
 * @category models
 */
export type ParseResult =
  | { readonly _tag: "Success"; readonly program: Node; readonly mode: Mode }
  | { readonly _tag: "Failure"; readonly diagnostics: ReadonlyArray<Diagnostic> }

const parsers: Record<Mode, typeof acorn.Parser> = {
  ts: acorn.Parser.extend(tsPlugin() as any, efxPlugin),
  tsx: acorn.Parser.extend(tsPlugin({ jsx: true }) as any, efxPlugin)
}

/**
 * A cheap hint that `source` contains JSX (it then parses in JSX mode first).
 *
 * @since 4.0.0
 * @category parsing
 */
export const looksLikeJsx = (source: string): boolean => source.includes("</") || source.includes("/>")

const parseWith = (mode: Mode, source: string): Node =>
  parsers[mode].parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    allowHashBang: true
  }) as unknown as Node

interface ParseError {
  readonly pos: number
  readonly message: string
}

const toParseError = (error: unknown): ParseError => {
  const e = error as { pos?: unknown; message?: unknown }
  const message = typeof e.message === "string" ? e.message.replace(/ \(\d+:\d+\)$/, "") : String(error)
  return { pos: typeof e.pos === "number" ? e.pos : 0, message }
}

/**
 * Parses EffectScript in TS mode, then JSX mode (JSX first when the source looks like JSX).
 *
 * @since 0.1.0
 * @category parsing
 */
export const parse = (source: string, options: { readonly mode?: Mode | undefined } = {}): ParseResult => {
  const order: ReadonlyArray<Mode> = options.mode !== undefined
    ? [options.mode]
    : looksLikeJsx(source)
    ? ["tsx", "ts"]
    : ["ts", "tsx"]
  let furthest: ParseError | undefined
  for (const mode of order) {
    try {
      return { _tag: "Success", program: parseWith(mode, source), mode }
    } catch (error) {
      const parsed = toParseError(error)
      if (furthest === undefined || parsed.pos > furthest.pos) furthest = parsed
    }
  }
  const pos = furthest?.pos ?? 0
  return {
    _tag: "Failure",
    diagnostics: [
      diagnosticError("EFX1001", furthest?.message ?? "Syntax error", pos, Math.min(pos + 1, source.length))
    ]
  }
}
