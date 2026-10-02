# EffectScript Plan 12: Living docs implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doc comments written once at the definition, `efx` examples that run as doctests
(`doctest "./x.efx" with Layer`), and `efx docs`, which writes signature-first Markdown pages that
Blume serves.

**Architecture:** `src/docs/` is a new syntactic pipeline built on the existing acorn parser:
- `comment.ts` parses doc comments.
- `model.ts` builds a per-module model of exported declarations.
- `render.ts` writes Markdown.
- `examples.ts` rewrites `// =>` assertions.
- `doctest.ts` builds the virtual test module.

The compiler gains only the `doctest` statement. The Vite plugin serves `?doctest` modules. The CLI
gains `efx docs`, and `efx init` sets up Blume in `docs/`.

**Tech Stack:** TypeScript 6, acorn and acorn-typescript (the existing parser), magic-string,
Vitest 5 with `@effect/vitest`, `effect/cli`, Vite 8, Blume 2.1.0 (users' projects only).

**Spec:** `docs/superpowers/specs/2026-10-03-effectscript-docs-design.md`. Decisions: ADR-0042 and
ADR-0043. Main spec: `docs/superpowers/specs/2026-10-02-effectscript-design.md`.

## Global Constraints

- The compiler is syntactic and single-file (ADR-0017). `toTypeScript` never parses doc comments.
- The superset identity test (`test/superset.test.ts`) must keep passing. Valid TypeScript never
  changes meaning.
- No new runtime dependencies in `effectscript`. Blume is installed only by users (`efx init`
  prints the install hint).
- Diagnostic codes are exactly EFX9301–EFX9307, with the severities in spec §4.
- Doc comments are standard `/** */` with a CommonMark body. No `@param`/`@returns`/`@throws` are
  required (ADR-0042).
- Runnable examples are fences whose info string's first word is `efx`, unless the info string also
  has the word `ignore`. The assertions are `expr // => expected`, `await e // => throws Name` and
  `await e // => dies`.
- The Blume project lives in `docs/` with `content: { root: "." , exclude: ["**/_*", "**/.*", "dist/**", "node_modules/**"] }`.
- Anchors are GitHub slugs: lowercase, and drop every character except `a-z0-9`, `_`, `-` and space,
  then spaces → `-`.
- Use `pnpm` from the repo root. Never run bare `pnpm test`. Use `pnpm test --run <files>`.
- The CLI is dogfooded: edit `src/cli/main.efx`, then run `pnpm codegen` (from
  `packages/effectscript/core`, or the root) to regenerate `src/cli/main.ts`. Never hand-edit
  `main.ts`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **CRLF sources and `*`-less doc lines.** A Windows file, or a doc comment whose lines don't start
   with ` * `, must still give correct summaries, examples, and line numbers for doctest failures.
   Tests go in Task 1 (comment parser) and Task 5 (line preservation).
2. **A doctest target with `main`.** Importing it would run the program, so EFX9307 must fail it
   before anything is imported. Test in Task 5.
3. **Fence variants.** `~~~efx`, four-backtick fences, and info strings such as ` ```efx title="x" `
   are runnable. ` ```ts ` and ` ```efx-ignore ` are not. A ` @tag ` line inside a fence is code,
   not a tag. Test in Task 1.
4. **Exports that aren't plain declarations.** `export { a, b }`, `export default`, `export * from`,
   and re-exports must not crash the model. Local `export { a }` documents `a`. Re-exports are
   skipped. Test in Task 2.
5. **`src/index.efx` and same-named declarations.** The root index module merges into `index.md`,
   and two modules declaring `Users` link to their own pages. Test in Task 3.

---

## File structure

| File | Responsibility |
| --- | --- |
| `core/src/docs/comment.ts` (create) | Find a declaration's doc comment, then split it into summary, body, examples (with source positions) and tags |
| `core/src/docs/model.ts` (create) | `DocModule`/`DocDeclaration` from a parsed file: exports, signatures as written, A/E/R, members, relative imports, `main` |
| `core/src/docs/render.ts` (create) | Markdown pages and the index, with links and slugs |
| `core/src/docs/examples.ts` (create) | Rewrite the `// =>` assertions of one example, with EFX9301–9303 |
| `core/src/docs/doctest.ts` (create) | Build the `?doctest` virtual module source for a file (EFX9305, EFX9307) |
| `core/src/docs/index.ts` (create) | Barrel for the docs pipeline (`effectscript/docs/index`), used by the CLI |
| `core/src/doctest.ts` (create) | Runtime helpers `assertDoc` and `failsWith` (`effectscript/doctest`) |
| `core/src/blume.ts` (create) | `effectscript()` Astro integration (`effectscript/blume`) |
| `core/grammars/*.json` (create) | Copies of the VS Code grammars |
| `core/src/compiler/parser/plugin.ts` (modify) | Parse `DoctestStatement` |
| `core/src/compiler/transform/test.ts` (modify) | Lower `DoctestStatement`, EFX9304 |
| `core/src/compiler/transform/command.ts` (modify) | `jsdocBefore` delegates to `comment.ts` |
| `core/src/vite.ts` (modify) | `load` hook for `?doctest`, and compiling `?doctest` ids |
| `core/src/cli/docs.ts` (create) | `docsProject`: collect files, model them, check, render, write |
| `core/src/cli/main.efx` → `main.ts` (modify, then codegen) | The `docs` subcommand |
| `core/src/cli/init.ts` (modify) | Blume scaffold, scripts, `.gitignore` |
| `core/package.json` (modify) | `files` gains `grammars/*.json` |
| `examples/src/bank.efx`, `examples/test/bank.test.efx` (create) | Dogfood: a documented module and its doctests |

---

### Task 1: Doc-comment parser

**Files:**
- Create: `packages/effectscript/core/src/docs/comment.ts`
- Modify: `packages/effectscript/core/src/compiler/transform/command.ts` (`jsdocBefore`)
- Test: `packages/effectscript/core/test/docs-comment.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DocExample {
    readonly title: string
    readonly code: string                      // the code lines joined with "\n", prefixes stripped
    readonly offsets: ReadonlyArray<number>    // source offset where each code line starts
    readonly openLine: number                  // 1-based line of the opening fence
    readonly closeLine: number                 // 1-based line of the closing fence
  }
  export interface DocTag { readonly name: string; readonly text: string }
  export interface DocComment {
    readonly start: number; readonly end: number  // the comment, delimiters included
    readonly summary: string; readonly body: string
    readonly examples: ReadonlyArray<DocExample>
    readonly tags: ReadonlyArray<DocTag>
  }
  export const docCommentBefore: (source: string, comments: ReadonlyArray<Comment>, start: number) => Comment | undefined
  export const parseDocComment: (source: string, start: number, end: number) => DocComment
  export const isModuleDoc: (doc: DocComment) => boolean    // has a @module tag
  ```
  `Comment` is `{ start, end, line }` from `compiler/parser/parse.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/docs-comment.test.ts
import { describe, expect, it } from "vitest"
import { parse } from "../src/compiler/parser/parse.ts"
import { docCommentBefore, isModuleDoc, parseDocComment } from "../src/docs/comment.ts"
import { jsdocBefore } from "../src/compiler/transform/command.ts"

const doc = (source: string) => {
  const start = source.indexOf("/**")
  return parseDocComment(source, start, source.indexOf("*/", start) + 2)
}

describe("parseDocComment", () => {
  it("splits summary, body, examples and tags", () => {
    const source = [
      "/**",
      " * Moves money.",
      " * Atomically.",
      " *",
      " * Both or neither.",
      " *",
      " * Moving money:",
      " *",
      " * ```efx",
      " * transfer(a) // => 1",
      " * ```",
      " *",
      " * @since 1.2.0",
      " * @deprecated use",
      " *   move instead",
      " */"
    ].join("\n")
    const d = doc(source)
    expect(d.summary).toBe("Moves money.\nAtomically.")
    expect(d.body).toBe("Both or neither.\n\nMoving money:\n\n```efx\ntransfer(a) // => 1\n```")
    expect(d.tags).toEqual([{ name: "since", text: "1.2.0" }, { name: "deprecated", text: "use\nmove instead" }])
    expect(d.examples).toHaveLength(1)
    const [example] = d.examples
    expect(example!.title).toBe("Moving money")
    expect(example!.code).toBe("transfer(a) // => 1")
    expect(example!.openLine).toBe(9)
    expect(example!.closeLine).toBe(11)
    expect(source.slice(example!.offsets[0]!, example!.offsets[0]! + 8)).toBe("transfer")
  })

  it("numbers untitled examples and ignores other languages", () => {
    const d = doc("/**\n * ```efx\n * a\n * ```\n * ```ts\n * b\n * ```\n * ```efx ignore\n * z\n * ```\n * ~~~efx title=\"x\"\n * c\n * ~~~\n */")
    expect(d.summary).toBe("")
    expect(d.examples.map((e) => [e.title, e.code])).toEqual([["example 1", "a"], ["example 2", "c"]])
  })

  it("treats @ lines inside fences as code and supports four-backtick fences", () => {
    const d = doc("/**\n * ````efx\n * @decorator\n * ```\n * ````\n */")
    expect(d.tags).toEqual([])
    expect(d.examples[0]!.code).toBe("@decorator\n```")
  })

  it("handles one-line comments, lines without *, and CRLF", () => {
    expect(doc("/** Just a summary. */").summary).toBe("Just a summary.")
    const crlf = doc("/**\r\n * Sum.\r\n *\r\n * ```efx\r\n * 1 // => 1\r\n * ```\r\n */")
    expect(crlf.summary).toBe("Sum.")
    expect(crlf.examples[0]!.code).toBe("1 // => 1")
    expect(crlf.examples[0]!.openLine).toBe(4)
    const bare = doc("/**\n  Sum.\n\n  ```efx\n  2 // => 2\n  ```\n*/")
    expect(bare.summary).toBe("Sum.")
    expect(bare.examples[0]!.code).toBe("2 // => 2")
  })

  it("finds inline tags only at word starts, not in emails, code spans or {@link}", () => {
    const d = doc("/** Mail a@b.com, see `@x` and {@link Y}. @alias p */")
    expect(d.summary).toBe("Mail a@b.com, see `@x` and {@link Y}.")
    expect(d.tags).toEqual([{ name: "alias", text: "p" }])
  })

  it("recognizes module docs", () => {
    expect(isModuleDoc(doc("/**\n * Bank.\n *\n * @module\n */"))).toBe(true)
    expect(isModuleDoc(doc("/** @license MIT */"))).toBe(false)
  })
})

describe("docCommentBefore", () => {
  const find = (source: string, marker: string) => {
    const parsed = parse(source)
    if (parsed._tag === "Failure") throw new Error("parse")
    const c = docCommentBefore(source, parsed.comments, source.indexOf(marker))
    return c === undefined ? undefined : source.slice(c.start, c.end)
  }
  it("takes the last /** */ directly before, through export", () => {
    expect(find("/** a */\n/** b */\nexport const x = 1", "export")).toBe("/** b */")
  })
  it("rejects line comments, plain block comments and code in between", () => {
    expect(find("/** a */\n// note\nconst x = 1", "const")).toBeUndefined()
    expect(find("/* a */\nconst x = 1", "const")).toBeUndefined()
    expect(find("/** a */\nconst y = 2\nconst x = 1", "const x")).toBeUndefined()
  })
})

