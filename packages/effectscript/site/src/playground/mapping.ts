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
 * Groups the mappings into links. An inserted chunk joins a rewritten part on its source line: the
 * nearest one before it, or after it when there is none before (`effect ` claims
 * `= Effect.fn("greet")(function*`, `|>` claims the `,` in front of it). The imports at the top are
 * the prelude, and insertions that are only whitespace are dropped.
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
    // a chunk that closes something (`) {}`, `, { concurrency }`) belongs to the line it closes
    let anchor = seg.s
    const closer = /^[)\]}>,;]/.test(text.trimStart())
    if (closer) { while (anchor > 0 && /\s/.test(source[anchor - 1]!)) anchor-- }
    const line = lineOf(source, anchor)
    let nearest: (typeof edits)[number] | undefined
    let distance = Infinity
    for (const edit of edits) {
      if (lineOf(source, edit.source[0]) !== line && lineOf(source, edit.source[1] - 1) !== line) continue
      // a closer belongs to the line's first edit (the statement's head); anything else to the
      // nearest edit before it, or after it when there is none before
      const d = closer
        ? edit.source[0]
        : anchor >= edit.source[1]
        ? anchor - edit.source[1]
        : anchor < edit.source[0]
        ? 1e6 + edit.source[0] - anchor
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

/**
 * A concept and what it became: an `await` expression, an effect function's signature, a pipeline
 * step, a typed error, a field. The playground lights the whole phrase on both sides, not only
 * the rewritten keyword.
 */
export interface Concept {
  readonly kind: string
  readonly source: readonly [number, number]
  /** What it became: usually one range; a service method also becomes an accessor further down. */
  readonly generated: ReadonlyArray<readonly [number, number]>
}

/** The parts of an acorn node the concept walk reads. */
interface AstNode {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [key: string]: unknown
}

const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && typeof (value as AstNode).type === "string" &&
  typeof (value as AstNode).start === "number"

/** Statements that are concepts of their own when nothing more specific contains the pointer. */
const statements = new Set([
  "VariableDeclaration",
  "ExpressionStatement",
  "ReturnStatement",
  "IfStatement",
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
  "WhileStatement",
  "TryStatement",
  "ImportDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration"
])

const trim = (text: string, [start, end]: readonly [number, number]): readonly [number, number] => {
  let s = start
  let e = end
  while (s < e && /\s/.test(text[s]!)) s++
  while (e > s && /\s/.test(text[e - 1]!)) e--
  return [s, e]
}

/**
 * The concepts of a program, each with the output it became: the span of every generated range
 * that its source produced (the compile is in place, so one concept's output is contiguous).
 */
export const toConcepts = (
  program: unknown,
  source: string,
  code: string,
  links: ReadonlyArray<Link>
): Array<Concept> => {
  const generatedOf = (range: readonly [number, number]): Array<readonly [number, number]> => {
    const [start, end] = range
    // text the compiler inserts just before a concept (the `,` before a pipeline step) belongs to it
    let reach = start
    while (reach > 0 && /\s/.test(source[reach - 1]!)) reach--
    const pieces: Array<[number, number]> = []
    for (const link of links) {
      if (link.kind === "prelude") continue
      const [ls, le] = link.source
      if (ls === le ? ls < reach || ls > end : ls >= end || le <= start) continue
      if (link.kind === "verbatim") {
        const g = link.generated[0]!
        pieces.push([g[0] + Math.max(start, ls) - ls, g[0] + Math.min(end, le) - ls])
      } else {
        for (const [gs, ge] of link.generated) pieces.push([gs, ge])
      }
    }
    // pieces that touch, or are apart only by whitespace, are one range
    pieces.sort((a, b) => a[0] - b[0])
    const merged: Array<[number, number]> = []
    for (const piece of pieces) {
      const last = merged.at(-1)
      if (last !== undefined && code.slice(last[1], piece[0]).trim() === "" && piece[0] >= last[0]) {
        last[1] = Math.max(last[1], piece[1])
      } else merged.push([...piece])
    }
    return merged.map((r) => trim(code, r)).filter(([a, b]) => b > a)
  }
  const word = (node: AstNode) => /^[A-Za-z*]+/.exec(source.slice(node.start, node.end))?.[0] ?? node.type
  const piped = (node: AstNode) => {
    const before = source.slice(Math.max(0, node.start - 40), node.start)
    return /\|>\s*$/.test(before) ? source.lastIndexOf("|>", node.start) : -1
  }
  const concepts: Array<Concept> = []
  const add = (kind: string, range: readonly [number, number]) => {
    const sourceRange = trim(source, range)
    if (sourceRange[0] >= sourceRange[1]) return
    const generated = generatedOf(sourceRange)
    if (generated.length > 0) concepts.push({ kind, source: sourceRange, generated })
  }
  const visit = (node: AstNode, parent: AstNode | undefined, owner: string | undefined) => {
    const exportStart = parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportDefaultDeclaration"
      ? parent.start
      : node.start
    const body = node.body as AstNode | undefined
    switch (node.type) {
      case "AwaitExpression": {
        const argument = node.argument as AstNode | undefined
        add(argument?.type === "ArrayExpression" || argument?.type === "ObjectExpression" ? "await-all" : "await", [
          node.start,
          node.end
        ])
        break
      }
      case "ThrowStatement":
        add("throw", [node.start, node.end])
        break
      case "FunctionDeclaration":
        if (body !== undefined) add(word(node) === "effect" ? "effect-function" : "function", [exportStart, body.start])
        break
      case "MainStatement":
        if (body !== undefined) add("main", [node.start, body.start])
        break
      case "MatchExpression": {
        const discriminant = node.discriminant as AstNode
        add("match", [node.start, source.indexOf("{", discriminant.end) + 1])
        break
      }
      case "MatchArm":
        add("match-arm", [node.start, node.end])
        break
      case "ClassDeclaration":
        add(word(node), [exportStart, node.end])
        break
      case "MethodDefinition":
        add(owner === "service" ? "service-method" : "method", [node.start, node.end])
        break
      case "PropertyDefinition":
        add("field", [node.start, node.end])
        break
      case "CallExpression":
      case "Identifier":
      case "MemberExpression": {
        // a call's callee is part of the call's pipeline step, not a step of its own
        const pipe = parent?.type === "CallExpression" && parent.callee === node ? -1 : piped(node)
        if (pipe >= 0) add("pipe", [pipe, node.end])
        else if (node.type === "CallExpression") {
          const callee = node.callee as AstNode | undefined
          const object = callee?.object as AstNode | undefined
          if (callee?.type === "MemberExpression" && object?.type === "Identifier" && object.name === "console") {
            add("log", [node.start, node.end])
          }
        }
        break
      }
      default:
        if (statements.has(node.type)) add("statement", [node.start, node.end])
        else if (/(Declaration|Statement)$/.test(node.type) && !/^(Export|Block|Empty)/.test(node.type)) {
          add(word(node), [exportStart, node.end])
        }
    }
    const nextOwner = node.type === "ClassDeclaration" ? word(node) : owner
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range") continue
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) visit(child, node, nextOwner)
      } else if (isNode(value)) visit(value, node, nextOwner)
    }
  }
  if (isNode(program)) visit(program, undefined, undefined)
  return concepts
}

