import { detect, type SetupEnv } from "effectscript/setup/detect"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const env = (files: ReadonlyArray<string>, options: Partial<SetupEnv> = {}): SetupEnv => {
  const set = new Set(files)
  return {
    home: "/home/u",
    platform: "linux",
    path: ["/usr/bin", "/home/u/.local/bin"],
    vars: {},
    exists: (p) => set.has(p) || [...set].some((f) => f.startsWith(`${p}/`)),
    entries: (dir) => [...new Set([...set].filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1).split("/")[0]!))],
    ...options
  }
}

const ids = (found: ReturnType<typeof detect>) => found.map((d) => d.id)

describe("efx setup detection (Plan 15 Task 1, ADR-0052)", () => {
  it("finds nothing on a bare machine", () => {
    expect(detect(env([]))).toEqual([])
  })

  it("finds editors by their CLI on PATH, and their config directories", () => {
    const found = detect(env(["/usr/bin/code", "/usr/bin/nvim", "/home/u/.local/bin/hx", "/usr/bin/zed"]))
    expect(ids(found)).toEqual(["vscode", "neovim", "helix", "zed"])
    expect(found.find((d) => d.id === "vscode")!.cli).toBe("/usr/bin/code")
    expect(found.find((d) => d.id === "neovim")!.configDir).toBe("/home/u/.config/nvim")
    expect(found.find((d) => d.id === "helix")!.configDir).toBe("/home/u/.config/helix")
  })

  it("honours XDG_CONFIG_HOME", () => {
    const found = detect(env(["/usr/bin/nvim"], { vars: { XDG_CONFIG_HOME: "/xdg" } }))
    expect(found[0]!.configDir).toBe("/xdg/nvim")
  })

  it("finds macOS app bundles that aren't on PATH", () => {
    const found = detect(env([
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
      "/Applications/Zed.app/Contents/MacOS/zed",
      "/Applications/WebStorm.app/Contents/Info.plist"
    ], { platform: "darwin", home: "/Users/u" }))
    expect(ids(found)).toEqual(["vscode", "cursor", "zed", "jetbrains"])
    expect(found[0]!.cli).toBe("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")
    expect(found.find((d) => d.id === "jetbrains")!.evidence).toContain("WebStorm")
  })

  it("finds coding agents by their CLI or their home directory, with their skills directory", () => {
    const found = detect(env(["/usr/bin/claude", "/home/u/.codex/config.toml", "/home/u/.gemini/settings.json", "/home/u/.config/opencode/opencode.json", "/home/u/.cursor/argv.json"]))
    expect(found.filter((d) => d.kind === "agent").map((d) => [d.id, d.skillsDir])).toEqual([
      ["claude", "/home/u/.claude/skills"],
      ["codex", "/home/u/.codex/skills"],
      ["cursor-agent", "/home/u/.cursor/skills"],
      ["gemini", "/home/u/.gemini/skills"],
      ["opencode", "/home/u/.config/opencode/skills"]
    ])
  })

  it("uses Windows conventions: .cmd and .exe CLIs, APPDATA and LOCALAPPDATA", () => {
    const found = detect(env([
      "C:\\Tools\\code.cmd",
      "C:\\Tools\\nvim.exe",
      "C:\\Tools\\hx.exe"
    ], {
      platform: "win32",
      home: "C:\\Users\\u",
      path: ["C:\\Tools"],
      vars: { APPDATA: "C:\\Users\\u\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
      exists: (p) => ["C:\\Tools\\code.cmd", "C:\\Tools\\nvim.exe", "C:\\Tools\\hx.exe"].includes(p)
    }))
    expect(found.map((d) => [d.id, d.cli, d.configDir])).toEqual([
      ["vscode", "C:\\Tools\\code.cmd", undefined],
      ["neovim", "C:\\Tools\\nvim.exe", path.win32.join("C:\\Users\\u\\AppData\\Local", "nvim")],
      ["helix", "C:\\Tools\\hx.exe", path.win32.join("C:\\Users\\u\\AppData\\Roaming", "helix")]
    ])
  })
})
