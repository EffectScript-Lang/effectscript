/**
 * Generates the parser once for every test file that needs it (Plan 19 review I9): four test files
 * across two Vitest projects run at the same time, and `tree-sitter generate` rewrites a 23 MB
 * `src/parser.c` in place. A directory lock serializes them, and a parser newer than its inputs is
 * reused.
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

export const grammarRoot = path.join(import.meta.dirname, "../..")
export const cli = path.join(grammarRoot, "node_modules/.bin/tree-sitter")
// compiled parsers go to a cache inside the package, never the user's home
export const env = { ...process.env, TREE_SITTER_LIBDIR: path.join(grammarRoot, ".tree-sitter-cache") }

const mtime = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0

const fresh = () => {
  const parser = mtime(path.join(grammarRoot, "src/parser.c"))
  return parser > 0 && parser >= mtime(path.join(grammarRoot, "grammar.js")) &&
    parser >= mtime(path.join(grammarRoot, "src/scanner.c"))
}

export const generateOnce = async (): Promise<void> => {
  const lock = path.join(grammarRoot, ".tree-sitter-cache/generate.lock")
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  for (;;) {
    try {
      fs.mkdirSync(lock)
      break
    } catch {
      // a lock older than five minutes was left by a killed run
      if (Date.now() - mtime(lock) > 300_000) fs.rmSync(lock, { recursive: true, force: true })
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  try {
    if (fresh()) return
    const result = spawnSync(cli, ["generate"], { cwd: grammarRoot, encoding: "utf8", env })
    if (result.status !== 0) throw new Error(`tree-sitter generate failed:\n${result.stderr}`)
  } finally {
    fs.rmSync(lock, { recursive: true, force: true })
  }
}

/**
 * tree-sitter-typescript's parser, compiled once into the cache: `parse -p` would recompile its
 * 9 MB parser on every call (minutes per run).
 */
export const typescriptLib = async (): Promise<ReadonlyArray<string>> => {
  const lib = path.join(
    grammarRoot,
    ".tree-sitter-cache",
    `typescript-0.23.2.${process.platform === "darwin" ? "dylib" : "so"}`
  )
  if (!fs.existsSync(lib)) {
    const grammar = path.join(grammarRoot, "node_modules/tree-sitter-typescript/typescript")
    const partial = `${lib}.${process.pid}`
    const result = spawnSync(cli, ["build", "-o", partial, grammar], { cwd: grammarRoot, encoding: "utf8", env })
    if (result.status !== 0) throw new Error(`building tree-sitter-typescript failed:\n${result.stderr}`)
    fs.renameSync(partial, lib)
  }
  return ["--lib-path", lib, "--lang-name", "typescript"]
}
