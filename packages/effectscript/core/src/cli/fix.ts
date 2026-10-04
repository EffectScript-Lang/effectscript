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
import { compilesBackModuloImports } from "../compiler/reverse/verify.ts"
import { packageInfo } from "../project.ts"

const skippedDirs = new Set(["node_modules", "dist", "build", "coverage"])

/** A path's stat, or `undefined` when it is gone or a link loops (`ln -s self self`, Plan 21). */
const statOf = (entry: string): fs.Stats | undefined => {
  try {
    return fs.statSync(entry, { throwIfNoEntry: false })
  } catch {
    return undefined
  }
}

const collect = (entry: string, files: Array<string>): void => {
  const stat = statOf(entry)
  if (stat === undefined) return
  if (stat.isFile()) {
    if (entry.endsWith(".efx")) files.push(entry)
    return
  }
  for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
    if (child.isDirectory() && (skippedDirs.has(child.name) || child.name.startsWith("."))) continue
    // a linked file is fixed, a linked directory isn't entered: it can loop back (Plan 20)
    if (child.isSymbolicLink() && statOf(path.join(entry, child.name))?.isDirectory() !== false) {
      continue
    }
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
  // strict mode makes the strict rules (EFX8xxx) errors; they don't change what a file compiles to,
  // and EFX8101 is the one this command fixes (review I2)
  const error = before.diagnostics.find((d) => d.severity === "error" && !/^EFX8\d{3}$/.test(d.code))
  if (error !== undefined) return { problem: `doesn't compile (${error.code} ${error.message})` }
  const converted = toEffectScript(before.code, { filename })
  const back = converted.code
  // the round-trip contract (ADR-0030): the same TypeScript, or no change; a canonicalized import
  // cleanup may name module files instead of the effect index (ADR-0089)
  const same = toTypeScript(back, options).code === before.code ||
    (converted.notes.some((n) => n.message.startsWith("canonicalized: imports")) &&
      compilesBackModuloImports(before.code, back, options))
  if (back === source || !same) return { fixed: undefined }
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
  for (const entry of options.paths.length === 0 ? ["."] : options.paths) {
    if (!fs.existsSync(path.resolve(cwd, entry))) {
      io.err(`${entry}: no such file or directory`)
      return 1
    }
    collect(path.resolve(cwd, entry), files)
  }
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
