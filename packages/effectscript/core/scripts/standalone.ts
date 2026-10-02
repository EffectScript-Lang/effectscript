/**
 * The standalone `efx` binary (ADR-0037, ADR-0038).
 *
 * - `node scripts/standalone.ts build [--target <t>…] [--outdir dist-bin]` compiles
 *   `efx-<target>[.exe]` with `bun build --compile` (default target: this machine).
 * - `node scripts/standalone.ts package [--outdir dist-bin]` packs each binary as
 *   `efx-<target>.tar.gz` (`.zip` for Windows), holding `efx`/`efx.exe`, and writes
 *   `SHASUMS256.txt`.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

const root = path.join(import.meta.dirname, "..")

/** The release targets (spec §7.5); `-musl` builds run on Alpine and other musl Linuxes. */
export const targets = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "linux-x64-musl",
  "linux-arm64-musl",
  "windows-x64"
] as const

const hostTarget = (): string => `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`

const option = (args: ReadonlyArray<string>, name: string): Array<string> =>
  args.flatMap((arg, i) => (arg === name && args[i + 1] !== undefined ? [args[i + 1]!] : []))

const exec = (command: string, args: ReadonlyArray<string>, cwd: string): void => {
  const result = spawnSync(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"] })
  if (result.error !== undefined) throw new Error(`${command}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`)
}

const build = (args: ReadonlyArray<string>): void => {
  const outdir = path.resolve(option(args, "--outdir")[0] ?? path.join(root, "dist-bin"))
  const wanted = option(args, "--target")
  const selected = wanted.length === 0 ? [hostTarget()] : wanted.includes("all") ? [...targets] : wanted
  for (const target of selected) {
    if (!(targets as ReadonlyArray<string>).includes(target)) throw new Error(`unknown target ${target}`)
  }
  const version: string = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "efx-build-"))
  try {
    // the preload the binary unpacks for `efx run`: the plugin, with `main`'s runtime chosen by `efx run`
    fs.writeFileSync(
      path.join(work, "preload.ts"),
      `import { efx } from ${JSON.stringify(path.join(root, "src/bun.ts"))}\n` +
        "declare const Bun: { readonly plugin: (plugin: unknown) => void }\n" +
        "const runtime = process.env.EFFECTSCRIPT_MAIN_RUNTIME === \"node\" ? \"node\" : \"bun\"\n" +
        // the program and what it spawns never see the re-run settings (review I3)
        "delete process.env.BUN_BE_BUN\n" +
        "delete process.env.EFFECTSCRIPT_MAIN_RUNTIME\n" +
        "Bun.plugin(efx({ runtime }))\n"
    )
    exec("bun", ["build", "preload.ts", "--target", "bun", "--outfile", "preload.js"], work)
    const preload = fs.readFileSync(path.join(work, "preload.js"), "utf8")
    fs.writeFileSync(
      path.join(work, "entry.ts"),
      `;(globalThis as any).__effectscriptStandalone = ${JSON.stringify({ version, preload })}\n` +
        `await import(${JSON.stringify(path.join(root, "src/cli/main.ts"))})\n`
    )
    fs.mkdirSync(outdir, { recursive: true })
    for (const target of selected) {
      const outfile = path.join(outdir, `efx-${target}${target.startsWith("windows") ? ".exe" : ""}`)
      exec("bun", [
        "build",
        "entry.ts",
        "--compile",
        "--no-compile-autoload-bunfig",
        "--no-compile-autoload-dotenv",
        "--target",
        `bun-${target}`,
        "--outfile",
        outfile
      ], work)
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const sha256 = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex")

const pack = (args: ReadonlyArray<string>): void => {
  const outdir = path.resolve(option(args, "--outdir")[0] ?? path.join(root, "dist-bin"))
  const sums: Array<string> = []
  const binaries = fs.readdirSync(outdir).filter((f) => /^efx-[a-z0-9-]+(\.exe)?$/.test(f)).sort()
  if (binaries.length === 0) throw new Error(`no efx-<target> binaries in ${outdir}: run build first`)
  for (const binary of binaries) {
    const windows = binary.endsWith(".exe")
    const target = binary.replace(/^efx-/, "").replace(/\.exe$/, "")
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "efx-pack-"))
    try {
      const name = windows ? "efx.exe" : "efx"
      fs.copyFileSync(path.join(outdir, binary), path.join(stage, name))
      fs.chmodSync(path.join(stage, name), 0o755)
      const archive = `efx-${target}.${windows ? "zip" : "tar.gz"}`
      fs.rmSync(path.join(outdir, archive), { force: true })
      if (windows) exec("zip", ["-q", "-X", path.join(outdir, archive), name], stage)
      else exec("tar", ["-czf", path.join(outdir, archive), name], stage)
      sums.push(`${sha256(path.join(outdir, archive))}  ${archive}\n`)
    } finally {
      fs.rmSync(stage, { recursive: true, force: true })
    }
  }
  fs.writeFileSync(path.join(outdir, "SHASUMS256.txt"), sums.join(""))
}

const [command, ...rest] = process.argv.slice(2)
try {
  if (command === "build") build(rest)
  else if (command === "package") pack(rest)
  else throw new Error("usage: node scripts/standalone.ts build|package [--target <t>…] [--outdir dir]")
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exitCode = 1
}
