import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { manifestProblems, nextVersion, tarballProblems } from "../scripts/release.ts"

const script = path.join(import.meta.dirname, "../scripts/release.ts")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-release-"))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

let repos = 0
/** A repository with the effect package, three EffectScript packages, and changesets. */
const repo = (options: {
  readonly effect?: string
  readonly versions?: ReadonlyArray<string>
  readonly changelog?: string
  readonly notes?: Record<string, string>
} = {}) => {
  const root = path.join(work, `repo-${repos++}`)
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  write("packages/effect/package.json", JSON.stringify({ name: "effect", version: options.effect ?? "4.0.0" }))
  const versions = options.versions ?? ["4.0.0-alpha.0", "4.0.0-alpha.0", "4.0.0-alpha.0"]
  ;["core", "language", "site"].forEach((dir, i) =>
    write(
      `packages/effectscript/${dir}/package.json`,
      `${JSON.stringify({ name: dir === "core" ? "effectscript" : `@effectscript/${dir}`, version: versions[i] }, null, 2)}\n`
    )
  )
  write("packages/effectscript/brand/README.md", "no package here\n")
  if (options.changelog !== undefined) write("packages/effectscript/CHANGELOG.md", options.changelog)
  write(".changeset/config.json", "{}\n")
  for (const [name, content] of Object.entries(options.notes ?? {})) write(`.changeset/${name}`, content)
  return root
}
const release = (root: string, ...args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [script, ...args, "--root", root], { encoding: "utf8" })
const version = (root: string, dir = "core") =>
  JSON.parse(fs.readFileSync(path.join(root, "packages/effectscript", dir, "package.json"), "utf8")).version
const note = (packages: Record<string, string>, summary: string) =>
  `---\n${Object.entries(packages).map(([p, bump]) => `"${p}": ${bump}`).join("\n")}\n---\n\n${summary}\n`

describe("nextVersion (ADR-0015, ADR-0055)", () => {
  it("bumps the prerelease or the patch within the same Effect minor", () => {
    expect(nextVersion("4.0.0-alpha.0", "4.0", "alpha")).toBe("4.0.0-alpha.1")
    expect(nextVersion("4.0.0-alpha.7", "4.0", "none")).toBe("4.0.0")
    expect(nextVersion("4.0.0", "4.0", "none")).toBe("4.0.1")
    expect(nextVersion("4.0.1", "4.0", "alpha")).toBe("4.0.2-alpha.0")
  })

  it("resets to .0 for a new Effect minor or major", () => {
    expect(nextVersion("4.0.3", "4.1", "none")).toBe("4.1.0")
    expect(nextVersion("4.0.0-alpha.4", "4.1", "alpha")).toBe("4.1.0-alpha.0")
    expect(nextVersion("4.3.2", "5.0", "none")).toBe("5.0.0")
  })

  it("starts at the Effect minor's first version when nothing was released", () => {
    expect(nextVersion(undefined, "4.0", "alpha")).toBe("4.0.0-alpha.0")
    expect(nextVersion(undefined, "4.2", "none")).toBe("4.2.0")
  })

  it("refuses an Effect version older than the released one", () => {
    expect(() => nextVersion("4.1.0", "4.0", "none")).toThrow(/older than/)
    expect(() => nextVersion("5.0.0-alpha.1", "4.9", "alpha")).toThrow(/older than/)
  })
})

describe("release.ts version", () => {
  it("writes the next version to every EffectScript package, private ones included", () => {
    const root = repo({ changelog: "# EffectScript\n\n## 4.0.0-alpha.0\n\n- First.\n" })
    const result = release(root, "version")
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("4.0.0-alpha.0 -> 4.0.0-alpha.1")
    expect(["core", "language", "site"].map((dir) => version(root, dir))).toEqual([
      "4.0.0-alpha.1",
      "4.0.0-alpha.1",
      "4.0.0-alpha.1"
    ])
    // the effect package is never touched
    expect(JSON.parse(fs.readFileSync(path.join(root, "packages/effect/package.json"), "utf8")).version).toBe("4.0.0")
  })

  it("is idempotent: the next version is computed from the released one in the changelog", () => {
    const root = repo({ changelog: "# EffectScript\n\n## 4.0.0-alpha.0\n" })
    expect(release(root, "version").status).toBe(0)
    const again = release(root, "version")
    expect(again.status).toBe(0)
    expect(again.stdout).toContain("already 4.0.0-alpha.1")
    expect(version(root)).toBe("4.0.0-alpha.1")
  })

  it("keeps the first version when nothing was released yet", () => {
    const root = repo()
    const result = release(root, "version")
    expect(result.status).toBe(0)
    expect(version(root)).toBe("4.0.0-alpha.0")
  })

  it("follows --effect and --prerelease", () => {
    const root = repo({ changelog: "## 4.0.0-alpha.3\n" })
    expect(release(root, "version", "--effect", "4.1", "--prerelease", "none").status).toBe(0)
    expect(version(root, "language")).toBe("4.1.0")
  })

  it("refuses packages that disagree, naming them", () => {
    const root = repo({ versions: ["4.0.0-alpha.1", "4.0.0-alpha.0", "4.0.0-alpha.1"] })
    const result = release(root, "version")
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/@effectscript\/language is 4\.0\.0-alpha\.0/)
    expect(version(root)).toBe("4.0.0-alpha.1")
  })

  it("refuses an Effect older than the released version, and bad options", () => {
    const root = repo({ changelog: "## 4.1.0\n" })
    expect(release(root, "version").stderr).toMatch(/older than/)
    expect(release(root, "version", "--effect", "4").stderr).toMatch(/--effect/)
    expect(release(root, "version", "--prerelease", "beta").stderr).toMatch(/--prerelease/)
    expect(version(root)).toBe("4.0.0-alpha.0")
  })
})

