/**
 * EffectScript's release steps in this fork (ADR-0055). Nothing here publishes.
 *
 *   node scripts/release.ts version [--effect x.y] [--prerelease alpha|none]
 *   node scripts/release.ts changelog
 *   node scripts/release.ts pack [--out dir]
 *
 * - `version` writes the next version to every package in `packages/effectscript`, and moves the
 *   Effect peer ranges to `~x.y.0`. Its major.minor is Effect's (ADR-0015); the patch and the
 *   `alpha.N` number are EffectScript's own. It is computed from the last released version (the
 *   newest changelog section with an `effectscript@<version>` tag), so running it twice, or after
 *   `changelog`, is safe.
 * - `changelog` moves the `.changeset` notes that name only EffectScript packages into
 *   `packages/effectscript/CHANGELOG.md`, under the packages' version. Upstream notes stay.
 * - `pack` builds `effectscript` and `@effectscript/language` from clean and packs them, refusing a
 *   tarball that misses its `dist`, README, LICENSE or bins, or that holds tests or build files.
 *
 * `--root <dir>` replaces the repository root (for tests).
 */
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * The version after `released` for an Effect `major.minor`: a new Effect minor starts at `.0`, the
 * same one bumps the prerelease number or the patch. Throws when Effect is older than `released`.
 */
export const nextVersion = (
  released: string | undefined,
  effect: string,
  prerelease: "alpha" | "none"
): string => {
  const [major, minor] = effect.split(".").map(Number) as [number, number]
  const first = `${major}.${minor}.0${prerelease === "alpha" ? "-alpha.0" : ""}`
  if (released === undefined) return first
  const v = parse(released)
  if (v.major > major || (v.major === major && v.minor > minor)) {
    throw new Error(`Effect ${effect} is older than the released EffectScript ${released}`)
  }
  if (v.major !== major || v.minor !== minor) return first
  if (v.alpha !== undefined) {
    return prerelease === "alpha" ? `${major}.${minor}.${v.patch}-alpha.${v.alpha + 1}` : `${major}.${minor}.${v.patch}`
  }
  return `${major}.${minor}.${v.patch + 1}${prerelease === "alpha" ? "-alpha.0" : ""}`
}

const parse = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-alpha\.(\d+))?$/.exec(version)
  if (match === null) throw new Error(`${version} is not an EffectScript version (x.y.z or x.y.z-alpha.N)`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    alpha: match[4] === undefined ? undefined : Number(match[4])
  }
}

interface Package {
  readonly file: string
  readonly name: string
  readonly version: string
}

const packages = (root: string): Array<Package> => {
  const family = path.join(root, "packages/effectscript")
  return fs.readdirSync(family).sort().flatMap((dir) => {
    const file = path.join(family, dir, "package.json")
    if (!fs.existsSync(file)) return []
    const { name, version } = JSON.parse(fs.readFileSync(file, "utf8"))
    return [{ file, name, version }]
  })
}

/** The packages' one version; throws, naming each, when they disagree. */
const agreed = (list: ReadonlyArray<Package>): string => {
  const versions = new Set(list.map((p) => p.version))
  if (versions.size !== 1) {
    throw new Error(`the EffectScript packages disagree: ${list.map((p) => `${p.name} is ${p.version}`).join(", ")}`)
  }
  return list[0]!.version
}

const changelogFile = (root: string) => path.join(root, "packages/effectscript/CHANGELOG.md")

const readChangelog = (root: string): string | undefined => {
  try {
    return fs.readFileSync(changelogFile(root), "utf8")
  } catch {
    return undefined
  }
}

