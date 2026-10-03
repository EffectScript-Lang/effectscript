import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { generateOnce, typescriptLib } from "./utils/generate.ts"

const root = path.join(import.meta.dirname, "..")
const repo = path.join(root, "../../..")
const cli = path.join(root, "node_modules/.bin/tree-sitter")
// compiled parsers go to a cache inside the package, never the user's home
const env = { ...process.env, TREE_SITTER_LIBDIR: path.join(root, ".tree-sitter-cache") }
const run = (args: ReadonlyArray<string>) =>
  spawnSync(cli, [...args], { cwd: root, encoding: "utf8", env, maxBuffer: 1 << 28 })

beforeAll(generateOnce, 300_000)

/** Every `.ts` file under `dir`, sorted. */
const tsFiles = (dir: string): Array<string> =>
  (fs.readdirSync(dir, { recursive: true }) as Array<string>)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .sort()
    .map((f) => path.join(dir, f))

describe("tree-sitter-effectscript (Plan 19, ADR-0058)", () => {
  it("parses TypeScript to the same tree as tree-sitter-typescript (the superset guarantee)", async () => {
    const ts = await typescriptLib()
    const all = tsFiles(path.join(repo, "packages/effect/src"))
    // every effect source file (review C1: a sample missed `Schema.make<typeof schema>(`)
    const sample = all
    // where tree-sitter-typescript 0.23 can't parse newer syntax, both grammars are in error
    // recovery, which isn't a contract; everywhere else the trees must be identical
    // (the JSON follows a line per file with errors)
    const summary = JSON.parse(
      /^\{[\s\S]*/m.exec(run(["parse", "-q", "-j", ...ts, ...sample]).stdout)![0]
    ) as {
      readonly parse_summaries: ReadonlyArray<{ readonly file: string; readonly successful: boolean }>
    }
    const clean = summary.parse_summaries.filter((s) => s.successful).map((s) => s.file)
    expect(clean.length).toBeGreaterThan(30)
    const ours = run(["parse", ...clean])
    const theirs = run(["parse", ...ts, ...clean])
    expect(theirs.status, theirs.stderr).toBe(0)
    expect(ours.status, ours.stdout.match(/^.*ERROR.*$/m)?.[0]).toBe(0)
    expect(ours.stdout === theirs.stdout).toBe(true)
  }, 300_000)

  it("parses every .efx file the project ships without errors", () => {
    const efxFiles = (dir: string): Array<string> =>
      (fs.readdirSync(dir, { recursive: true }) as Array<string>)
        .filter((f) => f.endsWith(".efx") && !f.includes("node_modules"))
        .sort()
        .map((f) => path.join(dir, f))
    const packages = path.join(root, "..")
    const files = [
      ...efxFiles(path.join(packages, "core/test/fixtures")),
      ...efxFiles(path.join(packages, "core/src")),
      ...efxFiles(path.join(packages, "examples")),
      ...efxFiles(path.join(packages, "site/src/samples"))
    ]
    // and every `efx` fence in the agent skill (what agents learn EffectScript from)
    const skill = path.join(packages, "core/skills/effectscript")
    const fences = (fs.readdirSync(skill, { recursive: true }) as Array<string>).filter((f) => f.endsWith(".md"))
      .flatMap((f) => [...fs.readFileSync(path.join(skill, f), "utf8").matchAll(/^```efx[^\n]*\n([\s\S]*?)^```$/gm)])
      .map((m) => m[1]!)
    expect(fences.length).toBeGreaterThan(20)
    const fenceDir = path.join(root, ".tree-sitter-cache/skill-fences")
    fs.rmSync(fenceDir, { recursive: true, force: true })
    fs.mkdirSync(fenceDir, { recursive: true })
    fences.forEach((code, i) => {
      const file = path.join(fenceDir, `fence-${i}.efx`)
      fs.writeFileSync(file, code)
      files.push(file)
    })
    expect(files.length).toBeGreaterThan(70)
    const out = run(["parse", "-q", "-j", ...files]).stdout
    const summary = JSON.parse(/^\{[\s\S]*/m.exec(out)![0]) as {
      readonly parse_summaries: ReadonlyArray<{ readonly file: string; readonly successful: boolean }>
    }
    const failed = summary.parse_summaries.filter((s) => !s.successful).map((s) =>
      s.file.includes("skill-fences")
        ? `${path.basename(s.file)}: ${fs.readFileSync(s.file, "utf8").slice(0, 120)}`
        : path.relative(packages, s.file)
    )
    expect(failed).toEqual([])
  }, 300_000)

  it("passes its corpus: each construct's tree, and keywords used as identifiers", () => {
    const result = run(["test"])
    expect(result.stdout).toMatch(/successful parses: (\d+); failed parses: 0/)
    expect(result.status).toBe(0)
  }, 300_000)

  it("ships queries generated from JavaScript's, TypeScript's and its own", () => {
    const check = spawnSync(process.execPath, [path.join(root, "scripts/queries.mjs"), "--check"], { encoding: "utf8" })
    expect(check.stderr).toBe("")
    expect(check.status).toBe(0)
    // every query, Helix's included, compiles against the grammar
    const queries = (fs.readdirSync(path.join(root, "queries"), { recursive: true }) as Array<string>)
      .filter((f) => f.endsWith(".scm") && !f.startsWith("src"))
    expect(queries).toEqual(
      expect.arrayContaining(["folds.scm", "indents.scm", "helix/highlights.scm", "helix/indents.scm"])
    )
    const sample = path.join(root, "../core/test/fixtures/service/basic.efx")
    for (const file of queries) {
      const query = run(["query", path.join("queries", file), sample])
      expect(query.status, `${file}: ${query.stderr}`).toBe(0)
    }
  })

  it("keeps EffectScript's keywords TypeScript names in type positions (review C1)", async () => {
    const ts = await typescriptLib()
    const keywords = [
      "effect",
      "schema",
      "error",
      "service",
      "layer",
      "config",
      "atom",
      "group",
      "api",
      "command",
      "test",
      "describe",
      "doctest",
      "impl",
      "main",
      "defer",
      "throws",
      "needs",
      "match",
      "when",
      "middleware"
    ]
    const lines = keywords.flatMap((k) => [
      `f<typeof ${k}>(x)`,
      `f<${k}>(x)`,
      `f<${k}.Type>(x)`,
      `type T${k} = (typeof ${k})["Type"]`,
      `type A${k} = (typeof ${k})[]`,
      `type M${k} = { [${k} in X]: 1 }`,
      `let v${k}: ${k}.Inner<${k}> = g(${k})`,
      `function h${k}<${k}>(a: ${k}): typeof ${k} { return a }`
    ])
    const file = path.join(root, ".tree-sitter-cache/keywords.ts")
    fs.writeFileSync(file, `${lines.join("\n")}\n`)
    const ours = run(["parse", file])
    const theirs = run(["parse", ...ts, file])
    expect(theirs.status, "tree-sitter-typescript parses every line").toBe(0)
    const trees = (out: string) => out.split("\n").filter((l) => !l.includes("Parse:"))
    const [a, b] = [trees(ours.stdout), trees(theirs.stdout)]
    const first = a.findIndex((line, i) => line !== b[i])
    expect(first === -1 ? "same" : `${a[first]} vs ${b[first]}`).toBe("same")
  }, 300_000)

  it("keeps TypeScript statements that start like EffectScript ones (review I4, I5)", async () => {
    const ts = await typescriptLib()
    const file = path.join(root, ".tree-sitter-cache/statements.ts")
    fs.writeFileSync(
      file,
      [
        "function g() { defer(cleanup) }",
        "defer(1)",
        "let x = 0",
        "do { x++ }",
        "while (x < 3)",
        "match(x)",
        "{ x = 1 }",
        "main()",
        "{ x = 2 }",
        ""
      ].join("\n")
    )
    const ours = run(["parse", file]).stdout.split("\n").filter((l) => !l.includes("Parse:"))
    const theirs = run(["parse", ...ts, file]).stdout.split("\n").filter((l) => !l.includes("Parse:"))
    expect(ours).toEqual(theirs)
  }, 300_000)
})
