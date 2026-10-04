/**
 * Stages the EffectScript VS Code extension into a directory as the editor loads it (ADR-0041):
 *
 * - `out/extension.cjs`: the extension (esbuild, `vscode` external);
 * - `node_modules/@effectscript/language/index.js`: the TypeScript server plugin the manifest's
 *   `typescriptServerPlugins` names, with the compiler inside.
 *
 * VS Code ^1.95 runs extensions and tsserver plugins on Electron's Node 20, without `require(esm)`,
 * so everything they load is a CommonJS bundle. The icons come from `brand/icons/editor`. The
 * manifest carries the Marketplace's form of the version (ADR-0055), and its only dependency is the
 * bundled plugin pack.
 */
import { build } from "esbuild"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { marketplaceVersion } from "./marketplace.ts"

export const root = path.join(import.meta.dirname, "..")
const language = path.join(root, "../language")
const brand = path.join(root, "../brand/icons/editor")

export const readManifest = () => JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))

/** Writes the extension into `stage`, which must exist and be empty. */
export const stageExtension = async (stage: string): Promise<{ readonly preRelease: boolean }> => {
  const manifest = readManifest()
  const common = { bundle: true, platform: "node", format: "cjs", target: "node20", logLevel: "warning" } as const
  await build({
    ...common,
    entryPoints: [path.join(root, "src/extension.ts")],
    external: ["vscode"],
    outfile: path.join(stage, "out/extension.cjs")
  })
  // tsserver `require`s the plugin by name from the extension's node_modules, and wants the factory
  const pack = path.join(stage, "node_modules/@effectscript/language")
  const entry = path.join(stage, "plugin-entry.cjs")
  fs.writeFileSync(
    entry,
    `module.exports = require(${JSON.stringify(path.join(language, "src/typescriptPlugin.ts"))}).typescriptPlugin\n`
  )
  await build({ ...common, entryPoints: [entry], external: ["typescript"], outfile: path.join(pack, "index.js") })
  fs.rmSync(entry)
  fs.writeFileSync(
    path.join(pack, "package.json"),
    `${JSON.stringify({ name: "@effectscript/language", version: manifest.version, main: "index.js" }, null, 2)}\n`
  )
  // the manifest's only dependency is the bundled plugin pack: vsce packages what `npm list` reports
  const { dependencies: _dependencies, devDependencies: _devDependencies, ...rest } = manifest
  const marketplace = marketplaceVersion(manifest.version)
  const packed = { ...rest, version: marketplace.version, dependencies: { "@effectscript/language": manifest.version } }
  fs.writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(packed, null, 2)}\n`)
  for (const file of ["README.md", "language-configuration.json", "LICENSE"]) {
    fs.copyFileSync(path.join(root, file), path.join(stage, file))
  }
  fs.cpSync(path.join(root, "syntaxes"), path.join(stage, "syntaxes"), { recursive: true })
  fs.mkdirSync(path.join(stage, "images"))
  for (const icon of ["extension-icon-128.png", "file-efx-dark.svg", "file-efx-light.svg"]) {
    fs.copyFileSync(path.join(brand, icon), path.join(stage, "images", icon))
  }
  return { preRelease: marketplace.preRelease }
}

/** Runs `vsce package` in a staged directory, writing the `.vsix` to `out`. */
export const packageStaged = (stage: string, out: string, preRelease: boolean): void => {
  const vsce = path.join(root, "node_modules/.bin/vsce")
  const result = spawnSync(vsce, ["package", "--out", out, ...(preRelease ? ["--pre-release"] : [])], {
    cwd: stage,
    encoding: "utf8"
  })
  if (result.status !== 0) throw new Error(`vsce package failed:\n${result.stdout}${result.stderr}`)
}
