/**
 * Where a signature names Effect's three channels (ADR-0078, spec 2026-10-05 §5.2): in EffectScript
 * the return type is A (Pass), the types after `throws` are E (Fail) and the services after `needs`
 * are R (Need); in Effect TypeScript they are the three arguments of `Effect.fn.Return<A, E, R>` or
 * `Effect.Effect<A, E, R>`. The grammar has no scopes for these yet, so this reads the text: the
 * landing page colours its code with it, and the playground decorates both editors with it.
 */
export type Signal = "pass" | "fail" | "need"

export interface SignalRange {
  /** Offsets into the text, end exclusive. */
  readonly start: number
  readonly end: number
  readonly signal: Signal
}

/** The signal colours on Ink (ADR-0078). */
export const signalColours: Readonly<Record<Signal, string>> = { pass: "#4ADE80", fail: "#F87171", need: "#60A5FA" }

/** A line that declares a signature: an `effect`, a service method, a tool or a workflow. */
const signatureLine = /^\s*(export\s+)?(effect\*?|tool|workflow)\b|\b(throws|needs)\b/

/** The pieces a line is read in: whitespace, `=>`, `|>`, names (with dots) and single characters. */
const pieces = /\s+|=>|\|>|[A-Za-z_$][\w$.]*|./g

/** The A, E and R names of one EffectScript line. A clause runs until `{`, `=`, `=>`, `|>` or the end. */
const efxLine = (line: string, offset: number): Array<SignalRange> => {
  if (!signatureLine.test(line)) return []
  const ranges: Array<SignalRange> = []
  let mode: Signal | undefined
  let depth = 0
  let previous = ""
  for (const match of line.matchAll(pieces)) {
    const text = match[0].trim()
    if (text === "throws") mode = "fail"
    else if (text === "needs") mode = "need"
    else if (text.startsWith(":") && depth === 0 && previous === ")" && mode === undefined) mode = "pass"
    else if (["{", "=", "=>", "|>", "key"].includes(text)) mode = undefined
    else if (mode !== undefined && /^[A-Za-z_$]/.test(text)) {
      ranges.push({ start: offset + match.index, end: offset + match.index + match[0].length, signal: mode })
    }
    for (const char of match[0]) depth += char === "(" ? 1 : char === ")" ? -1 : 0
    if (text !== "") previous = text.at(-1)!
  }
  return ranges
}

/** The arguments of each `Effect.fn.Return<…>` and `Effect.Effect<…>`: A, then E, then R. */
const tsSignals = (text: string): Array<SignalRange> => {
  const ranges: Array<SignalRange> = []
  const order: ReadonlyArray<Signal> = ["pass", "fail", "need"]
  for (const match of text.matchAll(/Effect\.(?:fn\.Return|Effect)</g)) {
    let i = match.index + match[0].length
    let depth = 0
    let argument = 0
    let start = i
    const close = () => {
      const raw = text.slice(start, i)
      const lead = raw.length - raw.trimStart().length
      const trimmed = raw.trim()
      if (trimmed !== "" && argument < 3) {
        ranges.push({ start: start + lead, end: start + lead + trimmed.length, signal: order[argument]! })
      }
    }
    for (; i < text.length; i++) {
      const char = text[i]
      if (char === "<" || char === "(" || char === "[" || char === "{") depth++
      else if ((char === ">" || char === ")" || char === "]" || char === "}") && depth > 0) depth--
      else if (char === ">" && depth === 0) {
        close()
        break
      } else if (char === "," && depth === 0) {
        close()
        argument++
        start = i + 1
      }
    }
  }
  return ranges
}

/** Every signal range in `text`, in order. */
export const signalRanges = (text: string, language: "efx" | "ts"): Array<SignalRange> => {
  if (language === "ts") return tsSignals(text)
  const ranges: Array<SignalRange> = []
  let offset = 0
  for (const line of text.split("\n")) {
    ranges.push(...efxLine(line, offset))
    offset += line.length + 1
  }
  return ranges
}