/** The innermost concept at an offset, on either side. */
export const conceptAt = (
  concepts: ReadonlyArray<Concept>,
  offset: number,
  side: "source" | "generated"
): Concept | undefined => {
  const size = (concept: Concept) =>
    side === "source"
      ? concept.source[1] - concept.source[0]
      : concept.generated.reduce((sum, [a, b]) => sum + b - a, 0)
  let best: Concept | undefined
  for (const concept of concepts) {
    const ranges = side === "source" ? [concept.source] : concept.generated
    if (!ranges.some(([start, end]) => offset >= start && offset < end)) continue
    if (best === undefined || size(concept) < size(best)) best = concept
  }
  return best
}

/** What a concept means, in one line. */
export const describeConcept = (concept: Concept, source: string, code: string): string => {
  const notes: Readonly<Record<string, string>> = {
    "effect-function":
      "an effect function becomes Effect.fn: a named, traced span, with success, error and requirements in its type",
    function: "a function, as written",
    await: "await runs an effect: yield*",
    "await-all": "awaiting a literal array or object runs the effects together: Effect.all",
    pipe: "a pipeline step: the combinator wraps the effect",
    log: "console logs through Effect, inside the function's span",
    throw: "throw fails with the typed error: yield* the error",
    error: "a typed error: a Schema.TaggedError class, its fields a Schema",
    schema: "a Schema class: the type and its decoder from one declaration",
    service: "a service: a Context.Service tag, with an accessor for each method",
    "service-method": "a method's signature as an Effect type: success, error, requirements",
    field: "a field and its Schema",
    main: "the entry point: run with the layers it needs",
    match: "match becomes Effect's Match: Match.valueTags when every arm is a tag, exhaustive either way",
    "match-arm": "an arm becomes a handler: the tag, its fields as the parameter, the result as the body",
    config: "typed configuration, read from the environment with Config",
    layer: "a layer that builds services from others",
    test: "a test on @effect/vitest",
    describe: "a suite on @effect/vitest, with its layer"
  }
  const note = notes[concept.kind]
  if (note !== undefined) return note
  const same = source.slice(...concept.source).replace(/\s+/g, " ") ===
    concept.generated.map((r) => code.slice(...r)).join(" ").replace(/\s+/g, " ")
  return same ? "kept as written" : "rewritten by the compiler"
}
