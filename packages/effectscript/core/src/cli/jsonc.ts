/**
 * A minimal JSONC reader that records where each value is, so `efx init` can edit tsconfig.json
 * in place and keep its comments and layout.
 *
 * @since 4.0.0
 */

/**
 * @since 4.0.0
 * @category models
 */
export type JsonNode =
  | {
    readonly kind: "object"
    readonly start: number
    readonly end: number
    readonly entries: ReadonlyArray<{ readonly key: string; readonly value: JsonNode }>
  }
  | { readonly kind: "array"; readonly start: number; readonly end: number; readonly items: ReadonlyArray<JsonNode> }
  | { readonly kind: "value"; readonly start: number; readonly end: number; readonly value: unknown }

/**
 * Parses JSON with comments and trailing commas. Returns `undefined` for invalid input.
 *
 * @since 4.0.0
 * @category parsing
 */
export const parseJsonc = (text: string): JsonNode | undefined => {
  let i = 0
  const skip = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i]!)) i++
      if (text.startsWith("//", i)) {
        const end = text.indexOf("\n", i)
        i = end === -1 ? text.length : end
      } else if (text.startsWith("/*", i)) {
        const end = text.indexOf("*/", i + 2)
        if (end === -1) throw new Error("unterminated comment")
        i = end + 2
      } else {
        return
      }
    }
  }
  const string = (): string => {
    const start = i
    i++
    while (i < text.length && text[i] !== "\"") i += text[i] === "\\" ? 2 : 1
    i++
    return JSON.parse(text.slice(start, i))
  }
  const value = (): JsonNode => {
    skip()
    const start = i
    if (text[i] === "{") {
      i++
      const entries: Array<{ key: string; value: JsonNode }> = []
      for (;;) {
        skip()
        if (text[i] === "}") break
        const key = string()
        skip()
        if (text[i++] !== ":") throw new Error("expected :")
        entries.push({ key, value: value() })
        skip()
        if (text[i] === ",") i++
      }
      i++
      return { kind: "object", start, end: i, entries }
    }
    if (text[i] === "[") {
      i++
      const items: Array<JsonNode> = []
      for (;;) {
        skip()
        if (text[i] === "]") break
        items.push(value())
        skip()
        if (text[i] === ",") i++
      }
      i++
      return { kind: "array", start, end: i, items }
    }
    if (text[i] === "\"") return { kind: "value", start, end: (string(), i), value: JSON.parse(text.slice(start, i)) }
    const match = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i))
    if (match === null) throw new Error("unexpected token")
    i += match[0].length
    return { kind: "value", start, end: i, value: JSON.parse(match[0]) }
  }
  try {
    const root = value()
    skip()
    return i === text.length ? root : undefined
  } catch {
    return undefined
  }
}

/**
 * The entry `key` of an object node.
 *
 * @since 4.0.0
 * @category parsing
 */
export const member = (node: JsonNode | undefined, key: string): JsonNode | undefined =>
  node?.kind === "object" ? node.entries.find((e) => e.key === key)?.value : undefined