const isTagged = (root: string, version: string): boolean => {
  const result = spawnSync("git", ["tag", "--list", `effectscript@${version}`], { cwd: root, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git tag failed in ${root}: ${result.stderr}`)
  return result.stdout.trim() !== ""
}

/**
 * The changelog's releases: the newest tagged section is the last release, and a newer section
 * without a tag is a release in progress (review I4).
 */
const releases = (root: string, changelog: string | undefined) => {
  const sections = changelog === undefined
    ? []
    : [...changelog.matchAll(/^## (\d+\.\d+\.\d+(?:-alpha\.\d+)?)\s*$/gm)].map((m) => m[1]!)
  const last = sections.findIndex((v) => isTagged(root, v))
  const pending = last === -1 ? sections : sections.slice(0, last)
  if (pending.length > 1) {
    throw new Error(`the changelog has more than one release without a tag: ${pending.join(", ")}`)
  }
  return { released: last === -1 ? undefined : sections[last], pending: pending[0] }
}

const version = (root: string, effectOption: string | undefined, prereleaseOption: string | undefined) => {
  if (effectOption !== undefined && !/^\d+\.\d+$/.test(effectOption)) {
    throw new Error(`--effect takes major.minor, like 4.1 (got ${effectOption})`)
  }
  if (prereleaseOption !== undefined && prereleaseOption !== "alpha" && prereleaseOption !== "none") {
    throw new Error(`--prerelease is alpha or none (got ${prereleaseOption})`)
  }
  const list = packages(root)
  const current = agreed(list)
  const { pending, released: last } = releases(root, readChangelog(root))
  const workspace = JSON.parse(fs.readFileSync(path.join(root, "packages/effect/package.json"), "utf8")).version
    .split(".").slice(0, 2).join(".")
  if (effectOption !== undefined) {
    const [a, b] = [effectOption, workspace].map((v) => v.split(".").map(Number))
    if (a![0]! < b![0]! || (a![0] === b![0] && a![1]! < b![1]!)) {
      throw new Error(`--effect ${effectOption} is older than the workspace's effect ${workspace}`)
    }
  }
  const effect = effectOption ?? workspace
  // by default, a release stays on the channel of the last one
  const prerelease = prereleaseOption as "alpha" | "none" | undefined ??
    (last === undefined || parse(last).alpha !== undefined ? "alpha" : "none")
  const next = nextVersion(last, effect, prerelease)
  if (pending !== undefined && pending !== next) {
    throw new Error(
      `${pending} is in the changelog but not tagged, and the next version is ${next}: ` +
        `finish releasing ${pending}, or remove its section and put its notes back`
    )
  }
  // Effect is a peer on the same minor (spec §7.6, ADR-0055 amendment 1)
  const { major, minor } = parse(next)
  let changed = false
  for (const p of list) {
    const text = fs.readFileSync(p.file, "utf8")
    const updated = text
      .replace(/("version":\s*)"[^"]*"/, `$1"${next}"`)
      .replace(
        /("peerDependencies":\s*\{[^}]*\})/,
        (peers) => peers.replace(/("(?:effect|@effect\/[\w-]+)":\s*)"~[^"]*"/g, `$1"~${major}.${minor}.0"`)
      )
    if (updated !== text) {
      fs.writeFileSync(p.file, updated)
      changed = true
    }
  }
  // the Zed extension carries the version in its manifest, its crate and the crate's lock entry;
  // the grammar in its tree-sitter.json (ADR-0058). Each pattern matches only the package's own field.
  for (const p of list) {
    const dir = path.dirname(p.file)
    const read = (file: string) =>
      fs.existsSync(path.join(dir, file)) ? fs.readFileSync(path.join(dir, file), "utf8") : ""
    const crate = /\[package\][^[]*?^name = "([^"]*)"$/m.exec(read("Cargo.toml"))?.[1]
    const edits: ReadonlyArray<readonly [string, RegExp]> = [
      ["extension.toml", /^(version = )"[^"]*"$/m],
      ["Cargo.toml", /(\[package\][^[]*?^version = )"[^"]*"$/m],
      ...(crate === undefined ? [] : [
        [
          "Cargo.lock",
          new RegExp(
            `(^\\[\\[package\\]\\]\\nname = "${crate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\nversion = )"[^"]*"$`,
            "m"
          )
        ] as const
      ]),
      ["tree-sitter.json", /("metadata":\s*\{[^}]*?"version":\s*)"[^"]*"/]
    ]
    for (const [file, pattern] of edits) {
      const text = read(file)
      if (text === "") continue
      const updated = text.replace(pattern, `$1"${next}"`)
      if (updated !== text) {
        fs.writeFileSync(path.join(dir, file), updated)
        changed = true
      }
    }
  }
  if (!changed) return `already ${next}`
  return `${current} -> ${next} (${list.map((p) => p.name).join(", ")})`
}

const bumps = ["major", "minor", "patch"] as const
type Bump = typeof bumps[number]

interface Note {
  readonly file: string
  readonly packages: ReadonlyMap<string, Bump>
  readonly summary: string
}

/**
 * A changeset's packages and summary. Lines it can't read (comments, `none` bumps, YAML it doesn't
 * know) are listed in `unread`: they only matter in EffectScript's own notes (review I6).
 */
