import { analyze } from "effectscript/compiler/analyze/scope"
import { emitImports, makeImportSet } from "effectscript/compiler/imports"
import { parse } from "effectscript/compiler/parser/parse"
import { MagicString } from "magic-string"
import { describe, expect, it } from "vitest"

const run = (source: string, needs: ReadonlyArray<readonly [string, string]>): string => {
  const parsed = parse(source)
  if (parsed._tag === "Failure") throw new Error("parse failed")
  const s = new MagicString(source)
  const imports = makeImportSet()
  for (const [module, name] of needs) imports.need(module, name)
  emitImports({ source, s, imports, analysis: analyze(parsed.program) })
  return s.toString()
}

describe("imports", () => {
  it("adds nothing when nothing is needed", () => {
    expect(run("const a = 1\n", [])).toBe("const a = 1\n")
  })

  it("merges, dedupes and sorts needed names per module", () => {
    expect(
      run("x\n", [["effect", "Schema"], ["effect", "Effect"], ["effect", "Effect"], ["effect/http", "HttpClient"]])
    )
      .toBe("import { Effect, Schema } from \"effect\"\nimport { HttpClient } from \"effect/http\"\nx\n")
  })

  it("skips names the file already binds and merges into an existing import", () => {
    expect(run("import { Effect } from \"effect\"\nx\n", [["effect", "Effect"], ["effect", "Layer"]]))
      .toBe("import { Effect, Layer } from \"effect\"\nx\n")
  })

  it("never merges into type-only or namespace imports", () => {
    expect(run("import type { Option } from \"effect\"\nimport * as E from \"effect\"\nx\n", [["effect", "Effect"]]))
      .toBe(
        "import { Effect } from \"effect\"\nimport type { Option } from \"effect\"\nimport * as E from \"effect\"\nx\n"
      )
  })

  it("keeps a hashbang first", () => {
    expect(run("#!/usr/bin/env node\nx\n", [["effect", "Effect"]]))
      .toBe("#!/usr/bin/env node\nimport { Effect } from \"effect\"\nx\n")
  })
})