describe("release.ts changelog", () => {
  const upstream = note({ effect: "patch" }, "Fix a race in the sharding refresh.")
  const mixed = note({ effect: "patch", effectscript: "patch" }, "Both.")

  it("moves EffectScript's notes under the new version and leaves upstream ones", () => {
    const root = repo({
      versions: ["4.0.0-alpha.1", "4.0.0-alpha.1", "4.0.0-alpha.1"],
      changelog: "# EffectScript\n\n## 4.0.0-alpha.0\n\n- First.\n",
      notes: {
        "effectscript-living-docs.md": note({ effectscript: "minor" }, "Living docs.\n\nWith doctests."),
        "quiet-cats-run.md": note({ "@effectscript/language": "patch" }, "Hover fix."),
        "fix-sharding.md": upstream
      }
    })
    const result = release(root, "changelog")
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(fs.readFileSync(path.join(root, "packages/effectscript/CHANGELOG.md"), "utf8")).toBe(
      "# EffectScript\n\n## 4.0.0-alpha.1\n\n### Minor changes\n\n- Living docs.\n\n  With doctests.\n\n" +
        "### Patch changes\n\n- Hover fix.\n\n## 4.0.0-alpha.0\n\n- First.\n"
    )
    expect(fs.readdirSync(path.join(root, ".changeset")).sort()).toEqual(["config.json", "fix-sharding.md"])
    expect(fs.readFileSync(path.join(root, ".changeset/fix-sharding.md"), "utf8")).toBe(upstream)
  })

  it("creates the changelog for the first release", () => {
    const root = repo({ notes: { "effectscript-a.md": note({ "effectscript-vscode": "patch" }, "Icons.") } })
    expect(release(root, "changelog").status).toBe(0)
    expect(fs.readFileSync(path.join(root, "packages/effectscript/CHANGELOG.md"), "utf8")).toBe(
      "# EffectScript\n\n## 4.0.0-alpha.0\n\n### Patch changes\n\n- Icons.\n"
    )
  })

  it("refuses a note that names EffectScript and upstream packages, and changes nothing", () => {
    const root = repo({
      notes: { "effectscript-a.md": note({ effectscript: "patch" }, "Ok."), "mixed.md": mixed }
    })
    const result = release(root, "changelog")
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/mixed\.md names both/)
    expect(fs.existsSync(path.join(root, "packages/effectscript/CHANGELOG.md"))).toBe(false)
    expect(fs.existsSync(path.join(root, ".changeset/effectscript-a.md"))).toBe(true)
  })

  it("refuses when the version is already released, or there are no notes", () => {
    const released = repo({
      changelog: "## 4.0.0-alpha.0\n",
      notes: { "effectscript-a.md": note({ effectscript: "patch" }, "Ok.") }
    })
    expect(release(released, "changelog").stderr).toMatch(/already in the changelog.*release\.ts version/)
    expect(release(repo(), "changelog").stderr).toMatch(/no EffectScript notes/)
  })
})

describe("tarballProblems (Plan 17 Task 3)", () => {
  const manifest = { bin: { efx: "./bin/efx.js" } }
  const good = [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/bin/efx.js",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/src/index.ts"
  ]

  it("accepts dist, the README, the LICENSE and the bins", () => {
    expect(tarballProblems(manifest, good)).toEqual([])
  })

  it("names what is missing", () => {
    expect(tarballProblems(manifest, good.filter((f) => !f.endsWith("LICENSE") && !f.endsWith("efx.js")))).toEqual([
      "missing LICENSE",
      "missing bin/efx.js"
    ])
  })

  it("names tests, fixtures, build info and binaries that leaked in", () => {
    expect(tarballProblems(manifest, [
      ...good,
      "package/test/a.test.ts",
      "package/src/x/fixtures/a.efx",
      "package/tsconfig.tsbuildinfo",
      "package/dist-bin/efx-darwin-arm64"
    ])).toEqual([
      "unexpected test/a.test.ts",
      "unexpected src/x/fixtures/a.efx",
      "unexpected tsconfig.tsbuildinfo",
      "unexpected dist-bin/efx-darwin-arm64"
    ])
  })
})