describe("jsdocBefore (command help) keeps its behavior", () => {
  it("flattens the description and reads @alias", () => {
    const source = "/** The tsconfig.json to build @alias p */ --project"
    expect(jsdocBefore(source, 0, source.indexOf("--"))).toEqual({ description: "The tsconfig.json to build", alias: "p" })
    const multi = "/**\n * Line one\n * line two\n */\n"
    expect(jsdocBefore(multi, 0, multi.length)).toEqual({ description: "Line one line two" })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run packages/effectscript/core/test/docs-comment.test.ts`
Expected: FAIL. Cannot find module `../src/docs/comment.ts`.

- [ ] **Step 3: Implement `src/docs/comment.ts`**

```ts
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
    else if (!inCode && c === "@" && (i === 0 || /\s/.test(text[i - 1]!)) && /[A-Za-z]/.test(text[i + 1] ?? "")) {
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
    if (open !== null && tags.length === 0) {
      fence = {
        marker: open[1]!,
        runnable: open[2] === "efx" && !/(^|\s)ignore(\s|$)/.test(open[3] ?? ""),
        open: line,
        code: [],
        title: paragraph.length > 0 ? "" : lastParagraph
      }
      if (paragraph.length > 0) fence.title = paragraph.join(" ").trim().replace(/:$/, "")
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
  const firstIsFence = fenceOpen.test(text)
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
  if (candidate === undefined || candidate.line || source.slice(candidate.start, candidate.start + 3) !== "/**") return undefined
  if (source.slice(candidate.start, candidate.end) === "/**/") return undefined
  const gap = source.slice(candidate.end, start)
  return /^(?:\s|export\b|default\b|declare\b)*$/.test(gap) ? candidate : undefined
}

/**
 * @since 4.0.0
 * @category predicates
 */
export const isModuleDoc = (doc: DocComment): boolean => doc.tags.some((t) => t.name === "module")
```

> Note on title rules (spec §2.2): the title is the paragraph that ends right before the fence. It
> is the open paragraph when the fence follows text directly. Otherwise it is the last paragraph
> closed by a blank line, provided no other fence came in between.

- [ ] **Step 4: Make `jsdocBefore` delegate**

In `src/compiler/transform/command.ts`, replace the body of `jsdocBefore` after the gap match:

```ts
import { parseDocComment } from "../../docs/comment.ts"
// …
export const jsdocBefore = (
  source: string,
  from: number,
  end: number
): { description: string; alias?: string } | undefined => {
  const gap = source.slice(from, end)
  const at = Math.max(0, gap.lastIndexOf("/**"))
  // the last `/**` in the gap: earlier doc comments belong to earlier declarations; stop at its own `*/` (review I4)
  const match = /^\/\*\*(?:(?!\*\/)[\s\S])*\*\/[\s,]*$/.exec(gap.slice(at))
  if (match === null) return undefined
  const start = from + at
  const doc = parseDocComment(source, start, source.indexOf("*/", start + 3) + 2)
  const description = [doc.summary, doc.body].join(" ").replace(/\s+/g, " ").trim()
  const alias = doc.tags.find((t) => t.name === "alias")?.text.split(/\s+/)[0]
  return alias === undefined || alias === "" ? { description } : { description, alias }
}
```

- [ ] **Step 5: Run the tests, plus the existing command tests**

Run: `pnpm test --run packages/effectscript/core/test/docs-comment.test.ts packages/effectscript/core/test/command.test.ts packages/effectscript/core/test/plan5-review.test.ts`
Expected: PASS. Fix the parser, not the expectations, unless an expectation contradicts spec §2.

- [ ] **Step 6: Lint and commit**

```bash
pnpm lint-fix
git add packages/effectscript/core/src/docs/comment.ts packages/effectscript/core/src/compiler/transform/command.ts packages/effectscript/core/test/docs-comment.test.ts
git commit -m "feat(effectscript): doc-comment parser with efx examples and tags (Plan 12 Task 1, ADR-0042)"
```

---

### Task 2: Doc model

**Files:**
- Create: `packages/effectscript/core/src/docs/model.ts`
- Test: `packages/effectscript/core/test/docs-model.test.ts`

**Interfaces:**
- Consumes: `parseDocComment`, `docCommentBefore`, `isModuleDoc`, `DocComment` (Task 1), and `parse`
  (`compiler/parser/parse.ts`).
- Produces:
  ```ts
  export type DocKind = "effect" | "function" | "schema" | "error" | "service" | "layer" | "config" | "command"
    | "api" | "group" | "atom" | "const" | "type" | "interface" | "class" | "field" | "member" | "variant"
  export interface DocParam { readonly name: string; readonly type: string | undefined }
  export interface DocDeclaration {
    readonly kind: DocKind
    readonly name: string
    readonly start: number               // source offset of the declaration (after `export`)
    readonly signature: string           // as written, body removed, whitespace collapsed to one line
    readonly params: ReadonlyArray<DocParam>
    readonly success: string | undefined
    readonly failure: string | undefined
    readonly requirements: string | undefined
    readonly doc: DocComment | undefined
    readonly members: ReadonlyArray<DocDeclaration>
  }
  export interface DocImport { readonly from: string; readonly imported: string }
  export interface DocModule {
    readonly file: string                // as given (absolute in the CLI)
    readonly path: string                // module path, "" for the root index
    readonly source: string
    readonly doc: DocComment | undefined // the @module comment
    readonly declarations: ReadonlyArray<DocDeclaration>
    readonly imports: ReadonlyMap<string, DocImport>  // local name → relative import
    readonly hasMain: boolean
  }
  export const modulePath: (relativeFile: string) => string
  export const docModule: (file: string, path: string, source: string) =>
    { readonly module: DocModule; readonly diagnostics: ReadonlyArray<Diagnostic> }
  export const allExamples: (module: DocModule) => ReadonlyArray<{ readonly owner: string; readonly example: DocExample }>
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// test/docs-model.test.ts
import { describe, expect, it } from "vitest"
import { allExamples, docModule, modulePath } from "../src/docs/model.ts"

const source = `/**
 * Bank.
 *
 * @module
 */
import { Ledger } from "./ledger.efx"
import { Effect } from "effect"

/** Whole cents. */
export schema Money = Int & Brand<"Money">

/** An account. */
export schema Account {
  /** Its id. */
  id: string
  cents = Int.check(isGreaterThan(0))
}

export schema Shape =
  | Circle { r: number }
  | Square { s: number }

/** Not enough money. */
export error InsufficientFunds { needed: Money }

/** The users. */
export service Users {
  /** Finds one. */
  effect find(id: string): Account throws InsufficientFunds
  readonly size: number
  layer = { size: 1, find: effect (id) => new Account({ id, cents: 1 }) }
}

/**
 * Moves money.
 *
 * \`\`\`efx
 * await transfer(Money.make(1)) // => 1
 * \`\`\`
 */
export effect transfer(amount: Money, note?: string): number throws InsufficientFunds | NotFound needs Ledger | Users {
  return 1
}

export const double = effect (x: number): number => x * 2
export layer AppLive = Users.layer
export function plain(x: number): string { return "" }
export type T = string
export interface I { a: number }
export class C {}
export const k = 1
const hidden = 2
const shown = 3
export { shown }
export * from "./other.efx"
export { again } from "./again.efx"
export default effect run(): void {}
`

describe("docModule", () => {
  const { module, diagnostics } = docModule("/p/src/bank.efx", "bank", source)
  const byName = (name: string) => module.declarations.find((d) => d.name === name)!

  it("reads the module doc and exports in source order", () => {
    expect(diagnostics).toEqual([])
    expect(module.doc?.summary).toBe("Bank.")
    expect(module.declarations.map((d) => [d.kind, d.name])).toEqual([
      ["schema", "Money"], ["schema", "Account"], ["schema", "Shape"], ["error", "InsufficientFunds"],
      ["service", "Users"], ["effect", "transfer"], ["effect", "double"], ["layer", "AppLive"],
      ["function", "plain"], ["type", "T"], ["interface", "I"], ["class", "C"], ["const", "k"],
      ["const", "shown"], ["effect", "default"]
    ])
  })

  it("keeps signatures as written, without bodies", () => {
    expect(byName("Money").signature).toBe("schema Money = Int & Brand<\"Money\">")
    expect(byName("transfer").signature).toBe(
      "effect transfer(amount: Money, note?: string): number throws InsufficientFunds | NotFound needs Ledger | Users"
    )
    expect(byName("double").signature).toBe("const double = effect (x: number): number")
    expect(byName("plain").signature).toBe("function plain(x: number): string")
    expect(byName("AppLive").signature).toBe("layer AppLive = Users.layer")
    expect(byName("Account").signature).toBe("schema Account")
  })

  it("splits A / E / R and params", () => {
    const t = byName("transfer")
    expect([t.success, t.failure, t.requirements]).toEqual(["number", "InsufficientFunds | NotFound", "Ledger | Users"])
    expect(t.params).toEqual([{ name: "amount", type: "Money" }, { name: "note", type: "string" }])
    expect(byName("plain").success).toBe("string")
    expect(byName("plain").failure).toBeUndefined()
  })

  it("collects members with their docs", () => {
    expect(byName("Account").members.map((m) => [m.kind, m.name, m.signature, m.doc?.summary])).toEqual([
      ["field", "id", "id: string", "Its id."],
      ["field", "cents", "cents = Int.check(isGreaterThan(0))", undefined]
    ])
    expect(byName("Shape").members.map((m) => [m.kind, m.name])).toEqual([["variant", "Circle"], ["variant", "Square"]])
    const users = byName("Users").members
    expect(users.map((m) => [m.kind, m.name])).toEqual([["member", "find"], ["field", "size"], ["layer", "layer"]])
    expect(users[0]!.signature).toBe("effect find(id: string): Account throws InsufficientFunds")
    expect(users[0]!.failure).toBe("InsufficientFunds")
    expect(users[0]!.doc?.summary).toBe("Finds one.")
  })

  it("records relative imports and examples", () => {
    expect(module.imports.get("Ledger")).toEqual({ from: "./ledger.efx", imported: "Ledger" })
    expect(module.imports.has("Effect")).toBe(false)
    expect(allExamples(module).map((e) => [e.owner, e.example.code])).toEqual([
      ["transfer", "await transfer(Money.make(1)) // => 1"]
    ])
    expect(module.hasMain).toBe(false)
  })

  it("detects main and reports parse failures", () => {
    expect(docModule("m.efx", "m", "main {\n  await log(1)\n}\n").module.hasMain).toBe(true)
    const broken = docModule("b.efx", "b", "export const = 1")
    expect(broken.diagnostics.map((d) => d.code)).toEqual(["EFX1001"])
    expect(broken.module.declarations).toEqual([])
  })
})

describe("modulePath", () => {
  it("drops src/, the extension and index", () => {
    expect(modulePath("src/bank/transfer.efx")).toBe("bank/transfer")
    expect(modulePath("src/users/index.efx")).toBe("users")
    expect(modulePath("src/index.ts")).toBe("")
    expect(modulePath("lib/a.ts")).toBe("lib/a")
    expect(modulePath("src\\win\\b.efx")).toBe("win/b")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run packages/effectscript/core/test/docs-model.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement `src/docs/model.ts`**

These are the AST shapes from the parser (`compiler/parser/plugin.ts`):
- `effect` declarations: `FunctionDeclaration` with `efx.kind === "declaration"`. The return type
  annotation carries `efxThrows`/`efxNeeds`.
- `const x = effect (…) => …`: `VariableDeclaration` → `ArrowFunctionExpression` with
  `efx.kind === "arrow"`.
- `schema`/`error`/`service`/`config`: `ClassDeclaration` with `efxKind`. Fields are
  `PropertyDefinition` (with `typeAnnotation` or `value`). Service effect members are
  `MethodDefinition` whose `value` is a `TSDeclareMethod` with `efx.kind === "method"`. Service
  `layer` members are `PropertyDefinition`s, keyed `layer` or `layerTest`, whose `efx` marks them as
  layers. Check `src/compiler/transform/service.ts` for the exact flag and match it.
- `SchemaAliasDeclaration` (`id`, `typeAnnotation`) and `SchemaAdtDeclaration` (`variants`: a
  `ClassDeclaration` with `efxKind: "variant"` for each variant).
- `LayerDeclaration`, `AtomDeclaration` (`id`, `init`), `CommandDeclaration` (`name`, `params`,
  `body`), `ApiDeclaration`, `GroupDeclaration` and `MainStatement`.

```ts
/**
 * The doc model (spec §3.1): a module's exported declarations, read from the parse tree only.
 * Everything is kept exactly as written; nothing is inferred (ADR-0043).
 *
 * @since 4.0.0
 */
import type { Node } from "../compiler/ast.ts"
import type { Diagnostic } from "../compiler/diagnostics.ts"
import { parse } from "../compiler/parser/parse.ts"
import { type DocComment, type DocExample, docCommentBefore, isModuleDoc, parseDocComment } from "./comment.ts"

// … the exported interfaces from the Interfaces block above, each with `@since 4.0.0` / `@category models` …

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

/**
 * @since 4.0.0
 * @category utils
 */
export const modulePath = (relativeFile: string): string => {
  const path = relativeFile.replace(/\\/g, "/").replace(/^src\//, "").replace(/\.(efx|tsx?|mts)$/, "")
  if (path === "index") return ""
  return path.endsWith("/index") ? path.slice(0, -"/index".length) : path
}

interface Builder {
  readonly source: string
  readonly comments: ReadonlyArray<{ readonly start: number; readonly end: number; readonly line: boolean }>
}

const docAt = (b: Builder, start: number): DocComment | undefined => {
  const c = docCommentBefore(b.source, b.comments, start)
  if (c === undefined) return undefined
  const doc = parseDocComment(b.source, c.start, c.end)
  return isModuleDoc(doc) ? undefined : doc
}

const text = (b: Builder, node: Node | null | undefined): string | undefined =>
  node == null ? undefined : oneLine(b.source.slice(node.start, node.end))

/** The type text of a `: T` annotation node (TSTypeAnnotation). */
const annotation = (b: Builder, node: Node | null | undefined): string | undefined =>
  node == null ? undefined : text(b, node.typeAnnotation ?? node)

const params = (b: Builder, list: ReadonlyArray<Node>): Array<{ name: string; type: string | undefined }> =>
  list.map((p) => {
    const target = p.type === "AssignmentPattern" ? p.left : p.type === "TSParameterProperty" ? p.parameter : p
    const name = target.type === "Identifier" ? target.name : text(b, target) ?? "?"
    return { name, type: annotation(b, target.typeAnnotation) }
  })

/** A/E/R of a function-like node. */
const clauses = (b: Builder, fn: Node) => {
  const rt: Node | undefined = fn.returnType ?? undefined
  return {
    success: rt === undefined ? undefined : text(b, rt.typeAnnotation),
    failure: text(b, rt?.efxThrows),
    requirements: text(b, rt?.efxNeeds)
  }
}

/** Source text from `from` to `to` (the body start), on one line. */
const header = (b: Builder, from: number, to: number): string => oneLine(b.source.slice(from, to))

const empty = { params: [], success: undefined, failure: undefined, requirements: undefined, members: [] } as const

const classMembers = (b: Builder, node: Node): Array<DocDeclaration> =>
  node.body.body.flatMap((m: Node): Array<DocDeclaration> => {
    const name = m.key?.type === "Identifier" ? m.key.name : text(b, m.key)
    if (name === undefined) return []
    const doc = docAt(b, m.start)
    if (m.type === "MethodDefinition") {
      const fn = m.value
      const signature = header(b, m.start, fn.body?.start ?? m.end)
      return [{ kind: "member", name, start: m.start, signature, params: params(b, fn.params), ...clauses(b, fn), doc, members: [] }]
    }
    if (m.type === "PropertyDefinition") {
      const isLayer = node.efxKind === "service" && /^layer/.test(name) && m.value != null && m.typeAnnotation == null
      const signature = isLayer ? oneLine(b.source.slice(m.start, m.value.start).replace(/=\s*$/, "")) : oneLine(b.source.slice(m.start, m.end))
      return [{ ...empty, kind: isLayer ? "layer" : "field", name, start: m.start, signature, doc }]
    }
    return []
  })

const declaration = (b: Builder, node: Node, start: number): DocDeclaration | undefined => {
  const doc = docAt(b, start)
  switch (node.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction": {
      const name = node.id?.name ?? "default"
      const kind = node.efx?.kind === "declaration" ? "effect" : "function"
      const signature = header(b, node.efx?.keyword?.start ?? node.start, node.body?.start ?? node.end)
      return { kind, name, start, signature, params: params(b, node.params), ...clauses(b, node), doc, members: [] }
    }
    case "VariableDeclaration": {
      const d = node.declarations[0]
      if (d === undefined || d.id.type !== "Identifier") return undefined
      const init: Node | null = d.init
      if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
        const kind = init.efx !== undefined ? "effect" : "function"
        const signature = header(b, node.start, init.body.start).replace(/\s*=>\s*$/, "")
        return { kind, name: d.id.name, start, signature, params: params(b, init.params), ...clauses(b, init), doc, members: [] }
      }
      const type = annotation(b, d.id.typeAnnotation)
      const signature = `${node.kind} ${d.id.name}${type === undefined ? "" : `: ${type}`}`
      return { ...empty, kind: "const", name: d.id.name, start, signature, doc }
    }
    case "ClassDeclaration": {
      const kind = (node.efxKind ?? "class") as DocKind
      const name = node.id?.name ?? "default"
      return { ...empty, kind, name, start, signature: `${kind} ${name}`, doc, members: classMembers(b, node) }
    }
    case "SchemaAliasDeclaration":
      return { ...empty, kind: "schema", name: node.id.name, start, signature: oneLine(b.source.slice(start, node.end)), doc }
    case "SchemaAdtDeclaration":
      return {
        ...empty, kind: "schema", name: node.id.name, start, signature: `schema ${node.id.name}`, doc,
        members: node.variants.map((v: Node) => ({
          ...empty, kind: "variant" as const, name: v.id.name, start: v.start,
          signature: oneLine(b.source.slice(v.start, v.end)), doc: docAt(b, v.start), members: classMembers(b, v)
        }))
      }
    case "LayerDeclaration":
    case "AtomDeclaration":
      return { ...empty, kind: node.type === "LayerDeclaration" ? "layer" : "atom", name: node.id.name, start, signature: oneLine(b.source.slice(start, node.end)).replace(/;$/, ""), doc }
    case "CommandDeclaration":
      return { ...empty, kind: "command", name: node.name?.name ?? text(b, node.name) ?? "command", start, signature: header(b, start, node.body.start), doc }
    case "ApiDeclaration":
    case "GroupDeclaration":
      return { ...empty, kind: node.type === "ApiDeclaration" ? "api" : "group", name: node.id?.name ?? "api", start, signature: oneLine(b.source.slice(start, node.end)), doc }
    case "TSTypeAliasDeclaration":
      return { ...empty, kind: "type", name: node.id.name, start, signature: oneLine(b.source.slice(start, node.end)).replace(/;$/, ""), doc }
    case "TSInterfaceDeclaration":
      return { ...empty, kind: "interface", name: node.id.name, start, signature: oneLine(b.source.slice(start, node.end)), doc }
    default:
      return undefined
  }
}

/**
 * Builds the doc model of one file. Parse failures give an empty module plus the diagnostics.
 *
 * @since 4.0.0
 * @category constructors
 */
export const docModule = (
  file: string,
  path: string,
  source: string
): { readonly module: DocModule; readonly diagnostics: ReadonlyArray<Diagnostic> } => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") {
    return {
      module: { file, path, source, doc: undefined, declarations: [], imports: new Map(), hasMain: false },
      diagnostics: parsed.diagnostics
    }
  }
  const b: Builder = { source, comments: parsed.comments }
  const body: ReadonlyArray<Node> = parsed.program.body
  const first = parsed.comments[0]
  const moduleDoc = first !== undefined && !first.line && source.slice(first.start, first.start + 3) === "/**"
    ? parseDocComment(source, first.start, first.end)
    : undefined
  const imports = new Map<string, DocImport>()
  const exportedLocals = new Set<string>()
  for (const s of body) {
    if (s.type === "ImportDeclaration" && /^\.\.?\//.test(s.source.value) && s.importKind !== "type" || s.type === "ImportDeclaration" && /^\.\.?\//.test(s.source.value)) {
      for (const spec of s.specifiers) {
        const imported = spec.type === "ImportSpecifier" ? (spec.imported.name ?? spec.imported.value) : spec.type === "ImportDefaultSpecifier" ? "default" : "*"
        imports.set(spec.local.name, { from: s.source.value, imported })
      }
    }
    if (s.type === "ExportNamedDeclaration" && s.declaration == null && s.source == null) {
      for (const spec of s.specifiers) exportedLocals.add(spec.local.name)
    }
  }
  const declarations: Array<DocDeclaration> = []
  const nameOf = (n: Node): string | undefined =>
    n.id?.name ?? n.declarations?.[0]?.id?.name ?? n.name?.name
  for (const s of body) {
    if (s.type === "ExportNamedDeclaration" && s.declaration != null) {
      const d = declaration(b, s.declaration, s.declaration.start)
      if (d !== undefined) declarations.push(d)
    } else if (s.type === "ExportDefaultDeclaration") {
      const d = declaration(b, s.declaration, s.declaration.start)
      if (d !== undefined) declarations.push({ ...d, name: "default" })
    } else {
      const name = nameOf(s)
      if (name !== undefined && exportedLocals.has(name)) {
        const d = declaration(b, s, s.start)
        if (d !== undefined) declarations.push(d)
      }
    }
  }
  declarations.sort((x, y) => x.start - y.start)
  return {
    module: {
      file, path, source,
      doc: moduleDoc !== undefined && isModuleDoc(moduleDoc) ? moduleDoc : undefined,
      declarations, imports,
      hasMain: body.some((s) => s.type === "MainStatement")
    },
    diagnostics: []
  }
}

/**
 * Every runnable example of a module, with the name of the declaration that owns it
 * (`Service.member` for members, the module path for the module doc).
 *
 * @since 4.0.0
 * @category utils
 */
export const allExamples = (module: DocModule): ReadonlyArray<{ readonly owner: string; readonly example: DocExample }> => {
  const out: Array<{ owner: string; example: DocExample }> = []
  for (const e of module.doc?.examples ?? []) out.push({ owner: module.path === "" ? "index" : module.path, example: e })
  const visit = (d: DocDeclaration, prefix: string) => {
    const owner = prefix === "" ? d.name : `${prefix}.${d.name}`
    for (const e of d.doc?.examples ?? []) out.push({ owner, example: e })
    for (const m of d.members) visit(m, owner)
  }
  for (const d of module.declarations) visit(d, "")
  return out
}
```

While making the tests pass, clean up the obviously redundant `ImportDeclaration` condition above:
a relative `ImportDeclaration`, type-only or not, records its specifiers. Write the switch so each
case is a small helper if the function grows past ~80 lines.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --run packages/effectscript/core/test/docs-model.test.ts`
Expected: PASS. Where the parser's AST differs from the shapes assumed above (for example the
`efx` marker on service layer members, or `CommandDeclaration.name`), print the node in a
scratchpad probe and adapt the model, not the test.

- [ ] **Step 5: Lint, type-check and commit**

```bash
pnpm lint-fix && pnpm check
git add packages/effectscript/core/src/docs/model.ts packages/effectscript/core/test/docs-model.test.ts
git commit -m "feat(effectscript): syntactic doc model of exported declarations (Plan 12 Task 2, ADR-0043)"
```

---

### Task 3: Markdown pages

**Files:**
- Create: `packages/effectscript/core/src/docs/render.ts`
- Create: `packages/effectscript/core/test/fixtures/docs/bank/` (`index.efx`, `accounts.efx`, `transfer.efx`, `ledger.efx`)
- Test: `packages/effectscript/core/test/docs-render.test.ts` (golden `.md` via `toMatchFileSnapshot` in `test/fixtures/docs/__out__/`)

**Interfaces:**
- Consumes: `DocModule`, `DocDeclaration`, `docModule`, `modulePath` (Task 2).
- Produces:
  ```ts
  export interface DocSite { readonly modules: ReadonlyArray<DocModule> }
  export const slug: (heading: string) => string
  export const pageFile: (module: DocModule) => string      // "bank/transfer.md", "" → "index.md"
  export const renderModule: (site: DocSite, module: DocModule) => string
  export const renderIndex: (site: DocSite, title: string) => string
  ```

- [ ] **Step 1: Write the fixtures**

`test/fixtures/docs/bank/accounts.efx`:

```ts
/**
 * Accounts and money.
 *
 * @module
 */

/** An amount of money in whole cents. */
export schema Money = Int & Brand<"Money">

/** An account id. */
export schema AccountId = string & Brand<"AccountId">

/** No account has this id. */
export error AccountNotFound { id: AccountId }

/** An account has less money than the transfer needs. */
export error InsufficientFunds { needed: Money; available: Money }
```

`test/fixtures/docs/bank/ledger.efx`:

```ts
import { AccountId, Money } from "./accounts.efx"

/** The store of balances. */
export service Ledger {
  /** The balance of one account. */
  effect balance(id: AccountId): Money throws AccountNotFound
  layer test = { balance: effect (id) => Money.make(100) }
}
```

`test/fixtures/docs/bank/transfer.efx`:

```ts
/**
 * Bank transfers between accounts.
 *
 * @module
 */
import { AccountId, AccountNotFound, InsufficientFunds, Money } from "./accounts.efx"
import { Ledger } from "./ledger.efx"

/** Proof that a transfer happened. */
export schema Receipt {
  /** The amount moved. */
  amount: Money
}

/**
 * Moves money between two accounts.
 *
 * Both balances change, or neither does.
 *
 * Moving money:
 *
 * ```efx
 * const receipt = await transfer(AccountId.make("a"), AccountId.make("b"), Money.make(30))
 * receipt.amount // => 30
 * ```
 *
 * @since 1.2.0
 */
export effect transfer(from: AccountId, to: AccountId, amount: Money): Receipt throws InsufficientFunds | AccountNotFound needs Ledger {
  return new Receipt({ amount })
}
```

`test/fixtures/docs/bank/index.efx`:

```ts
/**
 * A tiny bank.
 *
 * @module
 */
export { transfer } from "./transfer.efx"
```

- [ ] **Step 2: Write the failing test**

```ts
// test/docs-render.test.ts
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { docModule, modulePath } from "../src/docs/model.ts"
import { pageFile, renderIndex, renderModule, slug } from "../src/docs/render.ts"

const dir = path.join(import.meta.dirname, "fixtures/docs")
const files = ["bank/index.efx", "bank/accounts.efx", "bank/ledger.efx", "bank/transfer.efx"]
const site = {
  modules: files.map((f) =>
    docModule(path.join(dir, f), modulePath(`src/${f}`), fs.readFileSync(path.join(dir, f), "utf8")).module
  )
}

describe("render", () => {
  it("slugs like GitHub", () => {
    expect(slug("Users.find")).toBe("usersfind")
    expect(slug("$weird_Name")).toBe("weird_name")
    expect(slug("a b")).toBe("a-b")
  })

  it("names page files after module paths", () => {
    expect(site.modules.map(pageFile)).toEqual(["bank.md", "bank/accounts.md", "bank/ledger.md", "bank/transfer.md"])
  })

  for (const module of site.modules) {
    it(`renders ${module.path}`, async () => {
      await expect(renderModule(site, module)).toMatchFileSnapshot(path.join(dir, "__out__", pageFile(module)))
    })
  }

  it("renders the index", async () => {
    await expect(renderIndex(site, "API")).toMatchFileSnapshot(path.join(dir, "__out__", "index.md"))
  })

  it("links each row to the right page and quotes the definition's summary", () => {
    const page = renderModule(site, site.modules.find((m) => m.path === "bank/transfer")!)
    expect(page).toContain("| **amount** | [`Money`](./accounts.md#money): An amount of money in whole cents. |")
    expect(page).toContain("| **Returns** | [`Receipt`](#receipt): Proof that a transfer happened. |")
    expect(page).toContain(
      "| **Fails with** | [`InsufficientFunds`](./accounts.md#insufficientfunds): An account has less money than the transfer needs.<br>[`AccountNotFound`](./accounts.md#accountnotfound): No account has this id. |"
    )
    expect(page).toContain("| **Needs** | [`Ledger`](./ledger.md#ledger): The store of balances. |")
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test --run packages/effectscript/core/test/docs-render.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 4: Implement `src/docs/render.ts`**

Rules, from spec §3.2:
- **Frontmatter.** `title` is the module path (`API` for the index), and `description` is the
  module summary, written with `JSON.stringify` (a valid YAML double-quoted string). Omit
  `description` when there is no summary.
- **Page structure.** The module summary comes first, then the module body. Then each declaration:
  `## <name>`, its signature in an `efx` fence, its summary, the facts table, its body, then its
  tags (other than `module`) as a `- **@name** text` list.
- **Members.** A service effect member gets a `### <Service>.<member>` section in the same shape. Its
  fields and layers become a `| Member | |` table of `` `signature` `` and summary. Schema, error and
  config fields become a `| Field | |` table. ADT variants become `### <Variant>` with a field table.
- **Facts table.** It has a row for each parameter whose type is written, then **Returns** (success),
  **Fails with** (each top-level `|` part of failure, joined with `<br>`), and **Needs** (each part
  of requirements).
  - Each cell links when its type is a bare identifier that resolves.
  - Text in `@param <name> - text`, `@returns text` or `@throws {Name} text` tags is used in the
    cell when present. Otherwise the cell quotes the resolved definition's summary.
  - Skip the table when it has no rows.
- **Resolution** of an identifier `X` in module `M`:
  1. A declaration `X` in `M` gives `#slug(X)`.
  2. Otherwise `M.imports.get(X)`. Resolve `from` against `dirname(M.file)`: try it as written,
     then with `.efx`, `.ts`, `/index.efx` and `/index.ts`. Find the module with that `file`, and
     the declaration named `imported` in it. That gives `relative(dirname(pageFile(M)), pageFile(T))`
     with `./` prepended, plus `#slug(imported)`.
  3. Otherwise it is unresolved and shows as plain `` `X` ``.
- **Splitting `|` at the top level.** Count `<>`, `()`, `[]` and `{}` depth, and split only at depth
  0.
- **Index.** List each non-root module as `- [<path>](./<pageFile>): <summary>`. Paths are sorted.
  The root module (path `""`) is rendered first, in place of a separate page.
- **Output.** End the output with exactly one `\n`, and leave no trailing spaces.

```ts
/**
 * Markdown pages for Blume (spec §3.2): signature first, then a facts table assembled from each
 * linked definition's own summary (ADR-0042).
 *
 * @since 4.0.0
 */
import * as path from "node:path"
import type { DocDeclaration, DocModule } from "./model.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface DocSite {
  readonly modules: ReadonlyArray<DocModule>
}

/**
 * A GitHub-style heading slug (what Blume uses for anchors).
 *
 * @since 4.0.0
 * @category utils
 */
export const slug = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9 _-]/g, "").replace(/ /g, "-")

/**
 * @since 4.0.0
 * @category utils
 */
export const pageFile = (module: DocModule): string => (module.path === "" ? "index.md" : `${module.path}.md`)

const splitTop = (type: string): Array<string> => {
  const parts: Array<string> = []
  let depth = 0
  let current = ""
  for (const c of type) {
    if ("<([{".includes(c)) depth++
    else if (">)]}".includes(c)) depth--
    if (c === "|" && depth === 0) {
      if (current.trim() !== "") parts.push(current.trim())
      current = ""
    } else current += c
  }
  if (current.trim() !== "") parts.push(current.trim())
  return parts
}

const candidates = (from: string): Array<string> =>
  [from, `${from}.efx`, `${from}.ts`, `${from}/index.efx`, `${from}/index.ts`]

const resolve = (
  site: DocSite,
  module: DocModule,
  name: string
): { href: string; declaration: DocDeclaration } | undefined => {
  const local = module.declarations.find((d) => d.name === name)
  if (local !== undefined) return { href: `#${slug(name)}`, declaration: local }
  const imported = module.imports.get(name)
  if (imported === undefined) return undefined
  const base = path.resolve(path.dirname(module.file), imported.from)
  for (const file of candidates(base)) {
    const target = site.modules.find((m) => path.resolve(m.file) === file)
    const declaration = target?.declarations.find((d) => d.name === imported.imported)
    if (target !== undefined && declaration !== undefined) {
      const rel = path.posix.relative(path.posix.dirname(pageFile(module)), pageFile(target))
      return { href: `${rel.startsWith(".") ? rel : `./${rel}`}#${slug(imported.imported)}`, declaration }
    }
  }
  return undefined
}

const cell = (site: DocSite, module: DocModule, type: string, override: string | undefined): string => {
  const isName = /^[A-Za-z_$][\w$]*$/.test(type)
  const target = isName ? resolve(site, module, type) : undefined
  const code = `\`${type.replace(/\|/g, "\\|")}\``
  const head = target === undefined ? code : `[${code}](${target.href})`
  const text = override ?? target?.declaration.doc?.summary
  return text === undefined || text === "" ? head : `${head}: ${text.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")}`
}

const tag = (d: DocDeclaration, name: string) => d.doc?.tags.filter((t) => t.name === name) ?? []

const facts = (site: DocSite, module: DocModule, d: DocDeclaration): Array<string> => {
  const rows: Array<string> = []
  for (const p of d.params) {
    if (p.type === undefined) continue
    const override = tag(d, "param").find((t) => t.text.split(/\s/)[0] === p.name)?.text.replace(/^\S+\s*(?:-\s*)?/, "")
    rows.push(`| **${p.name}** | ${cell(site, module, p.type, override)} |`)
  }
  if (d.success !== undefined) {
    rows.push(`| **Returns** | ${cell(site, module, d.success, tag(d, "returns")[0]?.text)} |`)
  }
  const throwsText = (name: string) =>
    tag(d, "throws").find((t) => t.text.startsWith(`{${name}}`))?.text.replace(/^\{[^}]*\}\s*/, "")
  if (d.failure !== undefined) {
    rows.push(`| **Fails with** | ${splitTop(d.failure).map((t) => cell(site, module, t, throwsText(t))).join("<br>")} |`)
  }
  if (d.requirements !== undefined) {
    rows.push(`| **Needs** | ${splitTop(d.requirements).map((t) => cell(site, module, t, undefined)).join("<br>")} |`)
  }
  return rows.length === 0 ? [] : ["| | |", "| --- | --- |", ...rows]
}

const fence = (code: string) => ["```efx", code, "```"]

const section = (site: DocSite, module: DocModule, d: DocDeclaration, level: string, heading: string): Array<string> => {
  const out: Array<string> = [`${level} ${heading}`, "", ...fence(d.signature), ""]
  if (d.doc?.summary) out.push(d.doc.summary, "")
  const table = facts(site, module, d)
  if (table.length > 0) out.push(...table, "")
  const fields = d.members.filter((m) => m.kind === "field" || m.kind === "layer")
  if (fields.length > 0) {
    out.push(d.kind === "service" ? "| Member | |" : "| Field | |", "| --- | --- |")
    for (const f of fields) out.push(`| \`${f.signature.replace(/\|/g, "\\|")}\` | ${(f.doc?.summary ?? "").replace(/\s*\n\s*/g, " ")} |`)
    out.push("")
  }
  if (d.doc?.body) out.push(d.doc.body, "")
  const tags = (d.doc?.tags ?? []).filter((t) => !["module", "param", "returns", "throws"].includes(t.name))
  if (tags.length > 0) out.push(...tags.map((t) => `- **@${t.name}**${t.text === "" ? "" : ` ${t.text.replace(/\n/g, " ")}`}`), "")
  for (const m of d.members) {
    if (m.kind === "member") out.push(...section(site, module, m, "###", `${d.name}.${m.name}`))
    if (m.kind === "variant") out.push(...section(site, module, m, "###", m.name))
  }
  return out
}

const frontmatter = (title: string, description: string | undefined): Array<string> => [
  "---",
  `title: ${JSON.stringify(title)}`,
  ...(description ? [`description: ${JSON.stringify(description.replace(/\s*\n\s*/g, " "))}`] : []),
  "---",
  ""
]

const finish = (lines: Array<string>): string =>
  `${lines.map((l) => l.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`

const moduleBody = (site: DocSite, module: DocModule): Array<string> => {
  const out: Array<string> = []
  if (module.doc?.summary) out.push(module.doc.summary, "")
  if (module.doc?.body) out.push(module.doc.body, "")
  for (const d of module.declarations) out.push(...section(site, module, d, "##", d.name))
  return out
}

/**
 * @since 4.0.0
 * @category rendering
 */
export const renderModule = (site: DocSite, module: DocModule): string =>
  finish([...frontmatter(module.path === "" ? "API" : module.path, module.doc?.summary), ...moduleBody(site, module)])

/**
 * @since 4.0.0
 * @category rendering
 */
export const renderIndex = (site: DocSite, title: string): string => {
  const root = site.modules.find((m) => m.path === "")
  const others = site.modules.filter((m) => m.path !== "" && (m.declarations.length > 0 || m.doc !== undefined))
    .sort((a, b) => a.path.localeCompare(b.path))
  return finish([
    ...frontmatter(title, root?.doc?.summary),
    ...(root === undefined ? [] : moduleBody(site, root)),
    "## Modules",
    "",
    ...others.map((m) => `- [${m.path}](./${pageFile(m)})${m.doc?.summary ? `: ${m.doc.summary.replace(/\s*\n\s*/g, " ")}` : ""}`)
  ])
}
```

- [ ] **Step 5: Run, inspect the snapshots, iterate**

Run: `pnpm test --run packages/effectscript/core/test/docs-render.test.ts`
Expected: the explicit `toContain` test PASSes, and the snapshot files are written. Read every
`__out__/*.md` against spec §3.2:
- signature first;
- no empty table headers;
- fields tables for `Receipt`/errors;
- `### Ledger.balance`;
- no trailing spaces;
- `@since 1.2.0` rendered as a list item.

Fix the renderer and re-run with `-u` only after reading the output.

- [ ] **Step 6: Lint, type-check and commit**

```bash
pnpm lint-fix && pnpm check
git add packages/effectscript/core/src/docs/render.ts packages/effectscript/core/test/docs-render.test.ts packages/effectscript/core/test/fixtures/docs
git commit -m "feat(effectscript): signature-first Markdown pages with linked facts tables (Plan 12 Task 3, ADR-0043)"
```

---

### Task 4: Example assertions and runtime helpers

**Files:**
- Create: `packages/effectscript/core/src/docs/examples.ts`
- Create: `packages/effectscript/core/src/doctest.ts`
- Test: `packages/effectscript/core/test/docs-examples.test.ts`

**Interfaces:**
- Consumes: `DocExample` (Task 1), `parse` (`compiler/parser/parse.ts`), and `diagnosticError`.
- Produces:
  ```ts
  // src/docs/examples.ts
  export const helpers = "$efxDoctest"     // namespace the rewritten code calls
  export const rewriteExample: (example: DocExample) =>
    { readonly lines: ReadonlyArray<string>; readonly diagnostics: ReadonlyArray<Diagnostic> }
  // lines: the example's code lines after rewriting, same count as the input; diagnostics carry source offsets
  // src/doctest.ts (effectscript/doctest)
  export const assertDoc: (actual: unknown, expected: unknown) => void
  export const failsWith: <A, E, R>(self: Effect.Effect<A, E, R>, tag: string) => Effect.Effect<void, never, R>
  export const dies: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<void, never, R>
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// test/docs-examples.test.ts
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { parseDocComment } from "../src/docs/comment.ts"
import { rewriteExample } from "../src/docs/examples.ts"
import { assertDoc, dies, failsWith } from "../src/doctest.ts"

const example = (code: string) => {
  const source = `/**\n * \`\`\`efx\n${code.split("\n").map((l) => ` * ${l}`).join("\n")}\n * \`\`\`\n */`
  return { source, example: parseDocComment(source, 0, source.length).examples[0]! }
}
const rewrite = (code: string) => {
  const { example: e, source } = example(code)
  const r = rewriteExample(e)
  return { lines: r.lines, codes: r.diagnostics.map((d) => d.code), at: r.diagnostics.map((d) => source.slice(d.start, d.end)) }
}

describe("rewriteExample", () => {
  it("wraps expression statements", () => {
    expect(rewrite("f(1) // => 2").lines).toEqual(["$efxDoctest.assertDoc(f(1), (2)) // => 2"])
    expect(rewrite("await g() // => { a: 1 }").lines).toEqual(["$efxDoctest.assertDoc(await g(), ({ a: 1 })) // => { a: 1 }"])
  })

  it("checks a const after it is declared", () => {
    expect(rewrite("const x = await g() // => 3").lines).toEqual(["const x = await g(); $efxDoctest.assertDoc(x, (3)) // => 3"])
  })

  it("asserts defects", () => {
    expect(rewrite("await boom() // => dies").lines).toEqual(["await $efxDoctest.dies(boom()) // => dies"])
    expect(rewrite("boom() // => dies").codes).toEqual(["EFX9303"])
  })

  it("asserts failures by tag", () => {
    expect(rewrite("await pay(9999) // => throws InsufficientFunds").lines).toEqual([
      "await $efxDoctest.failsWith(pay(9999), \"InsufficientFunds\") // => throws InsufficientFunds"
    ])
  })

  it("keeps the line count for multi-line statements", () => {
    expect(rewrite("f(\n  1\n) // => 1\nconst y = 2").lines).toEqual(["$efxDoctest.assertDoc(f(", "  1", "), (1)) // => 1", "const y = 2"])
  })

  it("reports misplaced assertions with source positions", () => {
    expect(rewrite("// => 1").codes).toEqual(["EFX9302"])
    expect(rewrite("let a = 1, b = 2 // => 1").codes).toEqual(["EFX9302"])
    expect(rewrite("f() // => throws X").codes).toEqual(["EFX9303"])
    expect(rewrite("await f() // => throws not-a-name").codes).toEqual(["EFX9303"])
    expect(rewrite("const = 1").codes).toEqual(["EFX9301"])
    expect(rewrite("x // =>").at).toEqual(["// =>"])
  })
})

class Boom extends Schema.TaggedErrorClass<Boom>()("Boom", {}) {}

describe("effectscript/doctest", () => {
  it("assertDoc compares with Equal, then structurally", () => {
    expect(() => assertDoc({ a: [1] }, { a: [1] })).not.toThrow()
    expect(() => assertDoc(1, 2)).toThrow(/Expected values to be strictly deep-equal/)
  })

  it("failsWith checks the failure tag", async () => {
    await Effect.runPromise(failsWith(Effect.fail(new Boom()), "Boom"))
    await expect(Effect.runPromise(failsWith(Effect.succeed(1), "Boom"))).rejects.toThrow(/succeeded/)
    await expect(Effect.runPromise(failsWith(Effect.fail(new Boom()), "Other"))).rejects.toThrow(/failed with Boom/)
    await expect(Effect.runPromise(failsWith(Effect.die("x"), "Boom"))).rejects.toThrow(/died/)
  })

  it("dies checks for a defect", async () => {
    await Effect.runPromise(dies(Effect.die("x")))
    await expect(Effect.runPromise(dies(Effect.fail(new Boom())))).rejects.toThrow(/failed with Boom/)
    await expect(Effect.runPromise(dies(Effect.succeed(1)))).rejects.toThrow(/succeeded/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --run packages/effectscript/core/test/docs-examples.test.ts`
Expected: FAIL. Modules not found.

- [ ] **Step 3: Implement `src/docs/examples.ts`**

Parse the code wrapped as `effect {\n<code>\n}` so that `await` and the other efx forms parse. Take
the top-level statements of the block. Each `//` comment whose text after `//` starts with `=>` is
an assertion. Its statement is the last top-level statement that ends at or before the comment, on
the same line. Edits are character insertions, so the line count never changes.

```ts
/**
 * `// =>` assertions in `efx` examples (ADR-0042) → calls to `effectscript/doctest`.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import type { Node } from "../compiler/ast.ts"
import { type Diagnostic, diagnosticError } from "../compiler/diagnostics.ts"
import { parse } from "../compiler/parser/parse.ts"
import type { DocExample } from "./comment.ts"

/**
 * @since 4.0.0
 * @category constants
 */
export const helpers = "$efxDoctest"

const prefix = "effect {\n"

/**
 * @since 4.0.0
 * @category rewriting
 */
export const rewriteExample = (
  example: DocExample
): { readonly lines: ReadonlyArray<string>; readonly diagnostics: ReadonlyArray<Diagnostic> } => {
  const wrapped = `${prefix}${example.code}\n}`
  const lineStarts = [0]
  for (let i = 0; i < example.code.length; i++) if (example.code[i] === "\n") lineStarts.push(i + 1)
  /** offset in example.code → source offset */
  const toSource = (offset: number): number => {
    let line = 0
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line++
    return example.offsets[line]! + (offset - lineStarts[line]!)
  }
  const at = (code: string, message: string, start: number, end: number, hint?: string) =>
    diagnosticError(code, message, toSource(Math.max(0, start)), toSource(Math.max(start, end)), hint)
  const parsed = parse(wrapped)
  if (parsed._tag === "Failure") {
    const d = parsed.diagnostics[0]!
    const offset = Math.min(Math.max(0, d.start - prefix.length), Math.max(0, example.code.length - 1))
    return { lines: example.code.split("\n"), diagnostics: [at("EFX9301", `This example doesn't parse: ${d.message}`, offset, offset + 1)] }
  }
  const block: Node = parsed.program.body[0].expression?.body ?? parsed.program.body[0].body
  const statements: ReadonlyArray<Node> = block.body
  const s = new MagicString(example.code)
  const diagnostics: Array<Diagnostic> = []
  for (const comment of parsed.comments) {
    if (!comment.line) continue
    const text = wrapped.slice(comment.start + 2, comment.end).trim()
    if (!text.startsWith("=>")) continue
    const start = comment.start - prefix.length
    const end = comment.end - prefix.length
    const expected = text.slice(2).trim()
    const statement = [...statements].reverse().find((st) => st.end - prefix.length <= start)
    const sameLine = statement !== undefined && !example.code.slice(statement.end - prefix.length, start).includes("\n")
    const awaited: Node | undefined = statement?.type === "ExpressionStatement" && statement.expression.type === "AwaitExpression"
      ? statement.expression.argument
      : undefined
    if (expected === "dies") {
      if (!sameLine || awaited === undefined) {
        diagnostics.push(at("EFX9303", "`// => dies` must follow `await <effect>` on the same line", start, end, "write `await e // => dies`"))
        continue
      }
      s.appendLeft(awaited.start - prefix.length, `${helpers}.dies(`)
      s.appendRight(awaited.end - prefix.length, ")")
      continue
    }
    const throwsMatch = /^throws\b\s*(.*)$/.exec(expected)
    if (throwsMatch !== null) {
      const name = throwsMatch[1]!.trim()
      const operand: Node | undefined = statement?.type === "ExpressionStatement" && statement.expression.type === "AwaitExpression"
        ? statement.expression.argument
        : undefined
      if (!sameLine || operand === undefined || !/^[A-Za-z_$][\w$]*$/.test(name)) {
        diagnostics.push(at("EFX9303", "`// => throws Name` must follow `await <effect>` on the same line", start, end, "write `await e // => throws ErrorName`"))
        continue
      }
      s.appendLeft(operand.start - prefix.length, `${helpers}.failsWith(`)
      s.appendRight(operand.end - prefix.length, `, ${JSON.stringify(name)})`)
      continue
    }
    if (!sameLine || expected === "") {
      diagnostics.push(at("EFX9302", "`// => expected` must follow an expression or a `const` on the same line", start, end))
      continue
    }
    if (statement.type === "ExpressionStatement") {
      const e: Node = statement.expression
      s.appendLeft(e.start - prefix.length, `${helpers}.assertDoc(`)
      s.appendRight(e.end - prefix.length, `, (${expected}))`)
    } else if (
      statement.type === "VariableDeclaration" && statement.kind === "const" && statement.declarations.length === 1 &&
      statement.declarations[0].id.type === "Identifier"
    ) {
      const name: string = statement.declarations[0].id.name
      s.appendRight(statement.end - prefix.length, `${example.code[statement.end - prefix.length - 1] === ";" ? "" : ";"} ${helpers}.assertDoc(${name}, (${expected}))`)
    } else {
      diagnostics.push(at("EFX9302", "`// => expected` must follow an expression or a `const` on the same line", start, end))
    }
  }
  return { lines: s.toString().split("\n"), diagnostics }
}
```

Check the `effect { … }` statement shape with a probe. `parsed.program.body[0]` is either an
`ExpressionStatement` whose `expression` is an `EffectBlock` with `body`, or the `EffectBlock`
itself. Keep the one access path that matches.

- [ ] **Step 4: Implement `src/doctest.ts`**

Check `Result` in `packages/effect/src/Result.ts`: `isFailure` and the success field name
(`success`). Adjust the code if they differ.

```ts
/**
 * `effectscript/doctest`: runtime helpers for doctests (ADR-0042). Compiled `efx` examples call
 * these; they are not meant for hand-written tests.
 *
 * @since 4.0.0
 */
import * as assert from "node:assert"
import { isDeepStrictEqual, inspect } from "node:util"
import { Cause, Effect, Equal, Exit, Result } from "effect"

/**
 * Passes when `Equal.equals` or deep strict equality holds; otherwise fails with a diff.
 *
 * @since 4.0.0
 * @category assertions
 */
export const assertDoc = (actual: unknown, expected: unknown): void => {
  if (Equal.equals(actual, expected) || isDeepStrictEqual(actual, expected)) return
  assert.deepStrictEqual(actual, expected)
  assert.fail(`expected ${inspect(expected)}, got ${inspect(actual)}`)
}

/**
 * Runs `self` and passes when it fails with an error whose `_tag` is `tag`.
 *
 * @since 4.0.0
 * @category assertions
 */
export const failsWith = <A, E, R>(self: Effect.Effect<A, E, R>, tag: string): Effect.Effect<void, never, R> =>
  Effect.flatMap(Effect.exit(self), (exit) =>
    Effect.sync(() => {
      if (Exit.isSuccess(exit)) {
        assert.fail(`expected a failure with ${tag}, but the effect succeeded with ${inspect(exit.value)}`)
      }
      const error = Cause.findError(exit.cause)
      if (Result.isFailure(error)) assert.fail(`expected a failure with ${tag}, but the effect died:\n${Cause.pretty(exit.cause)}`)
      const actual = (error.success as { readonly _tag?: unknown } | null)?._tag
      if (actual !== tag) assert.fail(`expected a failure with ${tag}, but it failed with ${typeof actual === "string" ? actual : inspect(error.success)}`)
    }))

/**
 * Runs `self` and passes when it dies with a defect (a bug, never a typed failure).
 *
 * @since 4.0.0
 * @category assertions
 */
export const dies = <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<void, never, R> =>
  Effect.flatMap(Effect.exit(self), (exit) =>
    Effect.sync(() => {
      if (Exit.isSuccess(exit)) assert.fail(`expected a defect, but the effect succeeded with ${inspect(exit.value)}`)
      const error = Cause.findError(exit.cause)
      if (Result.isSuccess(error)) {
        const tag = (error.success as { readonly _tag?: unknown } | null)?._tag
        assert.fail(`expected a defect, but it failed with ${typeof tag === "string" ? tag : inspect(error.success)}`)
      }
    }))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test --run packages/effectscript/core/test/docs-examples.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint, type-check and commit**

```bash
pnpm lint-fix && pnpm check
git add packages/effectscript/core/src/docs/examples.ts packages/effectscript/core/src/doctest.ts packages/effectscript/core/test/docs-examples.test.ts
git commit -m "feat(effectscript): // => assertions and effectscript/doctest helpers (Plan 12 Task 4, ADR-0042)"
```

---

### Task 5: The `doctest` statement and `?doctest` modules

**Files:**
- Modify: `packages/effectscript/core/src/compiler/parser/plugin.ts` (next to `efxIsDescribeStart`, ~line 172 and ~631)
- Modify: `packages/effectscript/core/src/compiler/transform/test.ts`
- Create: `packages/effectscript/core/src/docs/doctest.ts`
- Modify: `packages/effectscript/core/src/vite.ts`
- Test: `packages/effectscript/core/test/doctest.test.ts`
- Create: `packages/effectscript/examples/src/bank.efx`, `packages/effectscript/examples/test/bank.test.efx`

**Interfaces:**
- Consumes: `docModule`, `allExamples` (Task 2), `rewriteExample`, `helpers` (Task 4).
- Produces:
  ```ts
  // src/docs/doctest.ts
  export const doctestSource: (file: string, source: string) =>
    { readonly code: string; readonly diagnostics: ReadonlyArray<Diagnostic> }
  // AST: DoctestStatement { keyword: {start,end}, path: Literal (string), layer: Node | null }
  ```

- [ ] **Step 1: Write the failing compiler and generator tests**

```ts
// test/doctest.test.ts
import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { doctestSource } from "../src/docs/doctest.ts"

describe("doctest statement", () => {
  it("lowers to describe(…) without a layer", () => {
    const { code, diagnostics } = toTypeScript("doctest \"../src/bank.efx\"\n")
    expect(diagnostics).toEqual([])
    expect(code).toBe(
      "import { default as doctest } from \"../src/bank.efx?doctest\"\nimport { describe, it } from \"@effect/vitest\"\n" +
        "describe(\"doctest ../src/bank.efx\", () => doctest(it))\n"
    )
  })

  it("lowers to layer(…)(…) with a layer, and nests in describe … with", () => {
    expect(toTypeScript("doctest \"./a.efx\" with Ledger.layerTest\n").code).toContain(
      "layer(Ledger.layerTest)(\"doctest ./a.efx\", (it) => doctest(it))"
    )
    expect(toTypeScript("describe \"x\" with A {\n  doctest \"./a.efx\" with B\n}\n").code).toContain(
      "it.layer(B)(\"doctest ./a.efx\", (it2) => doctest(it2))"
    )
  })

  it("rejects non-relative or non-efx/ts paths (EFX9304)", () => {
    expect(toTypeScript("doctest \"bank\"\n").diagnostics.map((d) => d.code)).toEqual(["EFX9304"])
    expect(toTypeScript("doctest \"./bank.md\"\n").diagnostics.map((d) => d.code)).toEqual(["EFX9304"])
  })

  it("leaves identifiers named doctest alone", () => {
    const source = "const doctest = (s: string) => s\nexport const a = doctest(\"x\")\ndoctest\n\"y\"\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})

const bank = [
  "/**",
  " * Bank.",
  " *",
  " * @module",
  " */",
  "",
  "/**",
  " * Doubles.",
  " *",
  " * Twice:",
  " *",
  " * ```efx",
  " * double(2) // => 4",
  " * ```",
  " */",
  "export const double = (n: number) => n * 2",
  "export type N = number",
  ""
].join("\n")

describe("doctestSource", () => {
  it("keeps every example line on its source line and column", () => {
    const { code, diagnostics } = doctestSource("/p/bank.efx", bank)
    expect(diagnostics).toEqual([])
    const lines = code.split("\n")
    expect(lines[0]).toContain("import { double } from \"./bank.efx\"")
    expect(lines[0]).toContain("import type { N } from \"./bank.efx\"")
    expect(lines[0]).toContain("import * as $efxDoctest from \"effectscript/doctest\"")
    expect(lines[11]).toBe("$efxIt.effect(\"double: Twice\", () => effect {")
    expect(lines[12]).toBe("   $efxDoctest.assertDoc(double(2), (4)) // => 4")
    expect(lines[13]).toBe("})")
    expect(lines.at(-1)).toBe("}")
  })

  it("works for CRLF files", () => {
    const { code } = doctestSource("/p/bank.efx", bank.replace(/\n/g, "\r\n"))
    expect(code.split("\n")[12]).toBe("   $efxDoctest.assertDoc(double(2), (4)) // => 4")
  })

  it("refuses targets with main (EFX9307) and warns without examples (EFX9305)", () => {
    expect(doctestSource("/p/m.efx", "main {\n}\n").diagnostics.map((d) => [d.code, d.severity])).toEqual([["EFX9307", "error"]])
    const none = doctestSource("/p/n.efx", "export const a = 1\n")
    expect(none.diagnostics.map((d) => [d.code, d.severity])).toEqual([["EFX9305", "warning"]])
    expect(none.code).toContain("$efxIt.skip(")
  })

  it("reports example errors at their source position", () => {
    const broken = bank.replace("double(2) // => 4", "double(2) // =>")
    const d = doctestSource("/p/bank.efx", broken).diagnostics
    expect(d.map((x) => x.code)).toEqual(["EFX9302"])
    expect(broken.slice(d[0]!.start, d[0]!.end)).toBe("// =>")
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --run packages/effectscript/core/test/doctest.test.ts`
Expected: FAIL. `doctest "…"` is a syntax error, and `doctestSource` is missing.

- [ ] **Step 3: Parse `doctest`**

In `plugin.ts`, next to the describe/test starts (~line 172), add
`if (this.efxIsDoctestStart()) return this.efxParseDoctest()`. Next to `efxParseDescribe`, add:

```ts
    /** `doctest "path" [with layer]` (docs spec §2.3). */
    efxIsDoctestStart(): boolean {
      if (!this.efxIsWord("doctest")) return false
      const next = this.lookahead()
      return next.type === tt.string && this.efxSameLine(next)
    }

    efxParseDoctest(): any {
      const node = this.startNode()
      node.keyword = { start: this.start, end: this.end }
      this.next()
      node.path = this.parseExprAtom(null, false, false)
      node.layer = null
      if (this.type === tt._with) {
        this.next()
        node.layer = this.parseExprSubscripts(null, false)
      }
      this.semicolon()
      return this.finishNode(node, "DoctestStatement")
    }
```

- [ ] **Step 4: Lower `DoctestStatement` in `transform/test.ts`**

```ts
const doctestStatement: Handler = (node, _parent, ctx) => {
  const target: string = node.path.value
  if (!/^\.\.?\//.test(target) || !/\.(efx|ts)$/.test(target)) {
    ctx.diagnostics.push(
      diagnosticError("EFX9304", "`doctest` needs a relative path to a .efx or .ts file", node.path.start, node.path.end, "for example doctest \"../src/bank.efx\"")
    )
    return true
  }
  const local = fresh(ctx, "doctest")
  ctx.imports.need(`${target}?doctest`, "default", local)
  const name = JSON.stringify(`doctest ${target}`)
  const layer: Node | null = node.layer
  const end = ctx.source[node.end - 1] === ";" ? node.end - 1 : node.end
  if (layer === null) {
    const it = ctx.testIt ?? ref(ctx, vitest, "it")
    ctx.s.update(node.keyword.start, end, `${ref(ctx, vitest, "describe")}(${name}, () => ${local}(${it}))`)
    return true
  }
  const head = ctx.testIt === undefined ? `${ref(ctx, vitest, "layer")}(` : `${ctx.testIt}.layer(`
  const param = unused(ctx, "it")
  ctx.s.update(node.keyword.start, layer.start, head)
  ctx.s.update(layer.end, end, `)(${name}, (${param}) => ${local}(${param}))`)
  walk(layer, node, ctx)
  return true
}
```

Register it as `DoctestStatement: doctestStatement` in `testHandlers`, and import `fresh` from
`../names.ts`. `unused` doesn't reserve the name, so a second `doctest` in the same scope can get
the same `it` parameter. Each parameter is scoped to its own arrow function, so this is fine, and
`describe … with` uses the same approach.

- [ ] **Step 5: Implement `src/docs/doctest.ts`**

```ts
/**
 * The `?doctest` virtual module (docs spec §2.3): `.efx` source with one `it.effect` per example,
 * every example line kept on its own line and column, so failures point into the doc comment.
 *
 * @since 4.0.0
 */
import * as path from "node:path"
import { type Diagnostic, diagnosticError, diagnosticWarning } from "../compiler/diagnostics.ts"
import { helpers, rewriteExample } from "./examples.ts"
import { allExamples, docModule } from "./model.ts"

const typeKinds = new Set(["type", "interface"])

/**
 * @since 4.0.0
 * @category doctest
 */
export const doctestSource = (
  file: string,
  source: string
): { readonly code: string; readonly diagnostics: ReadonlyArray<Diagnostic> } => {
  const { module, diagnostics: parseDiagnostics } = docModule(file, "", source)
  if (parseDiagnostics.length > 0) return { code: "", diagnostics: parseDiagnostics }
  const main = /(^|\n)\s*main\s*\{/.exec(source)
  if (module.hasMain) {
    const start = main === null ? 0 : main.index + main[0].indexOf("main")
    return {
      code: "",
      diagnostics: [diagnosticError("EFX9307", "A doctest target can't have a `main` block: importing it would run the program", start, start + 4, "move the examples' code into a module without `main`")]
    }
  }
  const lines = source.split("\n").map(() => "")
  const specifier = `./${path.basename(file)}`
  const values = module.declarations.filter((d) => !typeKinds.has(d.kind) && d.name !== "default").map((d) => d.name)
  const types = module.declarations.filter((d) => typeKinds.has(d.kind)).map((d) => d.name)
  const header: Array<string> = []
  if (values.length > 0) header.push(`import { ${values.join(", ")} } from ${JSON.stringify(specifier)};`)
  if (types.length > 0) header.push(`import type { ${types.join(", ")} } from ${JSON.stringify(specifier)};`)
  header.push(`import * as ${helpers} from "effectscript/doctest";`, "export default ($efxIt) => {")
  lines[0] = header.join(" ")
  const diagnostics: Array<Diagnostic> = []
  const examples = allExamples(module)
  const lineStart = (line: number) => {
    let offset = 0
    for (let i = 1; i < line; i++) offset = source.indexOf("\n", offset) + 1
    return offset
  }
  for (const { owner, example } of examples) {
    const rewritten = rewriteExample(example)
    diagnostics.push(...rewritten.diagnostics)
    lines[example.openLine - 1] = `$efxIt.effect(${JSON.stringify(`${owner}: ${example.title}`)}, () => effect {`
    rewritten.lines.forEach((text, i) => {
      const offset = example.offsets[i]!
      const line = example.openLine + i // code lines follow the opening fence
      lines[line] = `${" ".repeat(offset - lineStart(line + 1))}${text}`
    })
    lines[example.closeLine - 1] = "})"
  }
  if (examples.length === 0) {
    diagnostics.push(diagnosticWarning("EFX9305", `${path.basename(file)} has no \`efx\` examples to test`, 0, Math.min(1, source.length)))
    lines[0] += ` $efxIt.skip(${JSON.stringify(`${path.basename(file)} has no efx examples`)}, () => {});`
  }
  lines.push("}")
  return { code: lines.join("\n"), diagnostics }
}
```

`docModule` already reports parse errors and gives `hasMain`, so use `module.hasMain` and only
find the position with the regex. `lines[0]` can never hold an example line, because an example
needs at least `/**` and a fence above it. Since `lines` has one entry per source line, the
`lineStart` loop is correct for CRLF too: `\r` stays at the end of each source line and isn't
copied.

- [ ] **Step 6: Serve `?doctest` from the Vite plugin**

In `src/vite.ts`:

```ts
import { doctestSource } from "./docs/doctest.ts"
// …
const doctestQuery = /\?doctest$/

/** The `.efx`/`.ts` target of a `?doctest` id, or `undefined`. */
const doctestTarget = (id: string): string | undefined =>
  doctestQuery.test(id) && /\.(efx|ts)\?doctest$/.test(id) && !id.startsWith("\0") ? id.replace(doctestQuery, "") : undefined

/** The `.efx` file of a module id, or `undefined` (other files, asset queries). */
const efxFile = (id: string): string | undefined => {
  if (assetQuery.test(id) || id.startsWith("\0")) return undefined
  const target = doctestTarget(id)
  if (target !== undefined) return `${target}?doctest`
  const file = id.replace(/[?#].*$/, "")
  return file.endsWith(".efx") ? file : undefined
}
```

Extend the `VitePlugin` interface with
`readonly load?: (id: string) => Promise<string | undefined> | string | undefined`. Add a `load`
hook to the first plugin:

```ts
    load(id) {
      const target = doctestTarget(id)
      if (target === undefined) return undefined
      const source = fs.readFileSync(target, "utf8")
      const filename = path.relative(process.cwd(), target)
      const result = doctestSource(target, source)
      const errors = result.diagnostics.filter((d) => d.severity === "error")
      if (errors.length > 0) throw new Error(errors.map((d) => formatDiagnostic(source, filename, d)).join("\n"))
      return result.code
    },
```

In `transform`:
- compile with `filename` from the real file. For a `?doctest` id, `file` is
  `"<target>?doctest"`, so use `file.replace(doctestQuery, "")` for `filename`, `packageInfo` and the
  source-map `sources`.
- In the strip plugin, check `fs.existsSync(file.replace(doctestQuery, ""))`, and pass
  `${file.replace(doctestQuery, "")}.doctest.${mode}` to oxc as the filename.

- [ ] **Step 7: Run the unit tests**

Run: `pnpm test --run packages/effectscript/core/test/doctest.test.ts packages/effectscript/core/test/testConstruct.test.ts packages/effectscript/core/test/superset.test.ts`
Expected: PASS. Then add a row to the trigger table in main spec §4.19 (Task 9 does the remaining
docs).

- [ ] **Step 8: Dogfood in the examples package**

Write `packages/effectscript/examples/src/bank.efx`:

```ts
/**
 * A tiny bank, documented with runnable examples (Plan 12).
 *
 * @module
 */

/** An amount of money in whole cents. */
export schema Money = Int & Brand<"Money">

/** An account has less money than a withdrawal needs. */
export error InsufficientFunds { needed: Money; available: Money }

/**
 * Takes money out of a balance.
 *
 * Within the balance:
 *
 * ```efx
 * await withdraw(Money.make(100), Money.make(30)) // => 70
 * ```
 *
 * More than the balance:
 *
 * ```efx
 * await withdraw(Money.make(10), Money.make(30)) // => throws InsufficientFunds
 * ```
 */
export effect withdraw(balance: Money, amount: Money): Money throws InsufficientFunds {
  if (amount > balance) throw new InsufficientFunds({ needed: amount, available: balance })
  return Money.make(balance - amount)
}
```

Write `packages/effectscript/examples/test/bank.test.efx`:

```ts
doctest "../src/bank.efx"
```

Run: `pnpm test --run packages/effectscript/examples/test/bank.test.efx`
Expected: PASS, with 2 tests named `withdraw: Within the balance` and
`withdraw: More than the balance`. Then temporarily change `// => 70` to `// => 71` and run again.
Expected: FAIL. The stack or code frame must point at `src/bank.efx` on the line of that example.
Revert the change.

- [ ] **Step 9: Lint, type-check and commit**

```bash
pnpm lint-fix && pnpm check
git add packages/effectscript/core/src/compiler/parser/plugin.ts packages/effectscript/core/src/compiler/transform/test.ts packages/effectscript/core/src/docs/doctest.ts packages/effectscript/core/src/vite.ts packages/effectscript/core/test/doctest.test.ts packages/effectscript/examples/src/bank.efx packages/effectscript/examples/test/bank.test.efx
git commit -m "feat(effectscript): doctest statement and ?doctest modules for Vitest (Plan 12 Task 5, ADR-0042)"
```

---

### Task 6: `efx docs`

**Files:**
- Create: `packages/effectscript/core/src/docs/index.ts`
- Create: `packages/effectscript/core/src/cli/docs.ts`
- Modify: `packages/effectscript/core/src/cli/main.efx`, then `pnpm codegen` regenerates `main.ts`
- Test: `packages/effectscript/core/test/cli-docs.test.ts`

**Interfaces:**
- Consumes: `docModule`, `modulePath`, `allExamples` (Task 2), `renderModule`, `renderIndex` and
  `pageFile` (Task 3), and `rewriteExample` (Task 4).
- Produces:
  ```ts
  export interface DocsOptions { readonly paths: ReadonlyArray<string>; readonly out: string; readonly check: boolean; readonly strict: boolean }
  export const docsProject: (cwd: string, options: DocsOptions, io: { readonly out: (line: string) => void; readonly err: (line: string) => void }) => number
  export const redundantTags: (module: DocModule, site: DocSite) => ReadonlyArray<Diagnostic>   // EFX9306
  ```

- [ ] **Step 1: Write the failing CLI test**

```ts
// test/cli-docs.test.ts
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-docs-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  return dir
}
const run = (dir: string, ...args: Array<string>) =>
  spawnSync(process.execPath, [efx, "docs", ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, EFFECTSCRIPT_DEV: "1" } })

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const money = "/** Whole cents. */\nexport schema Money = Int & Brand<\"Money\">\n"
const pay = "import { Money } from \"./money.efx\"\n/**\n * Pays.\n *\n * @returns The new balance.\n */\nexport effect pay(amount: Money): Money {\n  return amount\n}\n"

describe("efx docs (Plan 12 Task 6)", () => {
  it("writes one page per module and an index, replacing old output", () => {
    const dir = project({ "src/money.efx": money, "src/pay.efx": pay, "src/pay.test.efx": "doctest \"./pay.efx\"\n", "docs/api/stale.md": "old" })
    const result = run(dir)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(fs.readdirSync(path.join(dir, "docs/api")).sort()).toEqual(["index.md", "money.md", "pay.md"])
    expect(fs.readFileSync(path.join(dir, "docs/api/pay.md"), "utf8")).toContain("[`Money`](./money.md#money): Whole cents.")
    expect(result.stdout).toContain("Wrote 3 pages to docs/api")
  })

  it("--check writes nothing and fails on example errors", () => {
    const dir = project({ "src/a.efx": "/**\n * A.\n *\n * ```efx\n * a() // =>\n * ```\n */\nexport const a = () => 1\n" })
    const result = run(dir, "--check")
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("EFX9302")
    expect(result.stderr).toContain("src/a.efx:5")
    expect(fs.existsSync(path.join(dir, "docs/api"))).toBe(false)
  })

  it("--strict warns about tags that repeat the signature (EFX9306)", () => {
    const dir = project({ "src/money.efx": money, "src/pay.efx": pay })
    expect(run(dir, "--check").status).toBe(0)
    const strict = run(dir, "--check", "--strict")
    expect(strict.status).toBe(1)
    expect(strict.stderr).toContain("EFX9306")
  })

  it("honors --out and explicit paths, and tolerates no exports", () => {
    const dir = project({ "lib/x.ts": "/** X. */\nexport const x: number = 1\n", "lib/empty.ts": "const y = 1\n" })
    expect(run(dir, "lib", "--out", "site/ref").status).toBe(0)
    expect(fs.readdirSync(path.join(dir, "site/ref")).sort()).toEqual(["index.md", "lib"])
    expect(fs.existsSync(path.join(dir, "site/ref/lib/empty.md"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --run packages/effectscript/core/test/cli-docs.test.ts`
Expected: FAIL. `docs` isn't a subcommand.

- [ ] **Step 3: Implement `src/docs/index.ts` and `src/cli/docs.ts`**

`src/docs/index.ts` re-exports `comment.ts`, `model.ts`, `render.ts`, `examples.ts` and
`doctest.ts` with `export * from`, each with a `@since 4.0.0` module comment.

`src/cli/docs.ts`:

```ts
/**
 * `efx docs` (docs spec §3): Markdown pages for Blume from doc comments, or only the checks.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { type Diagnostic, diagnosticWarning, formatDiagnostic } from "../compiler/diagnostics.ts"
import { allExamples, type DocModule, docModule, modulePath, rewriteExample } from "../docs/index.ts"
import { type DocSite, pageFile, renderIndex, renderModule } from "../docs/index.ts"

// … DocsOptions as in the Interfaces block …

const skipDir = new Set(["node_modules", "internal", "dist", "build", ".git"])

const collect = (root: string, out: string, files: Array<string>) => {
  const stat = fs.statSync(root, { throwIfNoEntry: false })
  if (stat === undefined) return
  if (stat.isFile()) {
    if (/\.(efx|ts)$/.test(root) && !/\.d\.ts$/.test(root) && !/\.test\.(efx|ts)$/.test(root)) files.push(root)
    return
  }
  if (path.resolve(root) === path.resolve(out)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && (skipDir.has(entry.name) || entry.name.startsWith("."))) continue
    collect(path.join(root, entry.name), out, files)
  }
}

/**
 * EFX9306: `@returns`/`@throws` repeating a written return type or `throws` clause, or `@param` on
 * a parameter whose type is a documented declaration.
 *
 * @since 4.0.0
 * @category checks
 */
export const redundantTags = (module: DocModule, site: DocSite): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = []
  const documented = (type: string | undefined) =>
    type !== undefined && /^[A-Za-z_$][\w$]*$/.test(type) &&
    (module.declarations.some((d) => d.name === type && d.doc?.summary) || module.imports.has(type))
  const visit = (d: DocModule["declarations"][number]) => {
    const doc = d.doc
    if (doc !== undefined) {
      for (const tag of doc.tags) {
        const repeats = tag.name === "returns" && d.success !== undefined ||
          tag.name === "throws" && d.failure !== undefined ||
          tag.name === "param" && documented(d.params.find((p) => p.name === tag.text.split(/\s/)[0])?.type)
        if (repeats) {
          out.push(diagnosticWarning("EFX9306", `@${tag.name} repeats what the signature or a schema already says`, doc.start, doc.end, "document it once, where it is defined (ADR-0042)"))
        }
      }
    }
    d.members.forEach(visit)
  }
  module.declarations.forEach(visit)
  void site
  return out
}

/**
 * @since 4.0.0
 * @category cli
 */
export const docsProject = (cwd: string, options: DocsOptions, io: { readonly out: (line: string) => void; readonly err: (line: string) => void }): number => {
  const outDir = path.resolve(cwd, options.out)
  const roots = options.paths.length > 0 ? options.paths.map((p) => path.resolve(cwd, p)) : [path.resolve(cwd, fs.existsSync(path.join(cwd, "src")) ? "src" : ".")]
  const files: Array<string> = []
  for (const root of roots) collect(root, outDir, files)
  files.sort()
  const modules: Array<DocModule> = []
  let errors = 0
  let warnings = 0
  const report = (file: string, source: string, d: Diagnostic) => {
    if (d.severity === "error") errors++
    else warnings++
    io.err(formatDiagnostic(source, path.relative(cwd, file), d))
  }
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8")
    const { module, diagnostics } = docModule(file, modulePath(path.relative(cwd, file)), source)
    diagnostics.forEach((d) => report(file, source, d))
    for (const { example } of allExamples(module)) rewriteExample(example).diagnostics.forEach((d) => report(file, source, d))
    modules.push(module)
  }
  const site: DocSite = { modules }
  if (options.strict) for (const m of modules) redundantTags(m, site).forEach((d) => report(m.file, m.source, d))
  if (errors > 0 || (options.strict && warnings > 0)) return 1
  if (options.check) return 0
  fs.rmSync(outDir, { recursive: true, force: true })
  let pages = 0
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    pages++
  }
  for (const m of modules) {
    if (m.path === "" || (m.declarations.length === 0 && m.doc === undefined)) continue
    write(path.join(outDir, pageFile(m)), renderModule(site, m))
  }
  write(path.join(outDir, "index.md"), renderIndex(site, "API"))
  io.out(`Wrote ${pages} pages to ${path.relative(cwd, outDir) || "."}`)
  return 0
}
```

Remove the `void site` and the unused parameter if `redundantTags` doesn't need the site. Keep the
signature in the Interfaces block in sync with what you ship.

`modulePath(path.relative(cwd, file))` strips a leading `src/`. For explicit paths such as `lib`,
the module path keeps `lib/`, which is what the test expects.

- [ ] **Step 4: Add the subcommand in `src/cli/main.efx`**

Add `import { docsProject } from "./docs.ts"`. After `convert`, add:

```ts
/** Generate API docs (Markdown for Blume) from doc comments (docs spec §3) */
export const docs = Command.make("docs", {
  paths: Argument.String("paths").pipe(Argument.variadic(), Argument.withDescription("Files or directories (default: src)")),
  out: Flag.String("out").pipe(Flag.withDefault("docs/api"), Flag.withDescription("Where to write the pages (replaced on each run)")),
  check: Flag.Boolean("check").pipe(Flag.withDefault(false), Flag.withDescription("Only report problems; write nothing")),
  strict: Flag.Boolean("strict").pipe(Flag.withDefault(false), Flag.withDescription("Fail on warnings, and flag tags that repeat the signature"))
}, effect ({ paths, out, check, strict }) => {
  await exitWith(docsProject(process.cwd(), { paths, out, check, strict }, {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`)
  }))
}) |> Command.withDescription("Generate API docs from doc comments")
```

Add `docs` to `Command.withSubcommands([...])`, after `convert`.

- [ ] **Step 5: Regenerate, then run the tests**

Run: `pnpm --filter effectscript codegen`
Then: `pnpm test --run packages/effectscript/core/test/cli-docs.test.ts packages/effectscript/core/test/cli-codegen.test.ts packages/effectscript/core/test/cli-main.test.ts`
Expected: PASS. If `cli-main.test.ts` snapshots the help text, update its expectation to include
`docs`.

- [ ] **Step 6: Lint, type-check and commit**

```bash
pnpm lint-fix && pnpm check
git add packages/effectscript/core/src/docs/index.ts packages/effectscript/core/src/cli/docs.ts packages/effectscript/core/src/cli/main.efx packages/effectscript/core/src/cli/main.ts packages/effectscript/core/test/cli-docs.test.ts
git commit -m "feat(effectscript): efx docs writes pages and checks doc comments (Plan 12 Task 6, ADR-0043)"
```

---

### Task 7: Blume integration and `efx init`

**Files:**
- Create: `packages/effectscript/core/grammars/effectscript.tmLanguage.json`, `packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json` (copied from `packages/effectscript/vscode/syntaxes/`)
- Create: `packages/effectscript/core/src/blume.ts`
- Modify: `packages/effectscript/core/package.json` (`files`)
- Modify: `packages/effectscript/core/src/cli/init.ts`
- Test: `packages/effectscript/core/test/blume.test.ts`, `packages/effectscript/core/test/init.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AstroIntegration { readonly name: string; readonly hooks: { readonly "astro:config:setup": (options: { readonly updateConfig: (config: object) => unknown }) => void } }
  export const effectscript: () => AstroIntegration
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// test/blume.test.ts
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { effectscript } from "../src/blume.ts"

const core = path.join(import.meta.dirname, "..")
const vscode = path.join(core, "../vscode/syntaxes")

describe("effectscript/blume", () => {
  it("ships the VS Code grammars unchanged", () => {
    for (const file of ["effectscript.tmLanguage.json", "effectscript.injection.tmLanguage.json"]) {
      expect(fs.readFileSync(path.join(core, "grammars", file), "utf8")).toBe(fs.readFileSync(path.join(vscode, file), "utf8"))
    }
  })

  it("registers efx with Shiki through Astro", () => {
    const configs: Array<any> = []
    effectscript().hooks["astro:config:setup"]({ updateConfig: (c) => configs.push(c) })
    const langs = configs[0].markdown.shikiConfig.langs
    expect(langs[0]).toBe("tsx")
    expect(langs[1]).toMatchObject({ name: "efx-injection", scopeName: "effectscript.injection", injectTo: ["source.efx"] })
    expect(langs[2]).toMatchObject({ name: "efx", scopeName: "source.efx", embeddedLangs: ["tsx"] })
  })
})
```

Append to `test/init.test.ts`, inside its `describe`:

```ts
  it("sets up Blume in docs/ without overwriting anything", () => {
    const dir = project({
      "tsconfig.json": "{}\n",
      "package.json": "{\n  \"name\": \"bank\",\n  \"description\": \"A bank.\",\n  \"scripts\": {\n    \"docs\": \"mine\"\n  }\n}\n",
      ".gitignore": "node_modules/\ndocs/dist/\n"
    })
    expect(init(dir).status).toBe(0)
    const config = read(dir, "docs/blume.config.ts")
    expect(config).toContain("import { effectscript } from \"effectscript/blume\"")
    expect(config).toContain("title: \"bank\"")
    expect(config).toContain("content: { root: \".\", exclude: [\"**/_*\", \"**/.*\", \"dist/**\", \"node_modules/**\"] }")
    expect(read(dir, "docs/index.md")).toContain("A bank.")
    const pkg = JSON.parse(read(dir, "package.json"))
    expect(pkg.scripts.docs).toBe("mine")
    expect(pkg.scripts["docs:build"]).toBe("efx docs && cd docs && blume build")
    expect(pkg.scripts["docs:dev"]).toBe("efx docs && cd docs && blume dev")
    expect(read(dir, ".gitignore")).toBe("node_modules/\ndocs/dist/\ndocs/api/\ndocs/.blume/\n")
    fs.writeFileSync(path.join(dir, "docs/blume.config.ts"), "// mine\n")
    expect(init(dir).status).toBe(0)
    expect(read(dir, "docs/blume.config.ts")).toBe("// mine\n")
    expect(init(dir).stdout).toContain("blume")
  })
```

The last assertion checks that the "Install:" hint lists `blume`, because it isn't a dependency
yet.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --run packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/init.test.ts`
Expected: FAIL.

- [ ] **Step 3: Copy the grammars, implement `src/blume.ts`, and add `"grammars/*.json"` to `files`**

```bash
mkdir -p packages/effectscript/core/grammars
cp packages/effectscript/vscode/syntaxes/effectscript.tmLanguage.json packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json packages/effectscript/core/grammars/
```

```ts
/**
 * `effectscript/blume` (ADR-0043): an Astro integration for Blume that highlights ```efx code
 * blocks with the EffectScript grammars (the VS Code extension's, copied into `grammars/`).
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"

/**
 * The part of an Astro integration this package uses (structural: Astro is Blume's dependency).
 *
 * @since 4.0.0
 * @category models
 */
export interface AstroIntegration {
  readonly name: string
  readonly hooks: {
    readonly "astro:config:setup": (options: { readonly updateConfig: (config: object) => unknown }) => void
  }
}

const grammar = (file: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(new URL(`../grammars/${file}`, import.meta.url), "utf8"))

/**
 * @since 4.0.0
 * @category integrations
 */
export const effectscript = (): AstroIntegration => ({
  name: "effectscript",
  hooks: {
    "astro:config:setup": ({ updateConfig }) => {
      const efx = { ...grammar("effectscript.tmLanguage.json"), name: "efx", aliases: ["effectscript"], embeddedLangs: ["tsx"] }
      const injection = { ...grammar("effectscript.injection.tmLanguage.json"), name: "efx-injection", injectTo: ["source.efx"] }
      updateConfig({ markdown: { shikiConfig: { langs: ["tsx", injection, efx] } } })
    }
  }
})
```

`new URL("../grammars/…", import.meta.url)` resolves from both `src/blume.ts` and
`dist/blume.js` to `core/grammars/`.

- [ ] **Step 4: Extend `src/cli/init.ts`**

- Add `["docs", "efx docs"]`, `["docs:dev", "efx docs && cd docs && blume dev"]` and
  `["docs:build", "efx docs && cd docs && blume build"]` to `scripts`. The existing loop adds only
  the missing ones.
- When `package.json` exists, read `name` (default: the folder name) and `description`.
- Write `docs/blume.config.ts`, unless it exists:

  ```ts
  const blumeConfig = (title: string) =>
    `import { defineConfig } from "blume"\nimport { effectscript } from "effectscript/blume"\n\n` +
    `export default defineConfig({\n  title: ${JSON.stringify(title)},\n` +
    `  content: { root: ".", exclude: ["**/_*", "**/.*", "dist/**", "node_modules/**"] },\n` +
    `  integrations: [effectscript()]\n})\n`
  ```

  Print `docs/blume.config.ts: added a Blume site (efx docs writes docs/api)`.
- Write `docs/index.md`, unless `docs/index.md` or `docs/index.mdx` exists:
  `---\ntitle: <name>\n---\n\n<description>\n\nSee the [API reference](./api/).\n`. Leave the
  description line out when there is none.
- In `.gitignore`, created if missing, append each of `docs/api/`, `docs/.blume/` and `docs/dist/`
  that isn't already present as a line, keeping the file's trailing newline.
- Add `blume` to `missing` when it isn't in dependencies or devDependencies.

- [ ] **Step 5: Run the tests**

Run: `pnpm test --run packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/init.test.ts`
Expected: PASS. Existing init tests may need to expect the new scripts and files. Update them to
the documented behavior.

- [ ] **Step 6: Verify with a real Blume build (manual; Node ≥ 22.12)**

In a scratchpad copy of `packages/effectscript/examples`, run `efx init`, install `blume@2.1.0`,
then run `npm run docs:build` and `cd docs && npx blume validate`.
Expected:
- the build succeeds;
- `validate` reports no broken links;
- `docs/dist/api/bank/index.html` has `efx` blocks whose `effect`/`throws` spans carry keyword
  colors;
- the package's own `dist/`, if there is one, is untouched.

Record the result in the commit message body.

- [ ] **Step 7: Lint, type-check and commit**

```bash
pnpm lint-fix && pnpm check
git add packages/effectscript/core/grammars packages/effectscript/core/src/blume.ts packages/effectscript/core/package.json packages/effectscript/core/src/cli/init.ts packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/init.test.ts
git commit -m "feat(effectscript): effectscript/blume and Blume scaffolding in efx init (Plan 12 Task 7, ADR-0043)"
```

---

### Task 8: Documentation, changeset and final review

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-effectscript-design.md`:
  - §4.14: a `doctest` subsection that points to the docs spec;
  - §4.19: the `doctest` trigger row;
  - §7.1: `efx docs`;
  - §12: the area 9 note on EFX93xx;
  - §14: mark docs/doctests as delivered and link Plan 12.
- Modify: `docs/superpowers/specs/2026-10-03-effectscript-docs-design.md` (status → Implemented, plus an execution record of deviations).
- Modify: `packages/effectscript/COMPATIBILITY.md` (a row for each new claim, with the test that proves it).
- Modify: `packages/effectscript/examples/README.md` (doctests, `efx docs`).
- Create: `.changeset/effectscript-living-docs.md`.

- [ ] **Step 1: Update the docs above**

Keep the existing style. Each claim names the test that proves it (spec §0 "Status"). The
changeset is a `minor` bump for `effectscript`:

```md
---
"effectscript": minor
---

Living docs: doc comments written once at the definition, `efx` examples that run as doctests
(`doctest "./x.efx" with Layer`), `efx docs` for Blume-ready Markdown, and `effectscript/blume`.
```

- [ ] **Step 2: Run the full validation for touched areas**

Run: `pnpm lint-fix && pnpm check && pnpm test --run packages/effectscript/core/test packages/effectscript/examples/test`
Expected: PASS. Also run `pnpm --filter effectscript codegen` and confirm `git status` shows no
change to `src/cli/main.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs packages/effectscript/COMPATIBILITY.md packages/effectscript/examples/README.md .changeset/effectscript-living-docs.md
git commit -m "docs(effectscript): spec, compatibility and changeset for living docs (Plan 12 Task 8)"
```

- [ ] **Step 4: Final whole-branch review**

Dispatch one fresh reviewer on the Plan 12 commit range. Give it this plan, the docs spec and
ADR-0042/0043, and have it check the Review Focus items in particular. Fix what it confirms, with
an ADR for any decision it changes.
