/**
 * `efx build` (ADR-0022): compile every `.efx` in the project graph, write a staging tree with
 * `.efx` specifiers pointing at the exact staged files, then let TypeScript 6 emit `.js` + `.d.ts`.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import * as fs from "node:fs"
import * as path from "node:path"
import { children, type Node } from "../compiler/ast.ts"
import { toTypeScript } from "../compiler/compile.ts"
import { formatDiagnostic } from "../compiler/diagnostics.ts"
import type { CodeMapping } from "../compiler/options.ts"
import { type Mode, parse } from "../compiler/parser/parse.ts"
import { packageInfo } from "../project.ts"
import type { TypeScript } from "./typescript.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface BuildResult {
  readonly ok: boolean
  readonly errors: ReadonlyArray<string>
  readonly stagingDir: string
}

interface Compiled {
  readonly mode: Mode
  readonly code: string
  readonly source: string
  readonly mappings: ReadonlyArray<CodeMapping>
  edits?: ReadonlyArray<readonly [number, number]>
}

const stagedName = (file: string, mode: Mode) => file.replace(/\.efx$/, mode === "tsx" ? ".tsx" : ".ts")

interface Rewritten {
  readonly code: string
  /** Specifier edits, as (offset in the input, length change), so positions can be mapped back. */
  readonly edits: ReadonlyArray<readonly [number, number]>
  /** Relatively imported files that are not compiled (JSON, …), to copy into staging. */
  readonly assets: ReadonlyArray<string>
}

/**
 * Rewrites relative `.efx` specifiers (imports, re-exports, literal dynamic imports) to staged
 * files, and collects other relative imports that must be copied (review I3, I4).
 */
const rewriteSpecifiers = (
  code: string,
  mode: Mode,
  file: string,
  modeOf: (file: string) => Mode | undefined,
  isProjectFile: (file: string) => boolean,
  errors: Array<string>
): Rewritten => {
  const edits: Array<readonly [number, number]> = []
  const assets: Array<string> = []
  const parsed = parse(code, { mode })
  if (parsed._tag === "Failure") return { code, edits, assets }
  const s = new MagicString(code)
  const visit = (node: Node): void => {
    const source: Node | null | undefined = node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" ||
        node.type === "ExportNamedDeclaration" || node.type === "ImportExpression"
      ? node.source
      : undefined
    if (source?.type === "Literal" && typeof source.value === "string") {
      const value: string = source.value
      if (value.startsWith(".") && value.endsWith(".efx")) {
        const target = path.resolve(path.dirname(file), value)
        const targetMode = modeOf(target)
        if (targetMode === undefined) {
          errors.push(`${file}: cannot find module '${value}' in the project`)
        } else {
          const extension = targetMode === "tsx" ? ".tsx" : ".ts"
          s.update(source.end - 5, source.end - 1, extension)
          edits.push([source.end - 5, extension.length - 4])
        }
      } else if (value.startsWith(".")) {
        const target = path.resolve(path.dirname(file), value)
        if (!isProjectFile(target) && fs.existsSync(target) && fs.statSync(target).isFile()) assets.push(target)
      }
    }
    for (const child of children(node)) visit(child)
  }
  visit(parsed.program)
  return { code: s.toString(), edits, assets }
}

/** A staged offset back to the offset before the specifier rewrite. */
const beforeRewrite = (edits: ReadonlyArray<readonly [number, number]>, offset: number): number => {
  let shift = 0
  for (const [at, delta] of edits) {
    if (at + shift >= offset) break
    shift += delta
  }
  return offset - shift
}

/** The source offset of a generated offset, through the compiler's mappings. */
const toSourceOffset = (mappings: ReadonlyArray<CodeMapping>, offset: number): number => {
  for (const m of mappings) {
    const generatedLength = m.generatedLengths?.[0] ?? m.lengths[0]!
    if (m.generatedOffsets[0]! <= offset && offset < m.generatedOffsets[0]! + generatedLength) {
      return m.sourceOffsets[0]! + Math.min(offset - m.generatedOffsets[0]!, m.lengths[0]!)
    }
  }
  return 0
}

/**
 * @since 4.0.0
 * @category build
 */
