/**
 * Where `efx` runs (ADR-0037): the npm package on Node, or the standalone `bun build --compile`
 * binary. The binary's generated entry sets `globalThis.__effectscriptStandalone` before it imports
 * the CLI; files it needs on disk (the Bun preload) are unpacked into the user cache directory.
 *
 * @since 4.0.0
 */
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * @since 4.0.0
 * @category models
 */
export interface StandaloneHost {
  /** The `effectscript` version the binary was built from. */
  readonly version: string
  /** The bundled Bun preload (`effectscript/bun` plus the runtime choice), as JavaScript. */
  readonly preload: string
}

/**
 * The standalone binary's host, or `undefined` for the npm CLI.
 *
 * @since 4.0.0
 * @category host
 */
export const standalone = (): StandaloneHost | undefined =>
  (globalThis as { readonly __effectscriptStandalone?: StandaloneHost }).__effectscriptStandalone

/**
 * The user cache directory for `efx`: `$XDG_CACHE_HOME`, else the platform's convention.
 *
 * @since 4.0.0
 * @category host
 */
export const cacheDir = (
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
  home: string
): string => {
  const join = platform === "win32" ? path.win32.join : path.join
  // the XDG spec ignores relative paths
  if (env.XDG_CACHE_HOME !== undefined && path.isAbsolute(env.XDG_CACHE_HOME)) {
    return join(env.XDG_CACHE_HOME, "effectscript")
  }
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "effectscript")
  if (platform === "darwin") return join(home, "Library", "Caches", "effectscript")
  return join(home, ".cache", "effectscript")
}

/**
 * Writes `content` to `<dir>/<name>-<hash>.js` unless that file already holds exactly it, and
 * returns the path. The write is atomic (a temp file, then a rename), so concurrent runs and
 * interrupted writes never leave a partial file behind.
 *
 * @since 4.0.0
 * @category host
 */
export const unpack = (dir: string, name: string, content: string): string => {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16)
  const file = path.join(dir, `${name}-${hash}.js`)
  try {
    if (fs.readFileSync(file, "utf8") === content) return file
  } catch {
    // missing or unreadable: write it
  }
  fs.mkdirSync(dir, { recursive: true })
  const temp = path.join(dir, `.${name}-${hash}.${process.pid}.${Date.now()}.tmp`)
  try {
    fs.writeFileSync(temp, content)
    fs.renameSync(temp, file)
  } finally {
    fs.rmSync(temp, { force: true })
  }
  return file
}
