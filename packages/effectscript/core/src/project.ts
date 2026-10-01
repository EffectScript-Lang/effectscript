/**
 * Project information shared by `efx build`, `effectscript/register` and the language plugin, so
 * every path compiles a file with the same options, e.g. the same service keys (ADR-0014,
 * review I5). Node-only: the browser compiler takes these options explicitly.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * @since 4.0.0
 * @category models
 */
export interface PackageInfo {
  readonly packageName?: string | undefined
  readonly packageRoot?: string | undefined
}

const cache = new Map<string, PackageInfo>()

/**
 * The name and root of the nearest `package.json` above `filename` (cached per directory).
 *
 * @since 4.0.0
 * @category project
 */
export const packageInfo = (filename: string): PackageInfo => {
  const visited: Array<string> = []
  let info: PackageInfo = {}
  for (let dir = path.dirname(path.resolve(filename));; dir = path.dirname(dir)) {
    const cached = cache.get(dir)
    if (cached !== undefined) {
      info = cached
      break
    }
    visited.push(dir)
    const file = path.join(dir, "package.json")
    if (fs.existsSync(file)) {
      try {
        const name: unknown = JSON.parse(fs.readFileSync(file, "utf8")).name
        info = { packageName: typeof name === "string" ? name : undefined, packageRoot: dir }
      } catch {
        info = { packageRoot: dir }
      }
      break
    }
    if (path.dirname(dir) === dir) break
  }
  for (const dir of visited) cache.set(dir, info)
  return info
}