const readNote = (file: string): Note & { readonly unread: ReadonlyArray<string> } => {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/.exec(text)
  const lines = match === null ? [] : match[1]!.split("\n").filter((line) => line.trim() !== "")
  const packages = new Map<string, Bump>()
  const unread: Array<string> = []
  for (const line of lines) {
    const entry = /^\s*["']?([^"':#]+)["']?\s*:\s*(major|minor|patch)\s*$/.exec(line)
    if (entry !== null) packages.set(entry[1]!, entry[2] as Bump)
    else if (!/^\s*#/.test(line)) unread.push(line)
  }
  return { file, packages, summary: match === null ? "" : match[2]!.trim(), unread }
}

const isEffectScript = (name: string, family: ReadonlySet<string>) =>
  family.has(name) || name === "effectscript" || name === "effectscript-vscode" || name.startsWith("@effectscript/")

const item = (summary: string) =>
  // a summary that is already a list stays one, and a paragraph after it stays in its last item
  /^[-*] /.test(summary)
    ? `${summary.split("\n").map((line) => line === "" || /^([-*] |\s)/.test(line) ? line : `  ${line}`).join("\n")}\n`
    : `- ${summary.split("\n").map((line, i) => i === 0 || line === "" ? line : `  ${line}`).join("\n")}\n`

const changelog = (root: string) => {
  const list = packages(root)
  const current = agreed(list)
  const existing = readChangelog(root)
  if (existing !== undefined && new RegExp(`^## ${current.replace(/\./g, "\\.")}\\s*$`, "m").test(existing)) {
    throw new Error(
      isTagged(root, current)
        ? `${current} is already in the changelog: run release.ts version first`
        : `${current} is already in the changelog, not yet tagged: finish releasing it first`
    )
  }
  const family = new Set(list.map((p) => p.name))
  const dir = path.join(root, ".changeset")
  const ours: Array<Note> = []
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".md") || name === "README.md") continue
    const note = readNote(path.join(dir, name))
    const names = [...note.packages.keys()]
    const mine = names.filter((n) => isEffectScript(n, family))
    if (mine.length > 0 && mine.length < names.length) {
      throw new Error(`${name} names both EffectScript and upstream packages: split it in two`)
    }
    if (mine.length > 0 && note.summary === "") throw new Error(`${name} has no summary`)
    if (mine.length > 0 && note.unread.length > 0) {
      throw new Error(`${name}: can't read "${note.unread[0]}" (use "package": major, minor or patch)`)
    }
    if (mine.length > 0) ours.push(note)
  }
  if (ours.length === 0) throw new Error("there are no EffectScript notes in .changeset")
  const groups = bumps.flatMap((bump) => {
    const items = ours.filter((note) => bumps.find((b) => [...note.packages.values()].includes(b)) === bump)
    return items.length === 0
      ? []
      : [`### ${bump[0]!.toUpperCase()}${bump.slice(1)} changes\n\n${items.map((n) => item(n.summary)).join("\n")}`]
  })
  const section = `## ${current}\n\n${groups.join("\n")}`
  const title = "# EffectScript\n\n"
  const updated = existing === undefined
    ? title + section
    : existing.startsWith("# ")
    ? (() => {
      const end = existing.indexOf("\n## ")
      return end === -1
        ? `${existing.trimEnd()}\n\n${section}`
        : `${existing.slice(0, end + 1)}${section}\n${existing.slice(end + 1)}`
    })()
    : `${section}\n${existing}`
  fs.writeFileSync(changelogFile(root), updated)
  for (const note of ours) fs.rmSync(note.file)
  return `CHANGELOG.md: ${current} (${ours.map((n) => path.basename(n.file)).join(", ")})`
}

/**
 * What is wrong with a package's tarball, given its manifest and the tarball's paths
 * (`package/...`): each missing required file, then each file that shouldn't ship.
 */
