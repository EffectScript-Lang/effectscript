import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const script = path.join(import.meta.dirname, "../distribution/install.sh")
const hasShellcheck = spawnSync("shellcheck", ["--version"]).status === 0
const dirs: Array<string> = []
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-install-"))
  dirs.push(dir)
  return dir
}

/** A release folder (`latest/download/…` and `download/effectscript@<v>/…`) with fake binaries. */
const release = (targets: ReadonlyArray<string>, version = "9.9.9", corrupt = false) => {
  const base = temp()
  for (const dir of ["latest/download", `download/effectscript@${version}`]) {
    const out = path.join(base, dir)
    fs.mkdirSync(out, { recursive: true })
    const sums: Array<string> = []
    for (const target of targets) {
      const stage = temp()
      fs.writeFileSync(path.join(stage, "efx"), `#!/bin/sh\necho "efx v${version} ${target} ${dir}"\n`, { mode: 0o755 })
      const archive = `efx-${target}.tar.gz`
      spawnSync("tar", ["-czf", path.join(out, archive), "efx"], { cwd: stage })
      const hash = createHash("sha256").update(fs.readFileSync(path.join(out, archive))).digest("hex")
      sums.push(`${corrupt ? hash.replace(/^./, (c) => (c === "0" ? "1" : "0")) : hash}  ${archive}\n`)
    }
    fs.writeFileSync(path.join(out, "SHASUMS256.txt"), sums.join(""))
  }
  return `file://${base}`
}

