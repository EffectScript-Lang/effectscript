/**
 * `efx docs` (docs spec §3): Markdown pages for Blume from doc comments, or only the checks.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { type Diagnostic, diagnosticWarning, formatDiagnostic } from "../compiler/diagnostics.ts"
import { rewriteExample } from "../docs/examples.ts"
import { allExamples, type DocDeclaration, type DocModule, docModule, modulePath } from "../docs/model.ts"
import { type DocSite, hasPage, pageFile, renderIndex, renderModule } from "../docs/render.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface DocsOptions {
  /** Files or directories (default: `src`, or the project root without one). */
  readonly paths: ReadonlyArray<string>
  /** The output directory, replaced on each run. */
  readonly out: string
  /** Only report problems; write nothing. */
  readonly check: boolean
  /** Fail on warnings, and report tags that repeat the signature (EFX9306). */
  readonly strict: boolean
}

const skippedDirs = new Set(["node_modules", "internal", "dist", "build"])

const collect = (entry: string, outDir: string, files: Array<string>): void => {
  const stat = fs.statSync(entry, { throwIfNoEntry: false })
  if (stat === undefined) return
  if (stat.isFile()) {
    if (/\.(efx|ts)$/.test(entry) && !entry.endsWith(".d.ts") && !/\.test\.(efx|ts)$/.test(entry)) files.push(entry)
    return
  }
  if (path.resolve(entry) === outDir) return
  for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
    if (child.isDirectory() && (skippedDirs.has(child.name) || child.name.startsWith("."))) continue
    collect(path.join(entry, child.name), outDir, files)
  }
}

const isName = (type: string | undefined): type is string => type !== undefined && /^[A-Za-z_$][\w$]*$/.test(type)

/**
 * EFX9306 (strict only): `@returns`/`@throws` repeating a written return type or `throws` clause, or
 * `@param` on a parameter whose type is a declaration that documents itself (ADR-0042).
 *
 * @since 4.0.0
 * @category checks
 */
export const redundantTags = (module: DocModule): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = []
  const documented = (type: string | undefined) =>
    isName(type) && (module.imports.has(type) || module.declarations.some((d) => d.name === type && d.doc?.summary))
  const visit = (d: DocDeclaration) => {
    for (const tag of d.doc?.tags ?? []) {
      const repeats = (tag.name === "returns" && d.success !== undefined) ||
        (tag.name === "throws" && d.failure !== undefined) ||
        (tag.name === "param" && documented(d.params.find((p) => p.name === tag.text.split(/\s/)[0])?.type))
      if (!repeats) continue
      out.push(
        diagnosticWarning(
          "EFX9306",
          `@${tag.name} repeats what the signature or a schema already says`,
          d.doc!.start,
          d.doc!.end,
          "document each thing once, where it is defined (ADR-0042)"
        )
      )
    }
    d.members.forEach(visit)
  }
  module.declarations.forEach(visit)
  return out
}

/**
 * Runs `efx docs` in `cwd`. Returns the exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const docsProject = (
  cwd: string,
  options: DocsOptions,
  io: { readonly out: (line: string) => void; readonly err: (line: string) => void }
): number => {
  const outDir = path.resolve(cwd, options.out)
  const roots = options.paths.length > 0
    ? options.paths.map((p) => path.resolve(cwd, p))
    : [fs.existsSync(path.join(cwd, "src")) ? path.join(cwd, "src") : cwd]
  const files: Array<string> = []
  for (const root of roots) collect(root, outDir, files)
  files.sort()
  let errors = 0
  let warnings = 0
  const report = (module: DocModule, d: Diagnostic) => {
    if (d.severity === "error") errors++
    else warnings++
    io.err(formatDiagnostic(module.source, path.relative(cwd, module.file), d))
  }
  const modules: Array<DocModule> = []
  for (const file of files) {
    const { module, diagnostics } = docModule(file, modulePath(path.relative(cwd, file)), fs.readFileSync(file, "utf8"))
    for (const d of diagnostics) report(module, d)
    for (const { example } of allExamples(module)) {
      for (const d of rewriteExample(example).diagnostics) report(module, d)
    }
    if (options.strict) { for (const d of redundantTags(module)) report(module, d) }
    modules.push(module)
  }
  if (errors > 0 || (options.strict && warnings > 0)) return 1
  if (options.check) return 0
  const site: DocSite = { modules }
  fs.rmSync(outDir, { recursive: true, force: true })
  let pages = 0
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    pages++
  }
  for (const module of modules) {
    if (module.path !== "" && hasPage(module)) write(path.join(outDir, pageFile(module)), renderModule(site, module))
  }
  write(path.join(outDir, "index.md"), renderIndex(site, "API"))
  io.out(`Wrote ${pages} pages to ${path.relative(cwd, outDir) || "."}`)
  return 0
}