export const tarballProblems = (
  manifest: { readonly bin?: Readonly<Record<string, string>> },
  files: ReadonlyArray<string>
): Array<string> => {
  const inside = files.map((f) => f.replace(/^package\//, ""))
  const required = [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.d.ts",
    ...Object.values(manifest.bin ?? {}).map((b) => path.posix.normalize(b))
  ]
  return [
    ...required.filter((f) => !inside.includes(f)).map((f) => `missing ${f}`),
    ...inside
      .filter((f) => /(^|\/)(test|typetest|fixtures|node_modules|dist-bin|scripts)\/|\.tsbuildinfo$/.test(f))
      .map((f) => `unexpected ${f}`)
  ]
}

/**
 * What is wrong with a packed manifest's dependencies (spec §7.6): Effect packages are peers on the
 * same major.minor (`~x.y.0`), and EffectScript packages are pinned to this release's version.
 */
export const manifestProblems = (manifest: {
  readonly name?: string
  readonly version: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}): Array<string> => {
  const { major, minor } = parse(manifest.version)
  const effectRange = `~${major}.${minor}.0`
  const isEffect = (name: string) => name === "effect" || name.startsWith("@effect/")
  const isOurs = (name: string) => name === "effectscript" || name.startsWith("@effectscript/")
  const pinned = ([name, range]: readonly [string, string]) =>
    isOurs(name) && range !== manifest.version ? [`${name} must be ${manifest.version} (got ${range})`] : []
  return [
    ...Object.entries(manifest.dependencies ?? {}).flatMap((entry) =>
      isEffect(entry[0]) ? [`${entry[0]} must be a peer dependency, not a dependency`] : pinned(entry)
    ),
    ...Object.entries(manifest.peerDependencies ?? {}).flatMap((entry) =>
      isEffect(entry[0]) && entry[1] !== effectRange
        ? [`${entry[0]} must be ${effectRange} (got ${entry[1]})`]
        : pinned(entry)
    )
  ]
}

const run = (command: string, args: ReadonlyArray<string>, cwd: string): string => {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28 })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.error?.message ?? ""}${result.stdout}${result.stderr}`
    )
  }
  return result.stdout
}

const pack = (root: string, out: string) => {
  const dirs = ["core", "language"].map((dir) => path.join(root, "packages/effectscript", dir))
  // from clean, so nothing stale from a removed source ships
  for (const dir of dirs) {
    fs.rmSync(path.join(dir, "dist"), { recursive: true, force: true })
    fs.rmSync(path.join(dir, "tsconfig.tsbuildinfo"), { force: true })
  }
  run("pnpm", ["exec", "tsc", "-b", path.join(dirs[1]!, "tsconfig.json")], root)
  fs.mkdirSync(out, { recursive: true })
  return dirs.map((dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
    const before = new Set(fs.readdirSync(out))
    run("pnpm", ["pack", "--pack-destination", out], dir)
    const tarball = fs.readdirSync(out).find((f) => f.endsWith(".tgz") && !before.has(f)) ??
      `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`
    const full = path.join(out, tarball)
    const packed = JSON.parse(run("tar", ["-xzOf", full, "package/package.json"], root))
    const problems = [
      ...tarballProblems(manifest, run("tar", ["-tzf", full], root).trim().split("\n")),
      ...manifestProblems(packed)
    ]
    if (problems.length > 0) throw new Error(`${tarball}: ${problems.join(", ")}`)
    return full
  }).join("\n")
}

/**
 * Pins the Zed extension's grammar to a commit of the published grammar repository. Zed fetches
 * `rev` as is, so only a full SHA names one fixed commit (RELEASING.md step 7).
 */
const zed = (root: string, rev: string | undefined) => {
  if (rev === undefined || !/^[0-9a-f]{40}$/.test(rev)) {
    throw new Error(`--rev takes the grammar repository's full commit SHA, 40 hex characters (got ${rev ?? "nothing"})`)
  }
  const file = path.join(root, "packages/effectscript/zed/extension.toml")
  const text = fs.readFileSync(file, "utf8")
  const pattern = /(\[grammars\.effectscript\][^[]*?^rev = )"[^"]*"$/m
  if (!pattern.test(text)) throw new Error(`${file} has no [grammars.effectscript] rev`)
  const updated = text.replace(pattern, `$1"${rev}"`)
  if (updated === text) return `already ${rev}`
  fs.writeFileSync(file, updated)
  return `grammar rev -> ${rev}`
}

const option = (argv: ReadonlyArray<string>, name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1] ?? ""
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  const root = path.resolve(option(argv, "--root") ?? path.join(import.meta.dirname, "../../../.."))
  try {
    const output = argv[0] === "version"
      ? version(root, option(argv, "--effect"), option(argv, "--prerelease"))
      : argv[0] === "changelog"
      ? changelog(root)
      : argv[0] === "zed"
      ? zed(root, option(argv, "--rev"))
      : argv[0] === "pack"
      ? pack(root, path.resolve(option(argv, "--out") ?? path.join(root, "packages/effectscript/dist-pack")))
      : (() => {
        throw new Error(
          "usage: release.ts version [--effect x.y] [--prerelease alpha|none] | changelog | zed --rev <sha> | pack [--out dir]"
        )
      })()
    process.stdout.write(`${output}\n`)
  } catch (error) {
    process.stderr.write(`release.ts: ${(error as Error).message}\n`)
    process.exitCode = 1
  }
}
