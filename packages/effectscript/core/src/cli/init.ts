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

const scripts: ReadonlyArray<readonly [string, string]> = [["check", "efx check"], ["build:efx", "efx build"]]

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
    const updated = withPlugin(fs.readFileSync(tsconfigPath, "utf8"))
    if (updated !== undefined) {
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
    const pkg = JSON.parse(text)
    const indent = /^\{\s*\n([ \t]+)/.exec(text)?.[1] ?? "  "
    const added = scripts.filter(([name]) => pkg.scripts?.[name] === undefined)
    if (added.length > 0) {
      pkg.scripts = { ...pkg.scripts, ...Object.fromEntries(added) }
      fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`)
      out(`package.json: added the ${added.map(([name]) => `"${name}"`).join(" and ")} script(s)`)
      changed = true
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    missing = ["effectscript", plugin, "typescript"].filter((name) => deps[name] === undefined)
  }
  if (!changed) out("This project is already set up for EffectScript")
  if (missing.length > 0) {
    out(`Install: npm i -D ${missing.map((name) => (name === "typescript" ? "typescript@6" : name)).join(" ")}`)
  }
  out("Next: efx convert (preview converting this project to EffectScript)")
  return 0
}
