import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { skillFiles } from "../scripts/standalone.ts"

const root = path.join(import.meta.dirname, "..")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-standalone-package-"))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

describe("standalone packaging, without Bun (Plan 21)", () => {
  it("embeds the skill's Markdown only, as npm packs it", () => {
    const skill = path.join(work, "skill")
    fs.mkdirSync(path.join(skill, "references"), { recursive: true })
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill\n")
    fs.writeFileSync(path.join(skill, "references/syntax.md"), "# syntax\n")
    fs.writeFileSync(path.join(skill, ".DS_Store"), "junk")
    fs.writeFileSync(path.join(skill, "references/notes.txt"), "scratch")
    expect(skillFiles(skill)).toEqual([["SKILL.md", "# skill\n"], ["references/syntax.md", "# syntax\n"]])
  })

  it.skipIf(process.platform !== "darwin")("writes archives without macOS extended attributes", () => {
    const outdir = path.join(work, "bin")
    fs.mkdirSync(outdir)
    const binary = path.join(outdir, "efx-darwin-arm64")
    fs.writeFileSync(binary, "#!/bin/sh\n", { mode: 0o755 })
    expect(spawnSync("xattr", ["-w", "com.apple.quarantine", "0081;0;efx;", binary]).status).toBe(0)
    const result = spawnSync(process.execPath, [
      path.join(root, "scripts/standalone.ts"),
      "package",
      "--outdir",
      outdir
    ], {
      encoding: "utf8"
    })
    expect(result.status, result.stderr).toBe(0)
    const listed = spawnSync("tar", ["-tvzf", path.join(outdir, "efx-darwin-arm64.tar.gz")], { encoding: "utf8" })
    expect(listed.stdout.trim().split("\n")).toHaveLength(1)
    expect(listed.stdout).not.toContain("._efx")
    // bsdtar keeps attributes as pax headers too: a raw read of the archive shows none
    const raw = spawnSync("sh", ["-c", `gzip -dc ${JSON.stringify(path.join(outdir, "efx-darwin-arm64.tar.gz"))}`], {
      encoding: "latin1"
    })
    expect(raw.stdout).not.toMatch(/xattr|quarantine/)
  })
})
