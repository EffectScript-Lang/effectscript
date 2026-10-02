/**
 * Doc comments (ADR-0042): standard `/** … *\/` with a CommonMark body. The first paragraph is the
 * summary; fences tagged `efx` are runnable examples; TSDoc block tags end the description.
 *
 * @since 4.0.0
 */
import type { Comment } from "../compiler/parser/parse.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface DocExample {
  readonly title: string
  /** The code lines joined with `\n`, comment prefixes stripped. */
  readonly code: string
  /** The source offset where each code line starts. */
  readonly offsets: ReadonlyArray<number>
  /** 1-based lines of the opening and closing fences. */
  readonly openLine: number
  readonly closeLine: number
}

/**
 * @since 4.0.0
 * @category models
 */
export interface DocTag {
  readonly name: string
  readonly text: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface DocComment {
  readonly start: number
  readonly end: number
  readonly summary: string
  readonly body: string
  readonly examples: ReadonlyArray<DocExample>
  readonly tags: ReadonlyArray<DocTag>
}

interface Line {
  readonly text: string
  /** Source offset of `text[0]`. */
  readonly offset: number
  readonly line: number
}

const lineOf = (source: string, offset: number): number => {
  let line = 1
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

/** The comment's content lines, each with its source position, `*` prefixes and `\r` removed. */
const contentLines = (source: string, start: number, end: number): Array<Line> => {
  const lines: Array<Line> = []
  let offset = start + 3 // after `/**`
  const stop = end - 2 // before `*/`
  let line = lineOf(source, start)
  while (offset <= stop) {
    const newline = source.indexOf("\n", offset)
    const lineEnd = newline === -1 || newline > stop ? stop : newline
    let raw = source.slice(offset, lineEnd)
    let at = offset
    if (raw.endsWith("\r")) raw = raw.slice(0, -1)
    if (lines.length > 0 || at !== start + 3) {
      // a continuation line: drop the indentation and one `*` with one optional space
      const prefix = /^[ \t]*(?:\*(?!\/) ?)?/.exec(raw)![0]
      raw = raw.slice(prefix.length)
      at += prefix.length
    } else if (raw.startsWith(" ")) {
      raw = raw.slice(1)
      at += 1
    }
    lines.push({ text: raw, offset: at, line })
    if (lineEnd === stop) break
    offset = lineEnd + 1
    line++
  }
  // a one-line comment keeps its text; trailing spaces before `*/` are not content
  if (lines.length > 0) {
    const last = lines[lines.length - 1]!
    lines[lines.length - 1] = { ...last, text: last.text.replace(/[ \t]+$/, "") }
  }
  while (lines.length > 0 && lines[0]!.text.trim() === "") lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]!.text.trim() === "") lines.pop()
  return lines
}

const fenceOpen = /^(`{3,}|~{3,})[ \t]*([^\s`]*)([^`]*)$/

/** Offsets of `@tag` starts in a line, outside code spans and `{@…}`. */
const tagStarts = (text: string): Array<number> => {
  const starts: Array<number> = []
  let inCode = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "`") inCode = !inCode
    // a tag name ends at whitespace or the line's end: `@effect/vitest` in prose is not a tag
    else if (
      !inCode && c === "@" && (i === 0 || /\s/.test(text[i - 1]!)) && /^@[A-Za-z][\w-]*(?=\s|$)/.test(text.slice(i))
    ) {
      starts.push(i)
    }
  }
  return starts
}

/**
 * Parses the doc comment spanning `[start, end)` (delimiters included).
 *
 * @since 4.0.0
 * @category parsing
 */
