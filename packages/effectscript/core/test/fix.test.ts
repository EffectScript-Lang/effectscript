import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const efx = path.join(import.meta.dirname, "../bin/efx.js")
const dirs: Array<string> = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

const project = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-fix-"))
  dirs.push(dir)
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content)
  }
  return dir
}
const fix = (dir: string, ...args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, [efx, "fix", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, EFFECTSCRIPT_DEV: "1" }
  })
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8")

const longWay = `import { Effect } from "effect"

// greets, the long way
export const greet = Effect.gen(function*() {
  const name = yield* Effect.succeed("ada") // a name
  return \`hi \${name}\`
})

/** Already EffectScript. */
export effect twice(n: number) {
  return n * 2
}
`

describe("efx fix (Plan 18 Task 3, ADR-0056)", { timeout: 60_000 }, () => {
  it("rewrites Effect TypeScript in .efx files as EffectScript, keeping comments and the rest", () => {
    const dir = project({ "src/greet.efx": longWay })
    const result = fix(dir)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("src/greet.efx: fixed")
    expect(read(dir, "src/greet.efx")).toBe(`// greets, the long way
export const greet = effect {
  const name = await succeed("ada") // a name
  return \`hi \${name}\`
}

/** Already EffectScript. */
export effect twice(n: number) {
  return n * 2
}
`)
  })

  it("leaves canonical files, .ts files and node_modules alone", () => {
    const canonical = "export effect twice(n: number) {\n  return n * 2\n}\n"
    const dir = project({
      "a.efx": canonical,
      "b.ts": longWay.replace(/\/\*\* Already[\s\S]*$/, ""),
      "node_modules/dep/c.efx": longWay
    })
    const result = fix(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("nothing to fix")
    expect(read(dir, "a.efx")).toBe(canonical)
    expect(read(dir, "node_modules/dep/c.efx")).toBe(longWay)
  })

  it("skips and reports a file that doesn't compile, and exits 1", () => {
    const broken = "effect f() {\n  const x = \n}\n"
    const dir = project({ "broken.efx": broken, "ok.efx": longWay })
    const result = fix(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/broken\.efx: doesn't compile \(EFX\d+/)
    expect(read(dir, "broken.efx")).toBe(broken)
    expect(read(dir, "ok.efx")).not.toBe(longWay)
  })

  it("--check reports what would change, writes nothing, and exits 1", () => {
    const dir = project({ "src/greet.efx": longWay })
    const result = fix(dir, "--check")
    expect(result.status).toBe(1)
    expect(result.stdout).toContain("src/greet.efx: would be fixed")
    expect(read(dir, "src/greet.efx")).toBe(longWay)
    const clean = project({ "a.efx": "export effect one() {\n  return 1\n}\n" })
    expect(fix(clean, "--check").status).toBe(0)
  })

  it("takes files and directories", () => {
    const dir = project({ "src/a.efx": longWay, "lib/b.efx": longWay })
    expect(fix(dir, "src").status).toBe(0)
    expect(read(dir, "src/a.efx")).not.toBe(longWay)
    expect(read(dir, "lib/b.efx")).toBe(longWay)
    expect(fix(dir, "lib/b.efx").stdout).toContain("lib/b.efx: fixed")
  })

  it("fixes files in strict mode, where EFX8101 and the other strict rules are errors (review I2)", () => {
    const strict = `// @efx strict\n${longWay}`
    const dir = project({ "a.efx": strict, "b.efx": "// @efx strict\nexport const id = (x: any) => x\n" })
    const result = fix(dir)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(read(dir, "a.efx")).toContain("export const greet = effect {")
    expect(read(dir, "b.efx")).toBe("// @efx strict\nexport const id = (x: any) => x\n")
  })

  it("refuses a path that doesn't exist", () => {
    const dir = project({ "src/a.efx": longWay })
    const result = fix(dir, "scr")
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/scr: no such file or directory/)
  })

  it("doesn't follow directory links into loops (Plan 20 Task 3)", () => {
    const dir = project({ "src/a.efx": longWay })
    fs.symlinkSync("..", path.join(dir, "src/loop"))
    const result = fix(dir)
    expect(result.status).toBe(0)
    expect(result.stdout.match(/a\.efx: fixed/g)).toHaveLength(1)
  })

  it("skips a link to itself (Plan 21)", () => {
    const dir = project({ "src/a.efx": longWay })
    fs.symlinkSync("self", path.join(dir, "src/self"))
    const result = fix(dir)
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("src/a.efx: fixed")
  })
})
