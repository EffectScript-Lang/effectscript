/**
 * `efx init` (spec §7.1): add the EffectScript TS plugin to tsconfig.json and the scripts to
 * package.json, without overwriting anything, and say what to install next.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { member, parseJsonc } from "./jsonc.ts"

const plugin = "@effectscript/language"
const pluginEntry = `{ "name": "${plugin}" }`

/** The indentation of the line `offset` is on. */
const indentAt = (text: string, offset: number): string =>
  /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", offset - 1) + 1))![0]

/** Adds the plugin to a tsconfig text; `undefined` when it is already there or can't be edited. */
export const withPlugin = (text: string): string | undefined => {
  const root = parseJsonc(text)
  if (root?.kind !== "object") return undefined
  const options = member(root, "compilerOptions")
  const plugins = member(options, "plugins")
  if (plugins?.kind === "array") {
    if (
      plugins.items.some((p) =>
        p.kind === "object" && (member(p, "name") as { value?: unknown } | undefined)?.value === plugin
      )
    ) {
      return undefined
    }
    const last = plugins.items[plugins.items.length - 1]
    return last === undefined
      ? `${text.slice(0, plugins.start + 1)}${pluginEntry}${text.slice(plugins.end - 1)}`
      : `${text.slice(0, last.end)}, ${pluginEntry}${text.slice(last.end)}`
  }
  const target = options?.kind === "object" ? options : root
  const inner = `${indentAt(text, target.start)}  `
  const entry = `"plugins": [${pluginEntry}]`
  const property = target === root ? `"compilerOptions": {\n${inner}  ${entry}\n${inner}}` : entry
  const empty = target.entries.length === 0
  return `${text.slice(0, target.start + 1)}\n${inner}${property}${empty ? "\n" : ","}${
    empty ? indentAt(text, target.start) : ""
  }${text.slice(target.start + 1).replace(/^[ \t]*(?=\S)/, empty ? "" : "\n")}`
}

const scripts: ReadonlyArray<readonly [string, string]> = [
  ["check", "efx check"],
  ["build:efx", "efx build"],
  ["docs", "efx docs"],
  ["docs:dev", "efx docs && cd docs && blume dev"],
  ["docs:build", "efx docs && cd docs && blume build"]
]

/** The Blume site lives in `docs/`: Blume always builds into `dist/` next to its config (ADR-0043). */
const blumeConfig = (title: string): string =>
  `import { defineConfig } from "blume"\nimport { effectscript } from "effectscript/blume"\n\n` +
  `export default defineConfig({\n  title: ${JSON.stringify(title)},\n` +
  `  content: { root: ".", exclude: ["**/_*", "**/.*", "dist/**", "node_modules/**"] },\n` +
  `  integrations: [effectscript()]\n})\n`

const docsHome = (title: string, description: string | undefined): string =>
  `---\ntitle: ${JSON.stringify(title)}\n${
    description === undefined ? "" : `description: ${JSON.stringify(description)}\n`
  }---\n\n` +
  `${description === undefined ? "" : `${description}\n\n`}` +
  `See the [API reference](./api/).\n`

const ignored = ["docs/api/", "docs/.blume/", "docs/dist/"]

/** Adds the Blume site to `docs/` and its outputs to `.gitignore`, never overwriting. */
const setUpDocs = (
  cwd: string,
  pkg: { readonly name?: unknown; readonly description?: unknown } | undefined,
  out: (line: string) => void
): boolean => {
  let changed = false
  const title = typeof pkg?.name === "string" ? pkg.name : path.basename(cwd)
  const description = typeof pkg?.description === "string" && pkg.description !== "" ? pkg.description : undefined
  const docs = path.join(cwd, "docs")
  const config = path.join(docs, "blume.config.ts")
  if (!fs.existsSync(config)) {
    fs.mkdirSync(docs, { recursive: true })
    fs.writeFileSync(config, blumeConfig(title))
    out("docs/blume.config.ts: added a Blume site (efx docs writes the API pages to docs/api)")
    changed = true
  }
  if (!fs.existsSync(path.join(docs, "index.md")) && !fs.existsSync(path.join(docs, "index.mdx"))) {
    fs.writeFileSync(path.join(docs, "index.md"), docsHome(title, description))
    out("docs/index.md: added the docs home page")
    changed = true
  }
  const gitignore = path.join(cwd, ".gitignore")
  const text = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : ""
  const lines = new Set(text.split(/\r?\n/).map((line) => line.trim()))
  const missing = ignored.filter((entry) => !lines.has(entry))
  if (missing.length > 0) {
    const prefix = text === "" || text.endsWith("\n") ? text : `${text}\n`
    fs.writeFileSync(gitignore, `${prefix}${missing.join("\n")}\n`)
    out(`.gitignore: added ${missing.join(", ")}`)
    changed = true
  }
  return changed
}

/**
 * Runs `efx init` in `cwd`. Returns the exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const initProject = (cwd: string, out: (line: string) => void): number => {
  let changed = false
  const tsconfigPath = path.join(cwd, "tsconfig.json")
  if (fs.existsSync(tsconfigPath)) {
    const text = fs.readFileSync(tsconfigPath, "utf8")
    const updated = withPlugin(text)
    if (parseJsonc(text)?.kind !== "object") {
      out(
        `tsconfig.json isn't valid JSON (with comments): add { "name": "${plugin}" } to compilerOptions.plugins by hand`
      )
      changed = true
    } else if (updated !== undefined) {
      fs.writeFileSync(tsconfigPath, updated)
      out(`tsconfig.json: added the ${plugin} plugin (editor support for .efx)`)
      changed = true
    }
  } else {
    out("No tsconfig.json here: create one, then run efx init again")
  }
  const pkgPath = path.join(cwd, "package.json")
  let missing: Array<string> = []
  if (fs.existsSync(pkgPath)) {
    const text = fs.readFileSync(pkgPath, "utf8")
    let pkg: {
      name?: unknown
      description?: unknown
      scripts?: Record<string, string>
      dependencies?: object
      devDependencies?: object
    }
    try {
      pkg = JSON.parse(text)
    } catch {
      out("package.json isn't valid JSON: fix it, then run efx init again")
      return 1
    }
    const indent = /^\{\s*\n([ \t]+)/.exec(text)?.[1] ?? "  "
    const added = scripts.filter(([name]) => pkg.scripts?.[name] === undefined)
    if (added.length > 0) {
      pkg.scripts = { ...pkg.scripts, ...Object.fromEntries(added) }
      fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`)
      out(`package.json: added the ${added.map(([name]) => `"${name}"`).join(" and ")} script(s)`)
      changed = true
    }
    const deps: Record<string, unknown> = { ...pkg.dependencies, ...pkg.devDependencies }
    missing = ["effectscript", plugin, "typescript", "blume"].filter((name) => deps[name] === undefined)
    if (setUpDocs(cwd, pkg, out)) changed = true
  }
  if (!changed) out("This project is already set up for EffectScript")
  if (missing.length > 0) {
    out(`Install: npm i -D ${missing.map((name) => (name === "typescript" ? "typescript@6" : name)).join(" ")}`)
  }
  out("Next: efx setup (your editors and coding agents), then efx convert (preview converting this project)")
  return 0
}
