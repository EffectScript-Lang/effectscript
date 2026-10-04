/**
 * `pnpm codegen` for the EffectScript skill (ADR-0051): writes the generated references in
 * `skills/effectscript/references/`. With `--check`, reports stale files instead (exit 1).
 *
 * - `syntax.md`: every language fixture (`test/fixtures/<construct>/<name>.efx`) with the
 *   TypeScript it compiles to, which the golden tests verify. A new construct gets a section here,
 *   or the skill test fails.
 * - `effect-docs.md`: Effect's agent guide in EffectScript (`@effectscript/effect-docs`, ADR-0050).
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

const root = path.join(import.meta.dirname, "..")
const fixtures = path.join(root, "test/fixtures")
const references = path.join(root, "skills/effectscript/references")

/** The spec's construct order, with each construct's title (no section numbers: an installed skill has no spec). */
const constructs: ReadonlyArray<readonly [dir: string, title: string]> = [
  ["effect", "`effect` functions, blocks, `await` and `throw`"],
  ["resources", "Resources: `defer`, `using … await`, `for await`"],
  ["try", "`try` / `catch` / `finally` inside `effect`"],
  ["schema", "`schema`: data types that are TypeScript types"],
  ["error", "`error`"],
  ["service", "`service`"],
  ["layer", "Top-level `layer`"],
  ["pipeline", "Pipeline `|>`"],
  ["main", "`main`"],
  ["match", "`match`"],
  ["proposals", "Other adopted proposals"],
  ["prelude", "Prelude: automatic imports and builtins"],
  ["config", "`config`"],
  ["test", "`test` / `describe` on `@effect/vitest`"],
  ["http", "`api` / `group` / `impl`: HttpApi"],
  ["cli", "`command`: CLIs on `effect/cli`"],
  ["rpc", "`rpc` / `impl`: RPC groups on `effect/rpc`"],
  ["ai", "`tool` / `toolkit`: AI tools on `effect/ai`"],
  ["cluster", "`entity`: cluster entities on `effect/cluster`"],
  ["atom", "`atom`: reactive state"],
  ["ambient", "Ambient capture: `console`, `Date`, `Math`, `process.env`"],
  ["hygiene", "Name hygiene: what the compiler generates never clashes with your names"]
]

const title = (name: string) => {
  const words = name.replace(/[-_]/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const syntax = (): string => {
  const known = new Set(constructs.map(([dir]) => dir))
  const missing = fs.readdirSync(fixtures, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !known.has(d.name)).map((d) => d.name)
  if (missing.length > 0) {
    throw new Error(`no section for fixtures/${missing.join(", fixtures/")}: add it to constructs`)
  }
  const out = [
    "# EffectScript syntax, construct by construct",
    "",
    "Generated from the compiler's test fixtures (`pnpm codegen`). Each example shows the",
    "EffectScript and the TypeScript it compiles to, which the golden tests check. Read the",
    "EffectScript to learn the form; read the TypeScript to see exactly what it means.",
    ""
  ]
  for (const [dir, heading] of constructs) {
    out.push(`## ${heading}`, "", `<!-- fixtures/${dir} -->`)
    const names = fs.readdirSync(path.join(fixtures, dir))
      .filter((f) => f.endsWith(".efx") && !f.endsWith(".reverse.efx")).sort()
    for (const file of names) {
      const name = file.replace(/\.efx$/, "")
      const efx = fs.readFileSync(path.join(fixtures, dir, file), "utf8").trimEnd()
      const compiled = path.join(fixtures, dir, `${name}.ts`)
      out.push("", `### ${title(name)}`, "", "```efx", efx, "```")
      if (fs.existsSync(compiled)) {
        out.push("", "Compiles to:", "", "```ts", fs.readFileSync(compiled, "utf8").trimEnd(), "```")
      }
    }
    out.push("")
  }
  return out.join("\n")
}

const effectDocs = (): string => {
  // the examples it links live in the docs package, not in the installed skill: link them on GitHub
  const llms = fs.readFileSync(path.join(root, "../effect-docs/content/LLMS.efx.md"), "utf8").replaceAll(
    "](./ai-docs/",
    "](https://github.com/EffectScript-Lang/effectscript/blob/effectscript/packages/effectscript/effect-docs/content/ai-docs/"
  )
  return [
    "<!-- Generated from @effectscript/effect-docs content/LLMS.efx.md (ADR-0050): Effect's guide for agents, with EffectScript code. -->",
    "",
    llms.trimEnd(),
    ""
  ].join("\n")
}

/**
 * dprint-formatted, as `pnpm lint` keeps every markdown file in the repository. A long line in a
 * code block can format differently a second time, so it is formatted until it stops changing.
 */
const formatted = (file: string, text: string): string => {
  let current = text
  for (let pass = 0; pass < 4; pass++) {
    const result = spawnSync("pnpm", ["exec", "dprint", "fmt", "--stdin", `skills/effectscript/references/${file}`], {
      input: current,
      encoding: "utf8",
      cwd: root
    })
    if (result.status !== 0) throw new Error(`dprint failed on ${file}: ${result.stderr}`)
    if (result.stdout === current) return current
    current = result.stdout
  }
  throw new Error(`dprint didn't settle on ${file}`)
}

const files = new Map(
  [["syntax.md", syntax()], ["effect-docs.md", effectDocs()]].map(([f, t]) => [f!, formatted(f!, t!)])
)
if (process.argv.includes("--check")) {
  for (const [file, text] of files) {
    const target = path.join(references, file)
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== text) {
      process.stderr.write(`skills/effectscript/references/${file} is stale: run pnpm codegen\n`)
      process.exitCode = 1
    }
  }
} else {
  fs.mkdirSync(references, { recursive: true })
  for (const [file, text] of files) fs.writeFileSync(path.join(references, file), text)
}
