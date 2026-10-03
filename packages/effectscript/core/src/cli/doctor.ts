/**
 * `efx doctor` (spec §7.1): what is installed and configured for EffectScript here, and what is
 * missing, each with its fix. Editors and agents join in Plan 10b (`efx setup`, ADR-0038).
 *
 * @since 4.0.0
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { standalone } from "./host.ts"
import { member, parseJsonc } from "./jsonc.ts"
import { languageInstall } from "./project.ts"
import { defaultRuntime } from "./run.ts"

interface Check {
  readonly name: string
  readonly ok: boolean
  /** A missing optional item doesn't fail the doctor. */
  readonly optional?: boolean
  readonly detail: string
}

/** The version of `name` installed for the project at `cwd`, if any. */
const installed = (cwd: string, name: string): string | undefined => {
  try {
    const file = createRequire(path.join(cwd, "package.json")).resolve(`${name}/package.json`)
    return JSON.parse(fs.readFileSync(file, "utf8")).version
  } catch {
    return undefined
  }
}

const atLeast = (version: string, major: number, minor: number): boolean => {
  const [a = 0, b = 0] = version.split(".").map(Number)
  return a > major || (a === major && b >= minor)
}

/**
 * Runs `efx doctor` in `cwd`. Returns the exit code: 1 when something required is missing.
 *
 * @since 4.0.0
 * @category cli
 */
export const doctor = (cwd: string, out: (line: string) => void): number => {
  const checks: Array<Check> = []
  const host = standalone()
  if (host === undefined) {
    const node = process.versions.node
    checks.push({
      name: `Node ${node}`,
      ok: atLeast(node, 22, 18),
      detail: "efx needs Node 22.18 or newer (it runs TypeScript sources)"
    })
  } else {
    // the binary carries its own Bun: Node is optional (ADR-0037)
    checks.push({
      name: `efx ${host.version} (standalone, Bun ${process.versions.bun ?? "built in"})`,
      ok: true,
      detail: ""
    })
  }
  const bun = spawnSync("bun", ["--version"], { encoding: "utf8" })
  checks.push({
    name: bun.status === 0 ? `Bun ${bun.stdout.trim()}` : "Bun",
    ok: bun.status === 0,
    optional: true,
    detail: "optional: the Bun integration (bun run, bun test) uses it (https://bun.sh)"
  })
  checks.push({
    name: host !== undefined
      ? "efx run uses its built-in Bun"
      : `efx run uses ${defaultRuntime(cwd) === "bun" ? "Bun" : "Node"}`,
    ok: true,
    detail: ""
  })
  const hasPackage = fs.existsSync(path.join(cwd, "package.json"))
  checks.push({ name: "package.json", ok: hasPackage, detail: "run efx in a project: npm init, then efx init" })
  if (hasPackage) {
    const ts = installed(cwd, "typescript")
    checks.push({
      name: ts === undefined ? "TypeScript 6" : `TypeScript 6 (${ts})`,
      ok: ts?.startsWith("6.") === true,
      detail: "efx check and efx build need it: npm i -D typescript@6"
    })
    const language = installed(cwd, "@effectscript/language")
    checks.push({
      name: "@effectscript/language",
      ok: language !== undefined,
      detail: `editor support and efx check: ${languageInstall}`
    })
    const effect = installed(cwd, "effect")
    checks.push({
      name: effect === undefined ? "effect" : `effect ${effect}`,
      ok: effect !== undefined,
      detail: "EffectScript compiles to Effect: npm i effect"
    })
    const tsconfig = path.join(cwd, "tsconfig.json")
    const root = fs.existsSync(tsconfig) ? parseJsonc(fs.readFileSync(tsconfig, "utf8")) : undefined
    const plugins = member(member(root, "compilerOptions"), "plugins")
    const configured = plugins?.kind === "array" &&
      plugins.items.some((p) =>
        (member(p, "name") as { value?: unknown } | undefined)?.value === "@effectscript/language"
      )
    checks.push({ name: "tsconfig.json plugin", ok: configured, detail: "editors see .efx files: run efx init" })
  }
  for (const check of checks) {
    out(`${check.ok ? "ok     " : "missing"} ${check.name}${check.ok ? "" : ` — ${check.detail}`}`)
  }
  return checks.some((c) => !c.ok && c.optional !== true) ? 1 : 0
}
