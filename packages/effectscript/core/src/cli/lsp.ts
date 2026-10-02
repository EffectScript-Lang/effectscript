/**
 * `efx lsp`: the EffectScript language server over stdio (ADR-0040), for editors without a
 * TypeScript server plugin host (Neovim, Helix, Zed, …).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { languageBin } from "./check.ts"
import { cacheDir, standalone, unpack, unpackFiles } from "./host.ts"

/**
 * Runs the language server until the editor closes it. Returns its exit code.
 *
 * @since 4.0.0
 * @category cli
 */
export const lsp = (cwd: string): number => {
  const host = standalone()
  if (host === undefined) {
    // the project's own server, as its editor plugin would load it
    const bin = languageBin(cwd, false, "efx-language-server.js")
    if (bin === undefined) {
      process.stderr.write("efx lsp needs @effectscript/language: npm i -D @effectscript/language typescript@6\n")
      return 1
    }
    return spawnSync(process.execPath, [bin, "--stdio"], { stdio: "inherit" }).status ?? 1
  }
  // the binary's own server and TypeScript, unpacked once per version (an unwritable cache uses a
  // private temp directory for this session)
  let dir: string
  let scratch: string | undefined
  try {
    dir = cacheDir(process.env, process.platform, os.homedir())
    fs.mkdirSync(dir, { recursive: true })
    fs.accessSync(dir, fs.constants.W_OK)
  } catch {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "efx-"))
    dir = scratch
  }
  try {
    const server = unpack(dir, "language-server", host.languageServer)
    const lib = unpackFiles(path.join(dir, `typescript-${host.typescript.version}`, "lib"), host.typescript.files)
    const result = spawnSync(process.execPath, [server, "--stdio"], {
      stdio: "inherit",
      env: { ...process.env, BUN_BE_BUN: "1", EFFECTSCRIPT_TYPESCRIPT: path.join(lib, "typescript.js") }
    })
    return result.status ?? 1
  } finally {
    if (scratch !== undefined) fs.rmSync(scratch, { recursive: true, force: true })
  }
}
