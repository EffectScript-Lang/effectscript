import { planConversion, retargetImports } from "effectscript/convert/plan"
import { describe, expect, it } from "vitest"

const effectFile =
  "import { Effect } from \"effect\"\nexport const f = Effect.fn(\"f\")(function*() {\n  return 1\n})\n"

describe("efx convert planner (Plan 8 Task 4)", () => {
  const files = new Map([
    ["src/a.ts", effectFile],
    ["src/lib/index.ts", effectFile],
    ["src/plain.ts", "export const n = 1\n"],
    [
      "src/use.ts",
      "import { f } from \"./a.js\"\nimport { f as g } from \"./a\"\nimport * as lib from \"./lib\"\nexport { f as h } from \"./a.ts\"\nexport const later = () => import(\"./lib/index.js\")\nimport { n } from \"./plain.js\"\n"
    ],
    ["src/types.d.ts", effectFile],
    ["vite.config.ts", effectFile],
    ["node_modules/x/index.ts", effectFile]
  ])

  it("renames the files the conversion changes, and only those", () => {
    const plan = planConversion(files, {})
    expect(plan.renames.map((r) => [r.from, r.to])).toEqual([
      ["src/a.ts", "src/a.efx"],
      ["src/lib/index.ts", "src/lib/index.efx"]
    ])
    expect(plan.renames[0]!.code).toContain("export effect f()")
    const reasons = Object.fromEntries(plan.skipped.map((s) => [s.file, s.reason]))
    expect(reasons["src/plain.ts"]).toMatch(/nothing to re-sugar/)
    expect(reasons["src/types.d.ts"]).toMatch(/declaration/)
    expect(reasons["vite.config.ts"]).toMatch(/config/)
    expect(reasons["node_modules/x/index.ts"]).toBeUndefined()
  })

  it("rewrites every specifier form that resolves to a renamed file", () => {
    const plan = planConversion(files, {})
    const use = plan.edits.find((e) => e.file === "src/use.ts")!.code
    expect(use).toBe(
      "import { f } from \"./a.efx\"\nimport { f as g } from \"./a.efx\"\nimport * as lib from \"./lib/index.efx\"\nexport { f as h } from \"./a.efx\"\nexport const later = () => import(\"./lib/index.efx\")\nimport { n } from \"./plain.js\"\n"
    )
  })

  it("restricts the conversion to the given paths and to an explicit set", () => {
    expect(planConversion(files, { paths: ["src/lib"] }).renames.map((r) => r.from)).toEqual(["src/lib/index.ts"])
    const only = planConversion(files, { only: new Set(["src/a.ts"]) })
    expect(only.renames.map((r) => r.from)).toEqual(["src/a.ts"])
    expect(only.edits.find((e) => e.file === "src/use.ts")!.code).toContain("import * as lib from \"./lib\"")
  })

  it("rewrites imports inside renamed files too", () => {
    const plan = planConversion(
      new Map([["src/a.ts", effectFile], [
        "src/b.ts",
        `import { f } from "./a.js"\n${effectFile.replace("\"f\"", "\"g\"").replace("const f", "const g")}`
      ]]),
      {}
    )
    expect(plan.renames.find((r) => r.from === "src/b.ts")!.code).toContain("from \"./a.efx\"")
  })
})

describe("retargetImports (Plan 11 Task 5, ADR-0041)", () => {
  it("points every importer of a converted file at its new name", () => {
    const files = new Map([
      ["src/a.efx", "export const a = 1\n"],
      ["src/b.ts", "import { a } from \"./a.efx\"\nexport { a as c } from './a.efx'\nconst d = import(\"./a.efx\")\n"],
      ["test/t.ts", "import { a } from \"../src/a.efx\"\n"],
      ["src/other.ts", "import { x } from \"./x.efx\"\n"]
    ])
    expect(retargetImports(files, "src/a.efx", "src/a.ts")).toEqual([
      {
        file: "src/b.ts",
        code: "import { a } from \"./a.ts\"\nexport { a as c } from './a.ts'\nconst d = import(\"./a.ts\")\n"
      },
      { file: "test/t.ts", code: "import { a } from \"../src/a.ts\"\n" }
    ])
  })

  it("leaves the converted file and node_modules alone", () => {
    const files = new Map([
      ["a.efx", "import { b } from \"./b.efx\"\n"],
      ["b.efx", "import { a } from \"./a.efx\"\n"],
      ["node_modules/p/index.ts", "import { a } from \"../../a.efx\"\n"]
    ])
    expect(retargetImports(files, "a.efx", "a.ts")).toEqual([{ file: "b.efx", code: "import { a } from \"./a.ts\"\n" }])
  })
})

describe("planning cost (review of Plan 11, M1)", () => {
  // 3,000 files that import other modules but can't import the converted one
  const files = new Map<string, string>()
  const body = Array.from(
    { length: 60 },
    (_, i) => `import { v${i} } from "./mod${i}.ts"\nexport const w${i} = v${i} + 1`
  ).join("\n")
  for (let i = 0; i < 3000; i++) files.set(`src/f${i}.ts`, body)
  files.set("src/a.efx", "export const a = 1\n")
  files.set("src/b.ts", "import { a } from \"./a.efx\"\n")
  files.set(
    "src/c.ts",
    "import { Effect } from \"effect\"\nexport const f = Effect.fn(\"f\")(function*() { return 1 })\n"
  )
  files.set(
    "src/lib/index.ts",
    "import { Effect } from \"effect\"\nexport const g = Effect.fn(\"g\")(function*() { return 1 })\n"
  )
  files.set("src/d.ts", "import { g } from \"./lib\"\n")

  it("only parses files that mention the converted file", () => {
    const started = performance.now()
    expect(retargetImports(files, "src/a.efx", "src/a.ts")).toEqual([{
      file: "src/b.ts",
      code: "import { a } from \"./a.ts\"\n"
    }])
    const plan = planConversion(files, { only: new Set(["src/c.ts", "src/lib/index.ts"]) })
    expect(plan.edits).toEqual([{ file: "src/d.ts", code: "import { g } from \"./lib/index.efx\"\n" }])
    expect(performance.now() - started).toBeLessThan(400)
  })
})