export const build = (
  ts: TypeScript,
  options: { readonly project: string; readonly cwd?: string | undefined }
): BuildResult => {
  const efxExtension = { extension: ".efx", isMixedContent: false, scriptKind: ts.ScriptKind.Deferred }
  const cwd = options.cwd ?? process.cwd()
  const configPath = path.resolve(cwd, options.project)
  const projectDir = path.dirname(configPath)
  // Not under node_modules: TypeScript would treat staged files as a package and emit
  // `import(".cache/…")` into declarations (review C1). Dot-folders are skipped by tsconfig globs.
  const stagingDir = path.join(projectDir, ".efx/build")
  const errors: Array<string> = []
  const relative = (file: string) => path.relative(cwd, file)
  const parsedConfig = ts.getParsedCommandLineOfConfigFile(
    configPath,
    undefined,
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => errors.push(ts.flattenDiagnosticMessageText(d.messageText, "\n"))
    },
    undefined,
    undefined,
    [efxExtension]
  )
  if (parsedConfig === undefined) return { ok: false, errors, stagingDir }
  const outDir = parsedConfig.options.outDir
  if (outDir === undefined) return { ok: false, errors: ["efx build needs `outDir` in tsconfig.json"], stagingDir }
  const rootDir = parsedConfig.options.rootDir ?? projectDir

  // 1. compile the graph
  const compiled = new Map<string, Compiled>()
  for (const file of parsedConfig.fileNames.filter((f) => f.endsWith(".efx"))) {
    const source = fs.readFileSync(file, "utf8")
    const result = toTypeScript(source, { filename: file, runtime: "node", ...packageInfo(file) })
    for (const d of result.diagnostics.filter((d) => d.severity === "error")) {
      errors.push(formatDiagnostic(source, relative(file), d))
    }
    compiled.set(file, { mode: result.mode, code: result.code, source, mappings: result.mappings })
  }
  if (errors.length > 0) return { ok: false, errors, stagingDir }

  // 2. staging tree
  fs.rmSync(stagingDir, { recursive: true, force: true })
  const modeOf = (file: string) => compiled.get(file)?.mode
  const staged = new Map<string, string>() // staged file → original file
  const projectFiles = new Set(parsedConfig.fileNames)
  const isProjectFile = (file: string) => projectFiles.has(file)
  const assets = new Set<string>()
  const write = (target: string, text: string) => {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
  }
  for (const file of parsedConfig.fileNames) {
    const unit = compiled.get(file)
    const target = path.join(
      stagingDir,
      path.relative(rootDir, unit === undefined ? file : stagedName(file, unit.mode))
    )
    if (unit === undefined && file.endsWith(".d.ts")) {
      write(target, fs.readFileSync(file, "utf8"))
    } else {
      const rewritten = unit !== undefined
        ? rewriteSpecifiers(unit.code, unit.mode, file, modeOf, isProjectFile, errors)
        : rewriteSpecifiers(
          fs.readFileSync(file, "utf8"),
          file.endsWith("x") ? "tsx" : "ts",
          file,
          modeOf,
          isProjectFile,
          errors
        )
      if (unit !== undefined) unit.edits = rewritten.edits
      for (const asset of rewritten.assets) assets.add(asset)
      write(target, rewritten.code)
    }
    staged.set(target, file)
  }
  for (const asset of assets) {
    const relativeAsset = path.relative(rootDir, asset)
    if (relativeAsset.startsWith("..")) {
      errors.push(`${relative(asset)}: imported files must live under the project's rootDir`)
      continue
    }
    fs.mkdirSync(path.dirname(path.join(stagingDir, relativeAsset)), { recursive: true })
    fs.copyFileSync(asset, path.join(stagingDir, relativeAsset))
  }
  if (errors.length > 0) return { ok: false, errors, stagingDir }

  // 3. TypeScript emit
  const program = ts.createProgram([...staged.keys()], {
    ...parsedConfig.options,
    rootDir: stagingDir,
    outDir: path.resolve(projectDir, outDir),
    rewriteRelativeImportExtensions: true,
    allowImportingTsExtensions: true,
    noEmit: false,
    incremental: false,
    composite: false
  })
  const emitted = program.emit()
  for (const d of [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics]) {
    if (d.category !== ts.DiagnosticCategory.Error) continue
    const message = ts.flattenDiagnosticMessageText(d.messageText, "\n")
    if (d.file === undefined) {
      errors.push(`error TS${d.code}: ${message}`)
      continue
    }
    const original = staged.get(d.file.fileName) ?? d.file.fileName
    const unit = compiled.get(original)
    const offset = unit === undefined
      ? d.start ?? 0
      : toSourceOffset(unit.mappings, beforeRewrite(unit.edits ?? [], d.start ?? 0))
    const text = unit?.source ?? d.file.text
    const before = text.slice(0, offset).split("\n")
    errors.push(
      `${relative(original)}:${before.length}:${before[before.length - 1]!.length + 1} - error TS${d.code}: ${message}`
    )
  }
  return { ok: errors.length === 0 && !emitted.emitSkipped, errors, stagingDir }
}
