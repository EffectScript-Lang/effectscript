/**
 * How each part of an EffectScript file becomes TypeScript, for the playground's live mapping
 * (ADR-0084). The compiler's Volar mappings (`CompileResult.mappings`) pair source and generated
 * ranges: verbatim runs are copied, edited chunks are rewritten (`await` → `yield*`), and
 * zero-length chunks are text the compiler inserts (`= Effect.fn("greet")(function*`). This groups
 * them into links: one source part and every generated range it produced.
 */

/** A source range and the generated ranges it became. Offsets are end-exclusive pairs. */
export interface Link {
  readonly source: readonly [number, number]
  readonly generated: ReadonlyArray<readonly [number, number]>
  /** `edit`: rewritten; `prelude`: the imports the compiler adds; `verbatim`: copied as written. */
  readonly kind: "edit" | "prelude" | "verbatim"
}

/** The part of a mapping the playground needs (a structural subset of Volar's `CodeMapping`). */
export interface MappingLike {
  readonly sourceOffsets: ReadonlyArray<number>
  readonly generatedOffsets: ReadonlyArray<number>
  readonly lengths: ReadonlyArray<number>
  readonly generatedLengths?: ReadonlyArray<number> | undefined
  readonly data: { readonly semantic?: boolean | undefined }
}

