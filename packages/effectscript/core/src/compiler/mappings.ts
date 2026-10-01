/**
 * Converts magic-string's hi-res decoded source map into Volar `CodeMapping`s.
 *
 * Unchanged text produces one segment per character. Runs where both offsets advance together
 * become one mapping. An isolated segment is an edited chunk, mapped as a whole range.
 *
 * @since 0.1.0
 */
import type { MagicString } from "magic-string"
import type { CodeInformation, CodeMapping } from "./options.ts"

/**
 * @since 0.1.0
 * @category constants
 */
export const fullFeatures: CodeInformation = {
  verification: true,
  completion: true,
  semantic: true,
  navigation: true,
  structure: true,
  format: false
}

const lineStarts = (text: string): Array<number> => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return starts
}

/**
 * @since 0.1.0
 * @category mappings
 */
export const toCodeMappings = (s: MagicString, source: string, code: string): Array<CodeMapping> => {
  const decoded = s.generateDecodedMap({ hires: true, includeContent: false })
  const sourceLines = lineStarts(source)
  const codeLines = lineStarts(code)
  const points: Array<readonly [number, number]> = []
  decoded.mappings.forEach((line, generatedLine) => {
    for (const segment of line) {
      if (segment.length < 4) continue
      points.push([codeLines[generatedLine]! + segment[0], sourceLines[segment[2]!]! + segment[3]!])
    }
  })
  const mappings: Array<CodeMapping> = []
  let i = 0
  while (i < points.length) {
    const [generated, original] = points[i]!
    let j = i
    while (
      j + 1 < points.length &&
      points[j + 1]![0] === points[j]![0] + 1 &&
      points[j + 1]![1] === points[j]![1] + 1
    ) j++
    const next = points[j + 1]
    if (j > i) {
      mappings.push({
        sourceOffsets: [original],
        generatedOffsets: [generated],
        lengths: [points[j]![0] - generated + 1],
        data: fullFeatures
      })
    } else {
      const generatedLength = (next === undefined ? code.length : next[0]) - generated
      const sourceLength = next !== undefined && next[1] > original ? next[1] - original : generatedLength
      mappings.push(
        generatedLength === sourceLength
          ? { sourceOffsets: [original], generatedOffsets: [generated], lengths: [sourceLength], data: fullFeatures }
          : {
            sourceOffsets: [original],
            generatedOffsets: [generated],
            lengths: [sourceLength],
            generatedLengths: [generatedLength],
            data: fullFeatures
          }
      )
    }
    i = j + 1
  }
  return mappings
}
