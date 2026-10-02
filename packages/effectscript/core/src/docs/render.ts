/**
 * Markdown pages for Blume (docs spec §3.2): the signature first, then a facts table assembled from
 * each linked definition's own summary, so every fact is written once (ADR-0042, ADR-0043).
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
 * A GitHub-style heading slug, which is what Blume uses for anchors.
 *
 * @since 4.0.0
 * @category utils
 */
export const slug = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9 _-]/g, "").replace(/ /g, "-")

/**
 * The page of a module, relative to the output directory.
 *
 * @since 4.0.0
 * @category utils
 */
export const pageFile = (module: DocModule): string => (module.path === "" ? "index.md" : `${module.path}.md`)

/** Splits a type at its top-level `|`. */
const splitUnion = (type: string): Array<string> => {
  const parts: Array<string> = []
  let depth = 0
  let current = ""
  for (const c of type) {
    if ("<([{".includes(c)) depth++
    else if (">)]}".includes(c)) depth--
    if (c === "|" && depth === 0) {
      parts.push(current)
      current = ""
    } else {
      current += c
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part !== "")
}

const flat = (text: string): string => text.replace(/\s*\n\s*/g, " ").trim()

const cellText = (text: string): string => flat(text).replace(/\|/g, "\\|")

interface Target {
  readonly href: string
  readonly declaration: DocDeclaration
}

const resolve = (site: DocSite, module: DocModule, name: string): Target | undefined => {
  const local = module.declarations.find((d) => d.name === name)
  if (local !== undefined) return { href: `#${slug(name)}`, declaration: local }
  const imported = module.imports.get(name)
  if (imported === undefined) return undefined
  const base = path.resolve(path.dirname(module.file), imported.from)
  const files = [base, `${base}.efx`, `${base}.ts`, path.join(base, "index.efx"), path.join(base, "index.ts")]
  for (const file of files) {
    const target = site.modules.find((m) => path.resolve(m.file) === file)
    const declaration = target?.declarations.find((d) => d.name === imported.imported)
    if (target === undefined || declaration === undefined) continue
    const relative = path.posix.relative(path.posix.dirname(pageFile(module)), pageFile(target))
    const href = target === module ? "" : relative.startsWith(".") ? relative : `./${relative}`
    return { href: `${href}#${slug(imported.imported)}`, declaration }
  }
  return undefined
}

/** A type, linked when it names a documented declaration, followed by the given or linked summary. */
const describeType = (site: DocSite, module: DocModule, type: string, given: string | undefined): string => {
  const target = /^[A-Za-z_$][\w$]*$/.test(type) ? resolve(site, module, type) : undefined
  const code = `\`${type.replace(/\|/g, "\\|")}\``
  const head = target === undefined ? code : `[${code}](${target.href})`
  const text = given ?? target?.declaration.doc?.summary
  return text === undefined || text.trim() === "" ? head : `${head}: ${cellText(text)}`
}

const tags = (d: DocDeclaration, name: string) => d.doc?.tags.filter((tag) => tag.name === name) ?? []

/** `@param name - text` → text for `name`. */
const paramText = (d: DocDeclaration, name: string): string | undefined => {
  const tag = tags(d, "param").find((t) => t.text.split(/\s/)[0] === name)
  return tag === undefined ? undefined : tag.text.slice(name.length).replace(/^\s*-?\s*/, "")
}

/** `@throws {Name} text` → text for `Name`. */
const throwsText = (d: DocDeclaration, name: string): string | undefined => {
  const tag = tags(d, "throws").find((t) => t.text.startsWith(`{${name}}`))
  return tag === undefined ? undefined : tag.text.slice(name.length + 2).trim()
}

const facts = (site: DocSite, module: DocModule, d: DocDeclaration): Array<string> => {
  const rows: Array<string> = []
  for (const param of d.params) {
    if (param.type === undefined) continue
    rows.push(`| **${param.name}** | ${describeType(site, module, param.type, paramText(d, param.name))} |`)
  }
  if (d.success !== undefined) {
    rows.push(`| **Returns** | ${describeType(site, module, d.success, tags(d, "returns")[0]?.text)} |`)
  }
  if (d.failure !== undefined) {
    const cells = splitUnion(d.failure).map((type) => describeType(site, module, type, throwsText(d, type)))
    rows.push(`| **Fails with** | ${cells.join("<br>")} |`)
  }
  if (d.requirements !== undefined) {
    const cells = splitUnion(d.requirements).map((type) => describeType(site, module, type, undefined))
    rows.push(`| **Needs** | ${cells.join("<br>")} |`)
  }
  return rows.length === 0 ? [] : ["| | |", "| --- | --- |", ...rows, ""]
}

/** `readonly name?: Type` / `name = Schema.expr` → name and type (or schema expression). */
const fieldParts = (signature: string): { readonly name: string; readonly type: string } | undefined => {
  const match = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:=]\s*([\s\S]*?)[;,]?$/.exec(signature)
  return match === null ? undefined : { name: match[1]!, type: match[2]!.trim() }
}

