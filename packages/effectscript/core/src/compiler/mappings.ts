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

/**
 * For edited or generated text (a rewritten keyword, inserted Effect calls): diagnostics map back to
 * the source, but completion, navigation, rename and hover don't (review D10).
 *
 * @since 0.1.0
 * @category constants
 */
export const generatedFeatures: CodeInformation = {
  verification: true,
  completion: false,
  semantic: false,
  navigation: false,
  structure: false,
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
    // A run is consecutive, unchanged characters. An edited chunk starts with one segment that can
    // look like the continuation of the previous run, so runs also require matching characters.
    const same = (point: readonly [number, number]) => code[point[0]] === source[point[1]]
    let j = i
    while (
      same(points[i]!) &&
      j + 1 < points.length &&
      points[j + 1]![0] === points[j]![0] + 1 &&
      points[j + 1]![1] === points[j]![1] + 1 &&
      same(points[j + 1]!)
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
      // A chunk whose text is unchanged is user code; anything else was edited or generated.
      const sourceText = source.slice(original, original + sourceLength)
      const verbatim = generatedLength === sourceLength &&
        sourceText === code.slice(generated, generated + generatedLength)
      let common = 0
      if (!verbatim) {
        while (
          common < sourceLength && common < generatedLength && source[original + common] === code[generated + common]
        ) common++
      }
      if (common > 0 && !verbatim) {
        // user text followed by inserted text (`e` → `e)`): the user text keeps full features
        mappings.push({
          sourceOffsets: [original],
          generatedOffsets: [generated],
          lengths: [common],
          data: fullFeatures
        })
        if (sourceLength > common) {
          mappings.push({
            sourceOffsets: [original + common],
            generatedOffsets: [generated + common],
            lengths: [sourceLength - common],
            generatedLengths: [generatedLength - common],
            data: generatedFeatures
          })
        }
        i = j + 1
        continue
      }
      const data = verbatim ? fullFeatures : generatedFeatures
      mappings.push(
        generatedLength === sourceLength
          ? { sourceOffsets: [original], generatedOffsets: [generated], lengths: [sourceLength], data }
          : {
            sourceOffsets: [original],
            generatedOffsets: [generated],
            lengths: [sourceLength],
            generatedLengths: [generatedLength],
            data
          }
      )
    }
    i = j + 1
  }
  return mappings
}
