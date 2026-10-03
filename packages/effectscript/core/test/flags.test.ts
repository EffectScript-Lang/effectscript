import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
const temp = () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-flags-")))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})
const tree = (dir: string) => (fs.readdirSync(dir, { recursive: true }) as Array<string>).sort()
/** `efx` in an empty folder with an empty HOME: nothing outside them can be touched. */
const efxIn = (args: ReadonlyArray<string>) => {
  const cwd = temp()
  const home = temp()
  const result = spawnSync(process.execPath, [efx, ...args], {
    cwd,
    encoding: "utf8",
    env: { EFFECTSCRIPT_DEV: "1", HOME: home, PATH: "/usr/bin:/bin" },
    input: ""
  })
  return { ...result, written: [...tree(cwd), ...tree(home)] }
}

describe("flag validation (Plan 18 Task 5)", { timeout: 60_000 }, () => {
  it("efx setup --only refuses an unknown id, listing the valid ones", () => {
    const result = efxIn(["setup", "--only", "claude,vim"])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/--only: unknown "vim"/)
    expect(result.stderr).toContain("claude, codex, cursor-agent, gemini, opencode, vscode")
    expect(result.written).toEqual([])
  })

  it("efx convert --agent refuses an unknown agent", () => {
    const result = efxIn(["convert", "--ai", "--agent", "copilot"])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/claude.*codex.*gemini.*opencode/)
    expect(result.written).toEqual([])
  })

  it("efx convert --timeout refuses less than 1 second", () => {
    const result = efxIn(["convert", "--ai", "--timeout", "0"])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/--timeout must be at least 1/)
  })

  it("efx skill refuses --global with --dir", () => {
    const result = efxIn(["skill", "--global", "--dir", "skills"])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/--global and --dir/)
    expect(result.written).toEqual([])
  })
})
