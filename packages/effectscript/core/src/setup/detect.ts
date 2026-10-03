/**
 * `efx setup` detection (spec §7.5, ADR-0052): which editors and coding agents are on this
 * machine. Pure over an injected environment, so tests need no real tools.
 *
 * @since 4.0.0
 */
import * as path from "node:path"

/**
 * @since 4.0.0
 * @category models
 */
export interface SetupEnv {
  readonly home: string
  readonly platform: NodeJS.Platform
  /** The PATH directories. */
  readonly path: ReadonlyArray<string>
  /**
   * Environment variables (`XDG_CONFIG_HOME`, `APPDATA`, `LOCALAPPDATA`, `NVIM_APPNAME`,
   * `CLAUDE_CONFIG_DIR`, `CODEX_HOME`).
   */
  readonly vars: Readonly<Record<string, string | undefined>>
  readonly exists: (file: string) => boolean
  /** A directory's entry names (empty when it doesn't exist). */
  readonly entries: (dir: string) => ReadonlyArray<string>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Detected {
  readonly kind: "editor" | "agent"
  readonly id:
    | "vscode"
    | "cursor"
    | "windsurf"
    | "vscodium"
    | "neovim"
    | "helix"
    | "zed"
    | "jetbrains"
    | "claude"
    | "codex"
    | "cursor-agent"
    | "gemini"
    | "opencode"
  readonly name: string
  /** The CLI that drives it, when there is one. */
  readonly cli?: string | undefined
  /** Where its configuration lives (editors that `efx setup` configures by files). */
  readonly configDir?: string | undefined
  /** Where it loads skills from (agents). */
  readonly skillsDir?: string | undefined
  /** What gave it away, for the report. */
  readonly evidence: string
}

const join = (env: SetupEnv, ...parts: Array<string>) =>
  (env.platform === "win32" ? path.win32 : path.posix).join(...parts)

/** A CLI on PATH (`.exe`/`.cmd` on Windows). */
const which = (env: SetupEnv, name: string): string | undefined => {
  const names = env.platform === "win32" ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name]
  for (const dir of env.path) {
    for (const candidate of names) {
      const file = join(env, dir, candidate)
      if (env.exists(file)) return file
    }
  }
  return undefined
}

/** macOS app bundles, in /Applications and ~/Applications. */
const app = (env: SetupEnv, bundle: string, inside: string): string | undefined => {
  if (env.platform !== "darwin") return undefined
  for (const root of ["/Applications", join(env, env.home, "Applications")]) {
    const file = join(env, root, bundle, inside)
    if (env.exists(file)) return file
  }
  return undefined
}

/**
 * A directory from an environment variable, when it is set to an absolute path: an empty or
 * relative value would put files wherever efx happens to run (Plan 20 review I2).
 */
const directoryVar = (env: SetupEnv, name: string): string | undefined => {
  const value = env.vars[name]
  if (value === undefined || value === "") return undefined
  const absolute = env.platform === "win32" ? path.win32.isAbsolute(value) : path.posix.isAbsolute(value)
  return absolute ? value : undefined
}

/** `$XDG_CONFIG_HOME`, `%APPDATA%` or `%LOCALAPPDATA%`, by the tool's convention. */
const configHome = (env: SetupEnv, windows: "APPDATA" | "LOCALAPPDATA") =>
  env.platform === "win32"
    ? directoryVar(env, windows) ?? join(env, env.home, "AppData", windows === "APPDATA" ? "Roaming" : "Local")
    : directoryVar(env, "XDG_CONFIG_HOME") ?? join(env, env.home, ".config")

const vscodeFamily: ReadonlyArray<readonly [Detected["id"], string, string, string]> = [
  ["vscode", "VS Code", "code", "Visual Studio Code.app"],
  ["cursor", "Cursor", "cursor", "Cursor.app"],
  ["windsurf", "Windsurf", "windsurf", "Windsurf.app"],
  ["vscodium", "VSCodium", "codium", "VSCodium.app"]
]

const jetbrains = /^(IntelliJ IDEA|WebStorm|PyCharm|GoLand|RubyMine|PhpStorm|CLion|Rider|RustRover|Fleet|Aqua|DataGrip)/

/**
 * The editors and agents on this machine, editors first, each in a fixed order.
 *
 * @since 4.0.0
 * @category setup
 */
export const detect = (env: SetupEnv): Array<Detected> => {
  const found: Array<Detected> = []
  for (const [id, name, command, bundle] of vscodeFamily) {
    const cli = which(env, command) ?? app(env, bundle, `Contents/Resources/app/bin/${command}`)
    if (cli !== undefined) found.push({ kind: "editor", id, name, cli, evidence: cli })
  }
  const nvim = which(env, "nvim")
  if (nvim !== undefined) {
    found.push({
      kind: "editor",
      id: "neovim",
      name: "Neovim",
      cli: nvim,
      // NVIM_APPNAME picks another config directory (LazyVim, AstroNvim, …)
      configDir: join(env, configHome(env, "LOCALAPPDATA"), env.vars.NVIM_APPNAME || "nvim"),
      evidence: nvim
    })
  }
  const hx = which(env, "hx") ?? which(env, "helix")
  if (hx !== undefined) {
    found.push({
      kind: "editor",
      id: "helix",
      name: "Helix",
      cli: hx,
      configDir: join(env, configHome(env, "APPDATA"), "helix"),
      evidence: hx
    })
  }
  const zed = which(env, "zed") ?? app(env, "Zed.app", "Contents/MacOS/zed")
  if (zed !== undefined) found.push({ kind: "editor", id: "zed", name: "Zed", cli: zed, evidence: zed })
  const ides = env.platform === "darwin"
    ? ["/Applications", join(env, env.home, "Applications")].flatMap((dir) => env.entries(dir)).filter((e) =>
      jetbrains.test(e)
    )
    : []
  if (ides.length > 0) {
    found.push({ kind: "editor", id: "jetbrains", name: "JetBrains IDEs", evidence: ides.join(", ") })
  }

  const agent = (id: Detected["id"], name: string, command: string | undefined, home: string) => {
    const cli = command === undefined ? undefined : which(env, command)
    if (cli === undefined && !env.exists(home)) return
    found.push({ kind: "agent", id, name, cli, skillsDir: join(env, home, "skills"), evidence: cli ?? home })
  }
  agent("claude", "Claude Code", "claude", directoryVar(env, "CLAUDE_CONFIG_DIR") ?? join(env, env.home, ".claude"))
  agent("codex", "Codex", "codex", directoryVar(env, "CODEX_HOME") ?? join(env, env.home, ".codex"))
  agent("cursor-agent", "Cursor (agent)", undefined, join(env, env.home, ".cursor"))
  agent("gemini", "Gemini CLI", "gemini", join(env, env.home, ".gemini"))
  agent("opencode", "opencode", "opencode", join(env, configHome(env, "APPDATA"), "opencode"))
  return found
}
