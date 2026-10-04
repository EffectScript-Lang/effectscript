/**
 * Installs this checkout's EffectScript extension into the local editor, linked so that a rebuild is
 * all an update takes (ADR-0068):
 *
 *   node scripts/dev-install.ts [--editor cursor|code]
 *
 * The extension is staged into `.dev-extension` beside the manifest. The first run installs it with
 * the editor's CLI, which records it in the editor's `extensions.json`, then swaps the installed
 * folder for a symlink to `.dev-extension`. Every later run only rebuilds `.dev-extension`; run
 * "Developer: Reload Window" in the editor to load it.
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { packageStaged, readManifest, root, stageExtension } from "./stage.ts"

const editors = {
  cursor: path.join(os.homedir(), ".cursor/extensions"),
  code: path.join(os.homedir(), ".vscode/extensions")
} as const

const argv = process.argv.slice(2)
const editor = (argv.includes("--editor") ? argv[argv.indexOf("--editor") + 1] : "cursor") as keyof typeof editors
if (!(editor in editors)) throw new Error(`--editor is one of ${Object.keys(editors).join(", ")}`)
const extensions = editors[editor]

const manifest = readManifest()
const id = `${manifest.publisher}.${manifest.name}`.toLowerCase()
const target = path.join(root, ".dev-extension")

// stage beside the target and swap, so the link never points at a half-built extension
const next = `${target}.next`
fs.rmSync(next, { recursive: true, force: true })
fs.mkdirSync(next)
const { preRelease } = await stageExtension(next)
fs.rmSync(target, { recursive: true, force: true })
fs.renameSync(next, target)

const installed = () =>
  fs.existsSync(extensions)
    ? fs.readdirSync(extensions).filter((name) => name.toLowerCase().startsWith(`${id}-`)).map((name) =>
      path.join(extensions, name)
    )
    : []
const linked = installed().some((folder) =>
  fs.lstatSync(folder).isSymbolicLink() && fs.realpathSync(folder) === fs.realpathSync(target)
)

if (!linked) {
  const vsix = path.join(os.tmpdir(), `${id}-dev.vsix`)
  packageStaged(target, vsix, preRelease)
  const result = spawnSync(editor, ["--install-extension", vsix, "--force"], { encoding: "utf8" })
  fs.rmSync(vsix, { force: true })
  if (result.status !== 0) throw new Error(`${editor} --install-extension failed:\n${result.stdout}${result.stderr}`)
  const folders = installed().filter((folder) => !fs.lstatSync(folder).isSymbolicLink())
  if (folders.length === 0) throw new Error(`${editor} installed ${id}, but no folder for it is in ${extensions}`)
  for (const folder of folders) {
    fs.rmSync(folder, { recursive: true })
    fs.symlinkSync(target, folder, "dir")
    process.stdout.write(`linked ${folder} -> ${target}\n`)
  }
}

process.stdout.write(`built ${target}\nrun "Developer: Reload Window" in ${editor} to load it\n`)