export const parseDocComment = (source: string, start: number, end: number): DocComment => {
  const lines = contentLines(source, start, end)
  const description: Array<string> = []
  const tags: Array<{ name: string; text: Array<string> }> = []
  const examples: Array<DocExample> = []
  let fence: { marker: string; runnable: boolean; open: Line; code: Array<Line>; title: string } | undefined
  let paragraph: Array<string> = []
  let lastParagraph = ""
  const pushText = (text: string) => {
    const tag = tags[tags.length - 1]
    if (tag !== undefined) tag.text.push(text)
    else description.push(text)
  }
  for (const line of lines) {
    if (fence !== undefined) {
      const close = new RegExp(`^${fence.marker[0] === "`" ? "`" : "~"}{${fence.marker.length},}\\s*$`)
      pushText(line.text)
      if (close.test(line.text.trim())) {
        if (fence.runnable) {
          examples.push({
            title: fence.title === "" ? `example ${examples.length + 1}` : fence.title,
            code: fence.code.map((l) => l.text).join("\n"),
            offsets: fence.code.map((l) => l.offset),
            openLine: fence.open.line,
            closeLine: line.line
          })
        }
        fence = undefined
        lastParagraph = ""
      } else {
        fence.code.push(line)
      }
      continue
    }
    const open = fenceOpen.exec(line.text.trimStart())
    const tag = tags[tags.length - 1]
    // fences count in the description and under a TSDoc `@example <title>` tag
    if (open !== null && (tag === undefined || tag.name === "example")) {
      fence = {
        marker: open[1]!,
        runnable: open[2] === "efx" && !/(^|\s)ignore(\s|$)/.test(open[3] ?? ""),
        open: line,
        code: [],
        title: paragraph.length > 0 ? "" : lastParagraph
      }
      if (tag !== undefined) fence.title = tag.text.join(" ").trim()
      else if (paragraph.length > 0) fence.title = paragraph.join(" ").trim().replace(/:$/, "")
      paragraph = []
      pushText(line.text)
      continue
    }
    if (line.text.trim() === "") {
      if (paragraph.length > 0) lastParagraph = paragraph.join(" ").trim().replace(/:$/, "")
      paragraph = []
      pushText("")
      continue
    }
    const starts = tagStarts(line.text)
    let rest = line.text
    if (starts.length > 0) {
      const before = line.text.slice(0, starts[0]).trimEnd()
      if (before !== "") pushText(before)
      for (let i = 0; i < starts.length; i++) {
        const segment = line.text.slice(starts[i]!, starts[i + 1] ?? line.text.length).trim()
        const match = /^@([A-Za-z][\w-]*)\s*([\s\S]*)$/.exec(segment)!
        tags.push({ name: match[1]!, text: match[2] === "" ? [] : [match[2]!] })
      }
      rest = ""
    }
    if (rest !== "") {
      pushText(rest.trimEnd())
      if (tags.length === 0) paragraph.push(rest.trim())
    }
  }
  const text = description.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  const split = text.indexOf("\n\n")
  const firstIsFence = fenceOpen.test(text.split("\n")[0]!.trimStart())
  const summary = firstIsFence ? "" : split === -1 ? text : text.slice(0, split)
  const body = firstIsFence ? text : split === -1 ? "" : text.slice(split + 2)
  return {
    start,
    end,
    summary,
    body,
    examples,
    tags: tags.map((t) => ({ name: t.name, text: t.text.map((l) => l.trim()).join("\n").trim() }))
  }
}

/**
 * The doc comment directly before `start`: the last `/**` block comment with only whitespace and
 * `export`/`default`/`declare` between it and `start`.
 *
 * @since 4.0.0
 * @category parsing
 */
export const docCommentBefore = (
  source: string,
  comments: ReadonlyArray<Comment>,
  start: number
): Comment | undefined => {
  let candidate: Comment | undefined
  for (const comment of comments) {
    if (comment.end > start) break
    candidate = comment
  }
  if (candidate === undefined || candidate.line || source.slice(candidate.start, candidate.start + 3) !== "/**") {
    return undefined
  }
  if (source.slice(candidate.start, candidate.end) === "/**/") return undefined
  const gap = source.slice(candidate.end, start)
  return /^(?:\s|export\b|default\b|declare\b)*$/.test(gap) ? candidate : undefined
}

/**
 * @since 4.0.0
 * @category predicates
 */
export const isModuleDoc = (doc: DocComment): boolean => doc.tags.some((t) => t.name === "module")
