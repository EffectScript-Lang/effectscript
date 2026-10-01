/**
 * Character-level scanners used for parser lookahead decisions.
 *
 * @since 0.1.0
 */

const closer: Record<string, string> = { "(": ")", "[": "]", "{": "}" }

/**
 * Returns the index just past the bracket matching `input[open]`, or -1.
 * Skips strings, template literals (with nested `${}`), and comments.
 *
 * @since 0.1.0
 */
export const skipBalanced = (input: string, open: number): number => {
  const stack: Array<string> = []
  let i = open
  while (i < input.length) {
    const ch = input[i]!
    if (ch === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i)
      i = nl === -1 ? input.length : nl
      continue
    }
    if (ch === "/" && input[i + 1] === "*") {
      const close = input.indexOf("*/", i + 2)
      i = close === -1 ? input.length : close + 2
      continue
    }
    if (ch === "\"" || ch === "'") {
      i = skipString(input, i, ch)
      continue
    }
    if (ch === "`") {
      i = skipTemplate(input, i)
      continue
    }
    const close = closer[ch]
    if (close !== undefined) {
      stack.push(close)
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1
      if (stack.length === 0) return i + 1
    }
    i++
  }
  return -1
}

const skipString = (input: string, start: number, quote: string): number => {
  let i = start + 1
  while (i < input.length && input[i] !== quote) {
    if (input[i] === "\\") i++
    i++
  }
  return i + 1
}

const skipTemplate = (input: string, start: number): number => {
  let i = start + 1
  while (i < input.length && input[i] !== "`") {
    if (input[i] === "\\") {
      i += 2
      continue
    }
    if (input[i] === "$" && input[i + 1] === "{") {
      const end = skipBalanced(input, i + 1)
      if (end === -1) return input.length
      i = end
      continue
    }
    i++
  }
  return i + 1
}

/**
 * Returns the index of the next character that is not whitespace or part of a comment.
 *
 * @since 0.1.0
 */
export const skipSpace = (input: string, index: number): number => {
  let i = index
  while (i < input.length) {
    const ch = input[i]!
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++
    } else if (ch === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i)
      i = nl === -1 ? input.length : nl
    } else if (ch === "/" && input[i + 1] === "*") {
      const close = input.indexOf("*/", i + 2)
      i = close === -1 ? input.length : close + 2
    } else {
      break
    }
  }
  return i
}
