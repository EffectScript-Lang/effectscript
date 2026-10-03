/**
 * `efx fix [paths] [--check]` (spec §4.17, ADR-0056): rewrites the Effect TypeScript inside `.efx`
 * files as EffectScript. Each file goes to TypeScript and back through the reverse compiler, and
 * the result is kept only when it compiles to exactly the TypeScript the file compiled to before,
 * so a fix never changes what a program does.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { toTypeScript } from "../compiler/compile.ts"
import { toEffectScript } from "../compiler/reverse/convert.ts"
import { packageInfo } from "../project.ts"

const skippedDirs = new Set(["node_modules", "dist", "build", "coverage"])

const collect = (entry: string, files: Array<string>): void => {
  const stat = fs.statSync(entry, { throwIfNoEntry: false })
  if (stat === undefined) return
  if (stat.isFile()) {
    if (entry.endsWith(".efx")) files.push(entry)
    return
  }
  for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
    if (child.isDirectory() && (skippedDirs.has(child.name) || child.name.startsWith("."))) continue
    collect(path.join(entry, child.name), files)
  }
}

/**
 * One file's fix: the new source, `undefined` when there is nothing to fix, or why it can't be
 * fixed.
 *
 * @since 4.0.0
 * @category cli
 */
export const fixSource = (
  source: string,
  filename: string
): { readonly fixed: string | undefined } | { readonly problem: string } => {
  const options = { filename, ...packageInfo(filename) }
  const before = toTypeScript(source, options)
  const error = before.diagnostics.find((d) => d.severity === "error")
  if (error !== undefined) return { problem: `doesn't compile (${error.code} ${error.message})` }
  const back = toEffectScript(before.code, { filename }).code
  // the round-trip contract (ADR-0030): the same TypeScript, or no change
  if (back === source || toTypeScript(back, options).code !== before.code) return { fixed: undefined }
  // where an `import` was the first line, the reverse compiler leaves a blank one
  const fixed = /^\s/.test(source) ? back : back.replace(/^\n+/, "")
  return { fixed: fixed === source ? undefined : fixed }
}

/**
 * Runs `efx fix`. Returns the exit code: 1 when a file can't be fixed, or with `check` when a file
 * would change.
 *
 * @since 4.0.0
 * @category cli
 */
export const fixProject = (
  cwd: string,
  options: { readonly paths: ReadonlyArray<string>; readonly check: boolean },
  io: { readonly out: (line: string) => void; readonly err: (line: string) => void }
): number => {
  const files: Array<string> = []
  for (const entry of options.paths.length === 0 ? ["."] : options.paths) collect(path.resolve(cwd, entry), files)
  let changed = 0
  let failed = 0
  for (const file of files.sort()) {
    const shown = path.relative(cwd, file).split(path.sep).join("/")
    const result = fixSource(fs.readFileSync(file, "utf8"), file)
    if ("problem" in result) {
      failed++
      io.err(`${shown}: ${result.problem}, skipped`)
    } else if (result.fixed !== undefined) {
      changed++
      if (options.check) io.out(`${shown}: would be fixed`)
      else {
        fs.writeFileSync(file, result.fixed)
        io.out(`${shown}: fixed`)
      }
    }
  }
  if (changed === 0 && failed === 0) io.out("nothing to fix")
  return failed > 0 || (options.check && changed > 0) ? 1 : 0
}
