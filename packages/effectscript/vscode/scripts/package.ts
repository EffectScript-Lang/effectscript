/**
 * Packages the EffectScript VS Code extension (ADR-0041):
 *
 *   node scripts/package.ts [--out effectscript-<version>.vsix]
 *
 * `stage.ts` builds the extension as the editor loads it; `vsce package` writes the `.vsix`, and an
 * `alpha` is packaged as a pre-release (ADR-0055).
 */
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { packageStaged, readManifest, stageExtension } from "./stage.ts"

const argv = process.argv.slice(2)
const out = path.resolve(
  argv[argv.indexOf("--out") + 1] ?? "",
  argv.includes("--out") ? "" : `effectscript-${readManifest().version}.vsix`
)

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "efx-vscode-"))
try {
  const { preRelease } = await stageExtension(stage)
  packageStaged(stage, out, preRelease)
  process.stdout.write(`${out}\n`)
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exitCode = 1
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
