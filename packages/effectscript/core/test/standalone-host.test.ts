import { doctor } from "effectscript/cli/doctor"
import { cacheDir, standalone, unpack } from "effectscript/cli/host"
import { run } from "effectscript/cli/run"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const dirs: Array<string> = []
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-host-"))
  dirs.push(dir)
  return dir
}
const host = { version: "9.9.9-test", preload: "/* preload */\n" }
const asStandalone = () => {
  ;(globalThis as { __effectscriptStandalone?: unknown }).__effectscriptStandalone = host
}

afterEach(() => {
  delete (globalThis as { __effectscriptStandalone?: unknown }).__effectscriptStandalone
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("the standalone host (Plan 10 Task 2, ADR-0037)", () => {
  it("is absent for the npm CLI and present in the binary", () => {
    expect(standalone()).toBeUndefined()
    asStandalone()
    expect(standalone()).toEqual(host)
  })

  it("keeps its cache in the platform's user cache directory", () => {
    expect(cacheDir({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/u")).toBe(path.join("/xdg", "effectscript"))
    expect(cacheDir({}, "linux", "/home/u")).toBe(path.join("/home/u", ".cache", "effectscript"))
    expect(cacheDir({}, "darwin", "/Users/u")).toBe(path.join("/Users/u", "Library", "Caches", "effectscript"))
    expect(cacheDir({ XDG_CACHE_HOME: "/xdg" }, "darwin", "/Users/u")).toBe(path.join("/xdg", "effectscript"))
    expect(cacheDir({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32", "C:\\Users\\u")).toBe(
      path.win32.join("C:\\Users\\u\\AppData\\Local", "effectscript")
    )
    // a relative XDG_CACHE_HOME is invalid per the spec and ignored
    expect(cacheDir({ XDG_CACHE_HOME: "rel" }, "linux", "/home/u")).toBe(path.join("/home/u", ".cache", "effectscript"))
  })

  it("unpacks a file once, named by its content", () => {
    const dir = path.join(temp(), "nested")
    const first = unpack(dir, "bun-preload", "one")
    expect(path.basename(first)).toMatch(/^bun-preload-[0-9a-f]{16}\.js$/)
    expect(fs.readFileSync(first, "utf8")).toBe("one")
    const mtime = fs.statSync(first).mtimeMs
    expect(unpack(dir, "bun-preload", "one")).toBe(first)
    expect(fs.statSync(first).mtimeMs).toBe(mtime)
    const second = unpack(dir, "bun-preload", "two")
    expect(second).not.toBe(first)
    expect(fs.readFileSync(second, "utf8")).toBe("two")
    expect(fs.readdirSync(dir).filter((f) => !f.startsWith("bun-preload-"))).toEqual([])
  })

  it("rewrites an unpacked file whose content was changed", () => {
    const dir = temp()
    const file = unpack(dir, "bun-preload", "good")
    fs.writeFileSync(file, "tampered")
    expect(unpack(dir, "bun-preload", "good")).toBe(file)
    expect(fs.readFileSync(file, "utf8")).toBe("good")
  })

  it("efx run --runtime node in the binary asks for effectscript in the project", () => {
    asStandalone()
    const dir = temp()
    fs.writeFileSync(path.join(dir, "app.efx"), "console.log(1)\n")
    const stderr: Array<string> = []
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })
    expect(run([path.join(dir, "app.efx")], "node")).toBe(1)
    expect(stderr.join("")).toMatch(/npm i -D effectscript/)
  })

  it("efx doctor in the binary doesn't require Node", () => {
    asStandalone()
    const lines: Array<string> = []
    doctor(temp(), (line) => lines.push(line))
    expect(lines.join("\n")).toMatch(/^ok {6}efx 9\.9\.9-test \(standalone, Bun/m)
    expect(lines.join("\n")).not.toMatch(/Node 2/)
  })
})