/** Runs install.sh as if on `system`/`machine`, with fake `uname` and `sysctl` first on PATH. */
const install = (
  base: string,
  system: string,
  machine: string,
  options: {
    readonly env?: Record<string, string>
    readonly translated?: boolean
    readonly onPath?: boolean
    readonly libc?: string
  } = {}
) => {
  const fake = temp()
  // `ldd --version` names the system libc (glibc's prints to stdout, musl's to stderr)
  fs.writeFileSync(path.join(fake, "ldd"), `#!/bin/sh\necho "${options.libc ?? "ldd (GNU libc) 2.36"}" >&2\n`, {
    mode: 0o755
  })
  fs.writeFileSync(
    path.join(fake, "uname"),
    `#!/bin/sh\ncase "$1" in -s) echo ${system} ;; -m) echo ${machine} ;; *) echo ${system} ;; esac\n`,
    { mode: 0o755 }
  )
  fs.writeFileSync(path.join(fake, "sysctl"), `#!/bin/sh\necho ${options.translated ? 1 : 0}\n`, { mode: 0o755 })
  const home = temp()
  const dir = path.join(home, ".effectscript")
  const result = spawnSync("sh", [script], {
    encoding: "utf8",
    env: {
      HOME: home,
      PATH: `${fake}:${options.onPath ? `${dir}/bin:` : ""}/usr/bin:/bin:/usr/sbin:/sbin`,
      EFX_DOWNLOAD_BASE: base,
      ...options.env
    }
  })
  const binary = path.join(dir, "bin", "efx")
  return { ...result, binary, installed: fs.existsSync(binary) }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("install.sh (Plan 10 Task 4, ADR-0038)", () => {
  it("installs the latest release for this platform and says how to add it to PATH", () => {
    const result = install(release(["darwin-arm64", "linux-x64"]), "Darwin", "arm64")
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(spawnSync(result.binary, { encoding: "utf8" }).stdout).toBe("efx v9.9.9 darwin-arm64 latest/download\n")
    expect(result.stdout).toContain(`export PATH="${path.dirname(path.dirname(result.binary))}/bin:$PATH"`)
  })

  it("maps Linux machine names and skips the PATH hint when efx is already on PATH", () => {
    const result = install(release(["linux-x64", "linux-arm64"]), "Linux", "aarch64", { onPath: true })
    expect(result.status).toBe(0)
    expect(spawnSync(result.binary, { encoding: "utf8" }).stdout).toContain("linux-arm64")
    expect(result.stdout).not.toContain("export PATH")
  })

  it("installs the native build from a shell running under Rosetta", () => {
    const result = install(release(["darwin-arm64", "darwin-x64"]), "Darwin", "x86_64", { translated: true })
    expect(result.status).toBe(0)
    expect(spawnSync(result.binary, { encoding: "utf8" }).stdout).toContain("darwin-arm64")
  })

  it("installs a pinned version", () => {
    const result = install(release(["darwin-arm64"], "1.2.3"), "Darwin", "arm64", { env: { EFX_VERSION: "1.2.3" } })
    expect(result.status).toBe(0)
    expect(spawnSync(result.binary, { encoding: "utf8" }).stdout).toBe(
      "efx v1.2.3 darwin-arm64 download/effectscript@1.2.3\n"
    )
  })

  it("installs nothing when the checksum doesn't match", () => {
    const result = install(release(["darwin-arm64"], "9.9.9", true), "Darwin", "arm64")
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/checksum/)
    expect(result.installed).toBe(false)
  })

  it("refuses an unsupported OS or architecture", () => {
    const base = release(["linux-x64"])
    const os = install(base, "FreeBSD", "amd64")
    expect(os.status).toBe(1)
    expect(os.stderr).toMatch(/FreeBSD.*npm i -D effectscript/)
    const arch = install(base, "Linux", "riscv64")
    expect(arch.status).toBe(1)
    expect(arch.stderr).toMatch(/riscv64/)
    expect(os.installed || arch.installed).toBe(false)
  })

  it("explains a release without this platform's build", () => {
    const result = install(release(["linux-x64"]), "Linux", "aarch64")
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/efx-linux-arm64\.tar\.gz/)
    expect(result.installed).toBe(false)
  })
  it("detects musl from the system libc, not from an installed musl loader (review I4)", () => {
    const base = release(["linux-arm64", "linux-arm64-musl"])
    const musl = install(base, "Linux", "aarch64", { libc: "musl libc (aarch64)" })
    // this host has no musl C++ runtime, so the musl path stops with the apk line
    expect(musl.status).toBe(1)
    expect(musl.stderr).toMatch(/apk add libstdc\+\+ libgcc/)
    const glibc = install(base, "Linux", "aarch64", { libc: "ldd (Debian GLIBC 2.36-9) 2.36" })
    expect(glibc.status).toBe(0)
    expect(spawnSync(glibc.binary, { encoding: "utf8" }).stdout).toContain("linux-arm64 ")
  })

  it("installs when the temp directory is mounted noexec (review I5)", () => {
    const tmp = temp()
    // a fake efx that refuses to run from the temp directory, as noexec would
    const base = release(["darwin-arm64"])
    const archive = new URL(`${base}/latest/download/efx-darwin-arm64.tar.gz`).pathname
    const stage = temp()
    fs.writeFileSync(
      path.join(stage, "efx"),
      `#!/bin/sh\ncase "$0" in ${tmp}/*) echo "Permission denied" >&2; exit 126 ;; esac\necho "efx v9.9.9"\n`,
      { mode: 0o755 }
    )
    spawnSync("tar", ["-czf", archive, "efx"], { cwd: stage })
    const hash = createHash("sha256").update(fs.readFileSync(archive)).digest("hex")
    fs.writeFileSync(path.join(path.dirname(archive), "SHASUMS256.txt"), `${hash}  efx-darwin-arm64.tar.gz\n`)
    const result = install(base, "Darwin", "arm64", { env: { TMPDIR: tmp } })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.installed).toBe(true)
  })

  it.skipIf(!hasShellcheck)("is POSIX sh that passes shellcheck", () => {
    const result = spawnSync("shellcheck", ["-s", "sh", script], { encoding: "utf8" })
    expect(result.stdout).toBe("")
    expect(result.status).toBe(0)
  })
})
