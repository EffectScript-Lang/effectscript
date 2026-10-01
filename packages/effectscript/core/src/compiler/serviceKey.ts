/**
 * `"<package>/<dir relative to package root, minus src/>/<Name>"` (spec §4.8).
 *
 * @since 0.1.0
 */
import type { ResolvedOptions } from "./options.ts"

/**
 * @since 0.1.0
 * @category utils
 */
export const serviceKey = (options: ResolvedOptions, name: string): string => {
  if (options.packageName === undefined) return name
  let file = options.filename.replace(/\\/g, "/")
  const root = options.packageRoot?.replace(/\\/g, "/").replace(/\/$/, "")
  if (root !== undefined && file.startsWith(`${root}/`)) file = file.slice(root.length + 1)
  file = file.replace(/^\.\//, "").replace(/^src\//, "")
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""
  return [options.packageName, dir, name].filter((part) => part !== "").join("/")
}
