import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const hasBun = spawnSync("bun", ["--version"]).status === 0
const preload = path.join(import.meta.dirname, "../src/bun-preload.ts")
// inside this package, so `effect` and `@effect/platform-bun` resolve
const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../.efx-bun-"))
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
}
const bun = (args: ReadonlyArray<string>) => spawnSync("bun", args, { cwd: dir, encoding: "utf8" })

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe.skipIf(!hasBun)("effectscript/bun (Plan 9 Task 1)", () => {
  write("src/greet.efx", "export effect greet(name: string): string {\n  return `hello ${name}`\n}\n")
  write(
    "src/main.efx",
    "import { greet } from \"./greet.efx\"\n\nmain {\n  globalThis.console.log(await greet(\"bun\"))\n}\n"
  )
  write(
    "src/greet.test.ts",
    "import { expect, test } from \"bun:test\"\nimport { Effect } from \"effect\"\nimport { greet } from \"./greet.efx\"\n\ntest(\"greets\", () => {\n  expect(Effect.runSync(greet(\"test\"))).toBe(\"hello test\")\n})\n"
  )
  write("src/broken.efx", "effect broken() {\n  return await\n}\n")

  it("runs a main block that imports another .efx module (ADR-0035)", () => {
    const result = bun(["--preload", preload, "./src/main.efx"])
    expect(result.stderr).toBe("")
    expect(result.stdout.trim()).toBe("hello bun")
  })

  it("runs bun test against .efx modules", () => {
    const result = bun(["test", "--preload", preload, "src/greet.test.ts"])
    expect(result.status).toBe(0)
  })

  it("reports a compile error with its code and position", () => {
    const result = bun(["--preload", preload, "./src/broken.efx"])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/broken\.efx:\d+:\d+ - error EFX\d+/)
  })
})
