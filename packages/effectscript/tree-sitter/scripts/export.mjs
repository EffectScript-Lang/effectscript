/**
 * Writes the publishable `tree-sitter-effectscript` repository (ADR-0058): the grammar, its
 * generated parser, the scanner, the queries and the licence, so editors that compile grammars
 * from git (nvim-treesitter, Helix, Zed) need nothing else.
 *
 *   node scripts/export.mjs --out <dir> [--git]
 *
 * `--git` also makes `<dir>` a git repository with one commit, and prints its SHA (for a Zed dev
 * extension, or the release).
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

const root = path.join(import.meta.dirname, "..")
const argv = process.argv.slice(2)
const out = path.resolve(argv[argv.indexOf("--out") + 1] ?? "")
if (!argv.includes("--out") || out === path.resolve("")) {
  process.stderr.write("usage: node scripts/export.mjs --out <dir> [--git]\n")
  process.exit(1)
}
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, ".tree-sitter-cache") }
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`)
  return result.stdout
}

// regenerate only when the grammar changed since the last parser (tests share one generation)
const mtime = (file) => fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.mtimeMs ?? 0
if (mtime("src/parser.c") === 0 || mtime("src/parser.c") < Math.max(mtime("grammar.js"), mtime("src/scanner.c"))) {
  run(path.join(root, "node_modules/.bin/tree-sitter"), ["generate"], root)
}
// an existing clone of the grammar repository keeps its history (review I8): only its files go
fs.mkdirSync(out, { recursive: true })
for (const entry of fs.readdirSync(out)) {
  if (entry !== ".git") fs.rmSync(path.join(out, entry), { recursive: true, force: true })
}
for (const entry of ["grammar.js", "tree-sitter.json", "src", "queries", "test/corpus"]) {
  fs.cpSync(path.join(root, entry), path.join(out, entry), { recursive: true })
}
fs.rmSync(path.join(out, "queries/src"), { recursive: true, force: true })
fs.copyFileSync(path.join(root, "../core/LICENSE"), path.join(out, "LICENSE"))
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
fs.writeFileSync(
  path.join(out, "package.json"),
  `${
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        license: pkg.license,
        type: "module",
        repository: { type: "git", url: "https://github.com/EffectScript-Lang/tree-sitter-effectscript.git" },
        files: ["grammar.js", "tree-sitter.json", "src/**", "queries/*"],
        devDependencies: pkg.devDependencies
      },
      null,
      2
    )
  }\n`
)
fs.writeFileSync(
  path.join(out, "README.md"),
  `# tree-sitter-effectscript

The [EffectScript](https://effectscript.dev) grammar for tree-sitter: TypeScript's grammar plus Effect
as syntax. \`src/\` holds the generated parser, so editors compile it as is.

Generated from [EffectScript-Lang/effect-lang](https://github.com/EffectScript-Lang/effect-lang/tree/effectscript/packages/effectscript/tree-sitter);
change the grammar there.

\`queries/highlights.scm\` is self-contained (JavaScript's, TypeScript's, then EffectScript's patterns;
later patterns win). MIT.
`
)
if (argv.includes("--git")) {
  const git = (...args) => run("git", ["-c", "user.name=EffectScript", "-c", "user.email=noreply@effectscript.dev", ...args], out)
  if (!fs.existsSync(path.join(out, ".git"))) git("init", "-q", "-b", "main")
  git("add", "-A")
  // an unchanged export has nothing to commit: its commit is the current one
  if (git("status", "--porcelain").trim() !== "") git("commit", "-q", "-m", `tree-sitter-effectscript ${pkg.version}`)
  process.stdout.write(`${git("rev-parse", "HEAD").trim()}\n`)
}
