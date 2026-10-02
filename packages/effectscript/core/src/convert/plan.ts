/**
 * The `efx convert` planner (spec §7.5): which files become `.efx`, their EffectScript, and the
 * import specifiers to rewrite. Pure, so it is easy to test and to re-run when verification
 * reverts files.
 *
 * @since 4.0.0
 */
import { MagicString } from "magic-string"
import { children, type Node } from "../compiler/ast.ts"
import { parse } from "../compiler/parser/parse.ts"
import { type ConvertNote, type ConvertOptions, toEffectScript } from "../compiler/reverse/convert.ts"

/**
 * @since 4.0.0
 * @category models
 */
export interface Rename {
  readonly from: string
  readonly to: string
  /** The EffectScript, with its own specifiers rewritten. */
  readonly code: string
  readonly notes: ReadonlyArray<ConvertNote>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface ConversionPlan {
  readonly renames: ReadonlyArray<Rename>
  /** Files that keep their name but import a renamed file. */
  readonly edits: ReadonlyArray<{ readonly file: string; readonly code: string }>
  readonly skipped: ReadonlyArray<{ readonly file: string; readonly reason: string }>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface PlanOptions extends Pick<ConvertOptions, "packageName" | "packageRoot"> {
  /** Project-relative files or directories to convert (default: all). */
  readonly paths?: ReadonlyArray<string> | undefined
  /** Convert only these files (after the other rules); used when verification reverts files. */
  readonly only?: ReadonlySet<string> | undefined
}

const sourceFile = /\.tsx?$/

/** Why a TypeScript file is never converted, or `undefined`. */
const excluded = (file: string): string | undefined => {
  if (file.endsWith(".d.ts")) return "a declaration file"
  if (/(^|\/)[^/]*\.config\.[^/]*$/.test(file)) return "a tool config file"
  return undefined
}

const within = (file: string, paths: ReadonlyArray<string> | undefined): boolean =>
  paths === undefined || paths.length === 0 ||
  paths.some((p) => {
    const dir = p.replace(/\/+$/, "").replace(/^\.\//, "")
    return dir === "" || dir === "." || file === dir || file.startsWith(`${dir}/`)
  })

const dirname = (file: string): string => (file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "")

/** `a/b` + `../c` → `c` (posix, project-relative). */
const join = (dir: string, spec: string): string => {
  const parts = dir === "" ? [] : dir.split("/")
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop()
    else if (part !== "." && part !== "") parts.push(part)
  }
  return parts.join("/")
}

/** The project file a relative specifier resolves to, the way TypeScript's bundler resolution would. */
const resolve = (from: string, spec: string, exists: (file: string) => boolean): string | undefined => {
  const base = join(dirname(from), spec)
  const candidates = /\.(js|jsx|mjs)$/.test(spec)
    ? [base.replace(/\.(js|jsx|mjs)$/, ".ts"), base.replace(/\.(js|jsx|mjs)$/, ".tsx")]
    : /\.tsx?$/.test(spec)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  return candidates.find(exists)
}

/** `./x` from `dir` to `target` (keeping the `./` prefix). */
const relative = (dir: string, target: string): string => {
  const from = dir === "" ? [] : dir.split("/")
  const to = target.split("/")
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++
  const up = from.length - common
  const rest = to.slice(common).join("/")
  return up === 0 ? `./${rest}` : `${"../".repeat(up)}${rest}`
}

/** Literal module specifiers: imports, re-exports and `import("…")`. */
const specifiers = (code: string): Array<Node> => {
  const parsed = parse(code)
  if (parsed._tag === "Failure") return []
  const found: Array<Node> = []
  const visit = (node: Node): void => {
    if (
      (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration" || node.type === "ImportExpression") &&
      node.source?.type === "Literal" && typeof node.source.value === "string"
    ) {
      found.push(node.source)
    }
    for (const child of children(node)) visit(child)
  }
  visit(parsed.program)
  return found
}

/** Rewrites the specifiers of `code` (the file now at `at`) that resolve to renamed files. */
const rewrite = (
  code: string,
  file: string,
  at: string,
  renamed: ReadonlyMap<string, string>,
  exists: (file: string) => boolean
): string => {
  const s = new MagicString(code)
  for (const literal of specifiers(code)) {
    const spec: string = literal.value
    if (!spec.startsWith("./") && !spec.startsWith("../") && spec !== "." && spec !== "..") continue
    const target = resolve(file, spec, exists)
    const to = target === undefined ? undefined : renamed.get(target)
    if (to === undefined) continue
    const quote = code[literal.start]
    s.update(literal.start, literal.end, `${quote}${relative(dirname(at), to)}${quote}`)
  }
  return s.toString()
}

/**
 * Plans the conversion of `files` (project-relative path → source).
 *
 * @since 4.0.0
 * @category convert
 */
export const planConversion = (files: ReadonlyMap<string, string>, options: PlanOptions): ConversionPlan => {
  const exists = (file: string) => files.has(file)
  const converted = new Map<string, { code: string; notes: ReadonlyArray<ConvertNote> }>()
  const skipped: Array<{ file: string; reason: string }> = []
  for (const [file, source] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!sourceFile.test(file) || file.startsWith("node_modules/") || file.includes("/node_modules/")) continue
    if (!within(file, options.paths) || (options.only !== undefined && !options.only.has(file))) continue
    const reason = excluded(file)
    if (reason !== undefined) {
      skipped.push({ file, reason })
      continue
    }
    const result = toEffectScript(source, {
      filename: file,
      packageName: options.packageName,
      packageRoot: options.packageRoot
    })
    if (result.code === source) skipped.push({ file, reason: "nothing to re-sugar" })
    else converted.set(file, result)
  }
  // never overwrite an existing file, and never let two files share a target (ADR-0033)
  const targets = new Map<string, Array<string>>()
  for (const file of converted.keys()) {
    const target = file.replace(/\.tsx?$/, ".efx")
    targets.set(target, [...(targets.get(target) ?? []), file])
  }
  for (const [target, sources] of targets) {
    const reason = files.has(target)
      ? `${target} already exists`
      : sources.length > 1
      ? `${sources.join(" and ")} would both become ${target}`
      : undefined
    if (reason === undefined) continue
    for (const file of sources) {
      converted.delete(file)
      skipped.push({ file, reason })
    }
  }
  const renamed = new Map([...converted.keys()].map((file) => [file, file.replace(/\.tsx?$/, ".efx")]))
  const renames = [...converted].map(([from, result]) => ({
    from,
    to: renamed.get(from)!,
    code: rewrite(result.code, from, renamed.get(from)!, renamed, exists),
    notes: result.notes
  }))
  const edits: Array<{ file: string; code: string }> = []
  for (const [file, source] of files) {
    if (converted.has(file) || !/\.(tsx?|efx|mts|cts|jsx?|mjs|cjs)$/.test(file) || file.includes("node_modules/")) {
      continue
    }
    const code = rewrite(source, file, file, renamed, exists)
    if (code !== source) edits.push({ file, code })
  }
  return { renames, edits, skipped }
}