/** A table row for a field (name, linked type, its own summary) or a service layer. */
const memberRow = (site: DocSite, module: DocModule, owner: DocDeclaration, member: DocDeclaration): Array<string> => {
  if (member.kind === "layer") {
    const summary = member.doc?.summary ? `: ${cellText(member.doc.summary)}` : ""
    return [`| **${owner.name}.${member.name}** | \`Layer<${owner.name}>\`${summary} |`]
  }
  if (member.kind !== "field") return []
  const parts = fieldParts(member.signature)
  if (parts === undefined) return [`| \`${member.signature.replace(/\|/g, "\\|")}\` | ${cellText(member.doc?.summary ?? "")} |`]
  return [`| **${parts.name}** | ${describeType(site, module, parts.type, member.doc?.summary)} |`]
}

const hiddenTags = new Set(["module", "param", "returns", "throws"])

const section = (
  site: DocSite,
  module: DocModule,
  d: DocDeclaration,
  level: string,
  heading: string
): Array<string> => {
  const out: Array<string> = [`${level} ${heading}`, "", "```efx", d.signature, "```", ""]
  if (d.doc?.summary) out.push(d.doc.summary, "")
  out.push(...facts(site, module, d))
  const rows = d.members.flatMap((m) => memberRow(site, module, d, m))
  if (rows.length > 0) out.push("| | |", "| --- | --- |", ...rows, "")
  if (d.doc?.body) out.push(d.doc.body, "")
  const shown = (d.doc?.tags ?? []).filter((tag) => !hiddenTags.has(tag.name))
  if (shown.length > 0) {
    out.push(...shown.map((tag) => `- **@${tag.name}**${tag.text === "" ? "" : ` ${flat(tag.text)}`}`), "")
  }
  for (const member of d.members) {
    if (member.kind === "member") out.push(...section(site, module, member, "###", `${d.name}.${member.name}`))
    else if (member.kind === "variant") out.push(...section(site, module, member, "###", member.name))
  }
  return out
}

const frontmatter = (title: string, description: string | undefined): Array<string> => [
  "---",
  `title: ${JSON.stringify(title)}`,
  ...(description ? [`description: ${JSON.stringify(flat(description))}`] : []),
  "---",
  ""
]

const moduleBody = (site: DocSite, module: DocModule): Array<string> => {
  const out: Array<string> = []
  if (module.doc?.summary) out.push(module.doc.summary, "")
  if (module.doc?.body) out.push(module.doc.body, "")
  for (const d of module.declarations) out.push(...section(site, module, d, "##", d.name))
  return out
}

const finish = (lines: ReadonlyArray<string>): string =>
  `${lines.map((line) => line.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`

/**
 * Whether a module gets a page: it exports something or has a module doc.
 *
 * @since 4.0.0
 * @category utils
 */
export const hasPage = (module: DocModule): boolean => module.declarations.length > 0 || module.doc !== undefined

/**
 * @since 4.0.0
 * @category rendering
 */
export const renderModule = (site: DocSite, module: DocModule): string =>
  finish([...frontmatter(module.path === "" ? "API" : module.path, module.doc?.summary), ...moduleBody(site, module)])

/**
 * The index page: the root module's docs (`src/index.efx`), if any, then every module page.
 *
 * @since 4.0.0
 * @category rendering
 */
export const renderIndex = (site: DocSite, title: string): string => {
  const root = site.modules.find((m) => m.path === "")
  const pages = site.modules.filter((m) => m.path !== "" && hasPage(m)).sort((a, b) => a.path.localeCompare(b.path))
  return finish([
    ...frontmatter(title, root?.doc?.summary),
    ...(root === undefined ? [] : moduleBody(site, root)),
    "## Modules",
    "",
    ...pages.map((m) => `- [${m.path}](./${pageFile(m)})${m.doc?.summary ? `: ${flat(m.doc.summary)}` : ""}`)
  ])
}
