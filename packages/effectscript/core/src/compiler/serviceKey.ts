/**
 * `"<package>/<dir relative to package root, minus src/>/<Name>"` (spec §4.8).
 *
 * @since 0.1.0
 */
import type { ResolvedOptions } from "./options.ts"

/**
 * `"<package>/<dir>/<module>/<Name>"` (ADR-0014). `<dir>` is relative to the package root, minus a
 * leading `src/`; `<module>` is the file name without extension, omitted when it equals `<Name>`
 * (ignoring case) or is `index`. A relative filename keeps its directories; an absolute one outside the
 * package root keeps only its file name, so keys never contain absolute paths (ADR-0018). Without a
 * package name the key is `<Name>`.
 *
 * @since 0.1.0
 * @category utils
 */
export const serviceKey = (options: ResolvedOptions, name: string): string => {
  if (options.packageName === undefined) return name
  let file = options.filename.replace(/\\/g, "/")
  const root = options.packageRoot?.replace(/\\/g, "/").replace(/\/$/, "")
  if (root !== undefined && file.startsWith(`${root}/`)) {
    file = file.slice(root.length + 1)
  } else if (/^(\/|[A-Za-z]:\/)/.test(file)) {
    // an absolute path outside a known root: never leak machine-specific directories
    file = file.slice(file.lastIndexOf("/") + 1)
  }
  file = file.replace(/^\.\//, "").replace(/^src\//, "")
  const slash = file.lastIndexOf("/")
  const dir = slash === -1 ? "" : file.slice(0, slash)
  const base = file.slice(slash + 1)
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
  const module = stem.toLowerCase() === name.toLowerCase() || stem === "index" ? "" : stem
  return [options.packageName, dir, module, name].filter((part) => part !== "").join("/")
}
