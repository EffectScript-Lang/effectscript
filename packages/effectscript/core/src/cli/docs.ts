/**
 * `efx docs` (docs spec §3): Markdown pages for Blume from doc comments, or only the checks.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { type Diagnostic, diagnosticWarning, formatDiagnostic } from "../compiler/diagnostics.ts"
import { rewriteExample } from "../doc/examples.ts"
import { allExamples, type DocDeclaration, type DocModule, docModule, modulePath } from "../doc/model.ts"
import { type DocSite, hasPage, pageFile, renderIndex, renderModule } from "../doc/render.ts"

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

/** A source file and the input root it was found under. */
interface Input {
  readonly file: string
  readonly root: string
}

const collect = (entry: string, root: string, outDir: string, files: Array<Input>): void => {
  const stat = fs.statSync(entry, { throwIfNoEntry: false })
  if (stat === undefined) return
  if (stat.isFile()) {
    if (/\.(efx|ts)$/.test(entry) && !entry.endsWith(".d.ts") && !/\.test\.(efx|ts)$/.test(entry)) {
      files.push({ file: entry, root })
    }
    return
  }
  if (path.resolve(entry) === outDir) return
  for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
    if (child.isDirectory() && (skippedDirs.has(child.name) || child.name.startsWith("."))) continue
    collect(path.join(entry, child.name), root, outDir, files)
  }
}

/** Whether `inner` is `outer` or inside it. */
const within = (inner: string, outer: string): boolean => {
  const relative = path.relative(outer, inner)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

/** The manifest `efx docs` keeps in its output directory: only the files listed there are replaced. */
const manifestName = ".efx-docs.json"

const readManifest = (outDir: string): ReadonlyArray<string> | undefined => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(outDir, manifestName), "utf8"))
    const files = (parsed as { readonly files?: unknown } | null)?.files
    return Array.isArray(files) ? files.filter((f): f is string => typeof f === "string") : undefined
  } catch {
    return undefined
  }
}

/**
 * Why `efx docs` may not write to `outDir`, or `undefined`. It never touches the project itself, an
 * input, or a non-empty directory it didn't create (Plan 12 review C1, ADR-0044).
 */
const unsafeOut = (cwd: string, outDir: string, roots: ReadonlyArray<string>): string | undefined => {
  const shown = path.relative(cwd, outDir) || "."
  if (within(cwd, outDir)) return `--out ${shown} is the project or contains it: choose a directory for the pages only`
  const input = roots.find((root) => within(root, outDir))
  if (input !== undefined) return `--out ${shown} contains the input ${path.relative(cwd, input) || "."}`
  if (!fs.existsSync(outDir) || readManifest(outDir) !== undefined || fs.readdirSync(outDir).length === 0) {
    return undefined
  }
  return `${shown} wasn't written by efx docs: choose an empty or new directory with --out`
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
  const files: Array<Input> = []
  for (const root of roots) {
    const isDirectory = fs.statSync(root, { throwIfNoEntry: false })?.isDirectory() === true
    collect(root, isDirectory ? root : path.dirname(root), outDir, files)
  }
  files.sort((a, b) => a.file.localeCompare(b.file))
  let errors = 0
  let warnings = 0
  const report = (module: DocModule, d: Diagnostic) => {
    if (d.severity === "error") errors++
    else warnings++
    io.err(formatDiagnostic(module.source, path.relative(cwd, module.file), d))
  }
  const modules: Array<DocModule> = []
  for (const { file, root } of files) {
    // a file outside the project is named from its input root, so its page stays in the output directory
    const relative = path.relative(cwd, file)
    const name = relative.startsWith("..") || path.isAbsolute(relative) ? path.relative(root, file) : relative
    const { module, diagnostics } = docModule(file, modulePath(name), fs.readFileSync(file, "utf8"))
    for (const d of diagnostics) report(module, d)
    for (const { example } of allExamples(module)) {
      for (const d of rewriteExample(example).diagnostics) report(module, d)
    }
    if (options.strict) { for (const d of redundantTags(module)) report(module, d) }
    modules.push(module)
  }
  // two modules on one page (src/users.efx and src/users/index.efx) would overwrite each other
  const owners = new Map<string, DocModule>()
  for (const module of modules) {
    if (!hasPage(module)) continue
    const page = pageFile(module)
    const other = owners.get(page)
    if (other !== undefined) {
      errors++
      io.err(`${path.relative(cwd, other.file)} and ${path.relative(cwd, module.file)} both map to ${page}`)
    }
    owners.set(page, module)
  }
  if (errors > 0 || (options.strict && warnings > 0)) return 1
  if (options.check) return 0
  const refused = unsafeOut(cwd, outDir, roots)
  if (refused !== undefined) {
    io.err(refused)
    return 1
  }
  for (const file of readManifest(outDir) ?? []) {
    const target = path.resolve(outDir, file)
    if (within(target, outDir)) fs.rmSync(target, { force: true })
  }
  const site: DocSite = { modules }
  const written: Array<string> = []
  const write = (file: string, text: string) => {
    const target = path.join(outDir, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
    written.push(file)
  }
  for (const module of modules) {
    if (module.path !== "" && hasPage(module)) write(pageFile(module), renderModule(site, module))
  }
  write("index.md", renderIndex(site, "API"))
  const manifest = { generatedBy: "efx docs", files: written }
  fs.writeFileSync(path.join(outDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`)
  io.out(`Wrote ${written.length} pages to ${path.relative(cwd, outDir) || "."}`)
  return 0
}
