/**
 * Builds a Zed dev extension that needs nothing published (ADR-0058): the grammar is exported to
 * a local git repository, and the extension's manifest points at it with a `file://` URL.
 *
 *   node scripts/dev.mjs --out <dir>
 *
 * Then in Zed: "zed: install dev extension", and pick `<dir>/extension`.
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

const root = path.join(import.meta.dirname, "..")
const argv = process.argv.slice(2)
if (!argv.includes("--out")) {
  process.stderr.write("usage: node scripts/dev.mjs --out <dir>\n")
  process.exit(1)
}
const out = path.resolve(argv[argv.indexOf("--out") + 1] ?? "")
const grammar = path.join(out, "tree-sitter-effectscript")
const exported = spawnSync(
  process.execPath,
  [path.join(root, "../tree-sitter/scripts/export.mjs"), "--out", grammar, "--git"],
  { encoding: "utf8" }
)
if (exported.status !== 0) {
  process.stderr.write(exported.stderr)
  process.exit(1)
}
const rev = exported.stdout.trim()
const extension = path.join(out, "extension")
fs.rmSync(extension, { recursive: true, force: true })
fs.mkdirSync(extension, { recursive: true })
for (const entry of ["extension.toml", "Cargo.toml", "Cargo.lock", "src", "languages", "LICENSE"]) {
  fs.cpSync(path.join(root, entry), path.join(extension, entry), { recursive: true })
}
const manifest = path.join(extension, "extension.toml")
fs.writeFileSync(
  manifest,
  fs.readFileSync(manifest, "utf8")
    .replace(/^repository = "https:\/\/github\.com\/EffectScript-Lang\/tree-sitter-effectscript"$/m, `repository = "file://${grammar}"`)
    .replace(/^rev = ".*"$/m, `rev = "${rev}"`)
)
process.stdout.write(`${extension}\n`)