const lineOf = (text: string, offset: number) => {
  let line = 0
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/**
 * Groups the mappings into links. An inserted chunk joins the nearest rewritten part on the same
 * source line (`effect ` claims `= Effect.fn("greet")(function*`, `|>` claims the closing `)`), the
 * imports at the top are the prelude, and insertions that are only whitespace are dropped.
 */
export const toLinks = (source: string, code: string, mappings: ReadonlyArray<MappingLike>): Array<Link> => {
  const segments = mappings.map((m) => {
    const s = m.sourceOffsets[0]!
    const g = m.generatedOffsets[0]!
    const length = m.lengths[0]!
    const generatedLength = m.generatedLengths?.[0] ?? length
    return { s, g, length, generatedLength, verbatim: m.data.semantic === true }
  })
  const links: Array<{ source: [number, number]; generated: Array<[number, number]>; kind: Link["kind"] }> = []
  const edits: Array<(typeof links)[number]> = []
  for (const seg of segments) {
    if (seg.verbatim && seg.length > 0) {
      links.push({
        source: [seg.s, seg.s + seg.length],
        generated: [[seg.g, seg.g + seg.generatedLength]],
        kind: "verbatim"
      })
    } else if (seg.length > 0) {
      const link = {
        source: [seg.s, seg.s + seg.length] as [number, number],
        generated: [[seg.g, seg.g + seg.generatedLength] as [number, number]],
        kind: "edit" as const
      }
      links.push(link)
      edits.push(link)
    }
  }
  const orphans: Array<(typeof links)[number]> = []
  for (const seg of segments) {
    if (seg.length > 0 || seg.generatedLength === 0) continue
    const text = code.slice(seg.g, seg.g + seg.generatedLength)
    if (text.trim() === "") continue
    const range: [number, number] = [seg.g, seg.g + seg.generatedLength]
    if (/^\s*import\b/.test(text) && lineOf(source, seg.s) === 0 && seg.g === 0) {
      links.push({ source: [seg.s, seg.s], generated: [range], kind: "prelude" })
      continue
    }
    const line = lineOf(source, seg.s)
    let nearest: (typeof edits)[number] | undefined
    let distance = Infinity
    for (const edit of edits) {
      if (lineOf(source, edit.source[0]) !== line && lineOf(source, edit.source[1] - 1) !== line) continue
      const d = seg.s < edit.source[0]
        ? edit.source[0] - seg.s
        : seg.s >= edit.source[1]
        ? seg.s - edit.source[1] + 1
        : 0
      if (d < distance) {
        distance = d
        nearest = edit
      }
    }
    if (nearest === undefined) orphans.push({ source: [seg.s, seg.s], generated: [range], kind: "edit" })
    else nearest.generated.push(range)
  }
  return [...links, ...orphans].sort((a, b) => a.source[0] - b.source[0] || a.generated[0]![0] - b.generated[0]![0])
}

const inside = (range: readonly [number, number], offset: number) =>
  range[0] === range[1] ? offset === range[0] : offset >= range[0] && offset < range[1]

/** The word at `offset` in `text`, or the single character there. */
const wordAt = (text: string, offset: number): readonly [number, number] => {
  const isWord = (c: string | undefined) => c !== undefined && /[\w$]/.test(c)
  if (!isWord(text[offset])) return [offset, offset + 1]
  let start = offset
  let end = offset
  while (isWord(text[start - 1])) start--
  while (isWord(text[end])) end++
  return [start, end]
}

/**
 * What to show for a position in the source: a rewritten part with everything it became, or, in
 * copied text, the word there and its twin in the output.
 */
export const fromSource = (links: ReadonlyArray<Link>, source: string, offset: number): Link | undefined => {
  const edit = links.find((l) => l.kind === "edit" && inside(l.source, offset))
  if (edit !== undefined) return edit
  const copied = links.find((l) => l.kind === "verbatim" && inside(l.source, offset))
  if (copied === undefined) return undefined
  const [start, end] = wordAt(source, offset)
  const from = Math.max(start, copied.source[0])
  const to = Math.min(end, copied.source[1])
  const shift = copied.generated[0]![0] - copied.source[0]
  return { source: [from, to], generated: [[from + shift, to + shift]], kind: "verbatim" }
}

/** The same, for a position in the output: the link whose generated text contains it. */
export const fromGenerated = (links: ReadonlyArray<Link>, code: string, offset: number): Link | undefined => {
  const owner = links.find((l) => l.kind !== "verbatim" && l.generated.some((g) => inside(g, offset)))
  if (owner !== undefined) return owner
  const copied = links.find((l) => l.kind === "verbatim" && inside(l.generated[0]!, offset))
  if (copied === undefined) return undefined
  const [start, end] = wordAt(code, offset)
  const from = Math.max(start, copied.generated[0]![0])
  const to = Math.min(end, copied.generated[0]![1])
  const shift = copied.source[0] - copied.generated[0]![0]
  return { source: [from + shift, to + shift], generated: [[from, to]], kind: "verbatim" }
}

/** The output offset that lines up with a source offset, for scrolling the output with the source. */
export const toGeneratedOffset = (links: ReadonlyArray<Link>, offset: number): number => {
  let best: Link | undefined
  for (const link of links) {
    if (link.source[0] <= offset) best = link
    else break
  }
  if (best === undefined) return 0
  const [start, end] = best.source
  const g = best.generated[0]!
  return best.kind === "verbatim" ? g[0] + Math.min(offset - start, end - start) : g[0]
}

/** One line on what a rewrite means, for the most common constructs. */
export const explain = (sourceText: string): string | undefined => {
  const text = sourceText.trim()
  const table: ReadonlyArray<readonly [RegExp, string]> = [
    [/^effect\*?$/, "an effect function: a named, traced Effect.fn"],
    [/^await$/, "runs an effect: yield*"],
    [/^throws$/, "the error channel (E) of the return type"],
    [/^needs$/, "the requirements channel (R) of the return type"],
    [/^\|>$/, "a pipeline step: the combinator wraps the effect"],
    [/^error$/, "a typed error: a Schema.TaggedError class"],
    [/^schema$/, "a Schema class: the type and its decoder"],
    [/^service$/, "a service: a Context tag with an accessor"],
    [/^layer$/, "a layer that builds the service"],
    [/^config$/, "typed configuration, read with Config"],
    [/^main$/, "the entry point: run with the layers it needs"],
    [/^match$/, "pattern matching on Effect's Match"],
    [/^defer$/, "a finalizer that runs on every exit"],
    [/^console\.\w+$/, "logging through Effect"],
    [/^(string|number|boolean)$/, "a field type as its Schema"],
    [/^test$|^describe$/, "a test on @effect/vitest"]
  ]
  return table.find(([pattern]) => pattern.test(text))?.[1]
}