describe("manifestProblems (spec §7.6, ADR-0055)", () => {
  const core = {
    name: "effectscript",
    version: "4.0.0-alpha.3",
    dependencies: { acorn: "^8.18.0" },
    peerDependencies: { effect: "~4.0.0", "@effect/platform-node": "~4.0.0", "@effectscript/language": "4.0.0-alpha.3" }
  }

  it("accepts Effect as a ~major.minor peer and EffectScript packages pinned to the same version", () => {
    expect(manifestProblems(core)).toEqual([])
    expect(manifestProblems({ name: "@effectscript/language", version: "4.1.2", dependencies: { effectscript: "4.1.2" } }))
      .toEqual([])
  })

  it("names Effect packages that are dependencies or not pinned to the minor", () => {
    expect(manifestProblems({
      ...core,
      dependencies: { effect: "^4.0.0" },
      peerDependencies: { "@effect/platform-node": "^4.0.0" }
    })).toEqual([
      "effect must be a peer dependency, not a dependency",
      "@effect/platform-node must be ~4.0.0 (got ^4.0.0)"
    ])
  })

  it("names EffectScript packages on another version", () => {
    expect(manifestProblems({ name: "@effectscript/language", version: "4.0.1", dependencies: { effectscript: "^4.0.0" } }))
      .toEqual(["effectscript must be 4.0.1 (got ^4.0.0)"])
  })

  it("holds for the workspace manifests, as pnpm will pack them", () => {
    const packages = path.join(import.meta.dirname, "../..")
    for (const dir of ["core", "language"]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(packages, dir, "package.json"), "utf8"))
      const packed = (deps: Record<string, string> | undefined) =>
        deps && Object.fromEntries(
          Object.entries(deps).map(([name, range]) => [
            name,
            range === "workspace:*"
              ? manifest.version
              : range === "workspace:~"
              ? "~4.0.0"
              : range.replace("workspace:", "") === "^"
              ? "^4.0.0"
              : range
          ])
        )
      expect(manifestProblems({
        ...manifest,
        version: manifest.version,
        dependencies: packed(manifest.dependencies),
        peerDependencies: packed(manifest.peerDependencies)
      }), dir).toEqual([])
    }
  })
})

describe.runIf(process.env.EFX_PACK === "1")("release.ts pack, installed in a clean project (EFX_PACK=1)", () => {
  it("builds and packs both packages, and the installed efx runs", () => {
    const out = path.join(work, "packed")
    const packed = spawnSync(process.execPath, [script, "pack", "--out", out], { encoding: "utf8" })
    expect(packed.stderr).toBe("")
    expect(packed.status).toBe(0)
    const tarballs = packed.stdout.trim().split("\n")
    expect(tarballs.map((t) => path.basename(t))).toEqual([
      expect.stringMatching(/^effectscript-\d.*\.tgz$/),
      expect.stringMatching(/^effectscript-language-\d.*\.tgz$/)
    ])
    for (const tarball of tarballs) {
      const manifest = JSON.parse(spawnSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }).stdout)
      expect(manifestProblems(manifest), tarball).toEqual([])
    }
    const project = path.join(work, "clean")
    fs.mkdirSync(project)
    fs.writeFileSync(
      path.join(project, "package.json"),
      JSON.stringify({ name: "clean", private: true, type: "module", dependencies: Object.fromEntries(
        tarballs.map((t, i) => [i === 0 ? "effectscript" : "@effectscript/language", `file:${t}`])
      ) })
    )
    // effect and its platform packages come from the registry, as they do for users
    const install = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
      cwd: project,
      encoding: "utf8"
    })
    expect(install.stderr).toBe("")
    const bin = (name: string) => path.join(project, "node_modules/.bin", name)
    const efxVersion = spawnSync(bin("efx"), ["--version"], { cwd: project, encoding: "utf8" })
    expect(efxVersion.stdout).toContain(version(path.join(import.meta.dirname, "../../../.."), "core"))
    fs.writeFileSync(path.join(project, "app.efx"), "export effect hello(name: string) {\n  return `hi ${name}`\n}\n")
    const printed = spawnSync(bin("efx"), ["print", "app.efx"], { cwd: project, encoding: "utf8" })
    expect(printed.stderr).toBe("")
    expect(printed.stdout).toContain("Effect.fn")
    // the installed compiler is the published build, not the sources
    expect(fs.realpathSync(path.join(project, "node_modules/effectscript/dist/cli/main.js"))).toBeTruthy()
    const server = spawnSync(process.execPath, ["-e", "import('@effectscript/language').then((m) => console.log(Object.keys(m).length > 0))"], {
      cwd: project,
      encoding: "utf8"
    })
    expect(server.stdout.trim()).toBe("true")
  }, 600_000)
})
