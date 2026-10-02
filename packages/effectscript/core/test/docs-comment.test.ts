import { parse } from "effectscript/compiler/parser/parse"
import { jsdocBefore } from "effectscript/compiler/transform/command"
import { docCommentBefore, isModuleDoc, parseDocComment } from "effectscript/docs/comment"
import { describe, expect, it } from "vitest"

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
    const d = doc(
      "/**\n * ```efx\n * a\n * ```\n * ```ts\n * b\n * ```\n * ```efx ignore\n * z\n * ```\n * ~~~efx title=\"x\"\n * c\n * ~~~\n */"
    )
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
    expect(jsdocBefore(source, 0, source.indexOf("--"))).toEqual({
      description: "The tsconfig.json to build",
      alias: "p"
    })
    const multi = "/**\n * Line one\n * line two\n */\n"
    expect(jsdocBefore(multi, 0, multi.length)).toEqual({ description: "Line one line two" })
  })
})
