import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const root = path.join(import.meta.dirname, "..")
const repo = path.join(root, "../../..")
const hasRuby = spawnSync("ruby", ["--version"]).status === 0
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-brew-"))
const sums = path.join(work, "SHASUMS256.txt")
const hash = (n: number) => String(n).repeat(64)
fs.writeFileSync(
  sums,
  [
    "darwin-arm64.tar.gz",
    "darwin-x64.tar.gz",
    "linux-arm64.tar.gz",
    "linux-arm64-musl.tar.gz",
    "linux-x64.tar.gz",
    "linux-x64-musl.tar.gz",
    "windows-x64.zip"
  ].map((asset, i) => `${hash(i + 1)}  efx-${asset}\n`).join("")
)
const formula = (args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [path.join(root, "scripts/homebrew.ts"), ...args], { encoding: "utf8" })

afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

const generated = () => formula(["--version", "4.0.0-alpha.1", "--shasums", sums])

describe("the Homebrew formula (Plan 10 Task 5, ADR-0038)", () => {
  it("pins each macOS and glibc Linux build to its release asset and checksum", ({ expect }) => {
    const result = generated()
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    const base = "https://github.com/EffectScript-Lang/effectscript/releases/download/effectscript@4.0.0-alpha.1"
    for (const [target, n] of [["darwin-arm64", 1], ["darwin-x64", 2], ["linux-arm64", 3], ["linux-x64", 5]] as const) {
      expect(result.stdout).toContain(`url "${base}/efx-${target}.tar.gz"\n      sha256 "${hash(n)}"`)
    }
    expect(result.stdout).not.toMatch(/musl|windows/)
    expect(result.stdout).toMatchSnapshot()
  })

  it.skipIf(!hasRuby)("is valid Ruby", () => {
    const file = path.join(work, "effectscript.rb")
    fs.writeFileSync(file, generated().stdout)
    const check = spawnSync("ruby", ["-c", file], { encoding: "utf8" })
    expect(check.stdout.trim()).toBe("Syntax OK")
  })

  it("takes another download base for local testing", () => {
    const local = formula(["--version", "1.0.0", "--shasums", sums, "--base", "http://localhost:8000/latest/download"])
    expect(local.stdout).toContain(`url "http://localhost:8000/latest/download/efx-linux-x64.tar.gz"`)
  })

  it("refuses checksums missing a platform", () => {
    const partial = path.join(work, "partial.txt")
    fs.writeFileSync(partial, `${hash(1)}  efx-darwin-arm64.tar.gz\n`)
    const missing = formula(["--version", "4.0.0", "--shasums", partial])
    expect(missing.status).toBe(1)
    expect(missing.stderr).toMatch(/efx-darwin-x64\.tar\.gz/)
  })
})

describe.skipIf(!hasRuby)("the release workflow (Plan 10 Task 5, ADR-0038)", () => {
  it("is valid YAML that builds with the standalone script and publishes the formula", () => {
    const file = path.join(repo, ".github/workflows/effectscript-release.yml")
    const parsed = spawnSync("ruby", ["-ryaml", "-rjson", "-e", "puts JSON.generate(YAML.load_file(ARGV[0]))", file], {
      encoding: "utf8"
    })
    expect(parsed.stderr).toBe("")
    const workflow = JSON.parse(parsed.stdout)
    // YAML 1.1 (Ruby's parser) reads the `on` key as `true`
    expect((workflow.on ?? workflow.true).push.tags).toEqual(["effectscript@*"])
    const text = fs.readFileSync(file, "utf8")
    expect(text).toContain("scripts/standalone.ts build")
    expect(text).toContain("scripts/standalone.ts package")
    expect(text).toContain("scripts/homebrew.ts")
    expect(text).toContain("EffectScript-Lang/homebrew-tap")
    expect(text).not.toContain("gunta")
  })
})
