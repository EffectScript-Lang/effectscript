import { efx } from "effectscript/vite"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { build } from "vite"
import { afterAll, describe, expect, it } from "vitest"

// inside this package, so `effect` and `effectscript/vite` resolve
const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../.efx-vite-"))
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
}
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

write("src/greet.efx", "export effect greet(name: string): string {\n  return `hello ${name}`\n}\n")
write(
  "src/app.efx",
  "import { greet } from \"./greet\"\n\nexport const program = effect {\n  return await greet(\"vite\")\n}\n"
)
write("src/broken.efx", "effect broken() {\n  return await\n}\n")

const bundle = async (entry: string, ssr: boolean) => {
  const output = await build({
    root: dir,
    configFile: false,
    logLevel: "silent",
    plugins: [efx()],
    build: {
      write: false,
      ...(ssr ? { ssr: entry } : { lib: { entry, formats: ["es"], fileName: "app" } }),
      rollupOptions: { external: [/^effect/] }
    }
  })
  const result = Array.isArray(output) ? output[0]! : output
  return (result as { output: Array<{ code?: string }> }).output.map((o) => o.code ?? "").join("\n")
}

describe("effectscript/vite (Plan 9 Task 3)", () => {
  it("builds .efx modules, with extensionless imports, for the client and for SSR", async () => {
    for (const ssr of [false, true]) {
      const code = await bundle("src/app.efx", ssr)
      expect(code).toContain("hello")
      expect(code).not.toMatch(/: string/)
    }
  })

  it("fails with the EFX code and position", async () => {
    await expect(bundle("src/broken.efx", false)).rejects.toThrow(/broken\.efx:\d+:\d+ - error EFX\d+/)
  })

  it("leaves asset queries alone and compiles versioned ids", async () => {
    const [compile] = efx()
    const transform = compile!.transform as (code: string, id: string) => Promise<unknown>
    const source = fs.readFileSync(path.join(dir, "src/greet.efx"), "utf8")
    expect(await transform.call({}, source, path.join(dir, "src/greet.efx?raw"))).toBeUndefined()
    expect(await transform.call({}, source, path.join(dir, "src/greet.efx?v=123"))).toMatchObject({
      code: expect.stringContaining("Effect.fn")
    })
  })

  it("runs .efx tests on Vitest and maps stack traces to .efx lines", () => {
    write(
      "vitest.config.ts",
      "import { defineConfig } from \"vitest/config\"\nimport { efx } from \"effectscript/vite\"\nexport default defineConfig({ plugins: [efx()], test: { include: [\"**/*.test.efx\"] } })\n"
    )
    write(
      "test/greet.test.efx",
      "import { greet } from \"../src/greet\"\n\ndescribe \"greet\" {\n  test \"says hello\" {\n    expect(await greet(\"t\")).toBe(\"hello t\")\n  }\n\n  test \"fails on line 9\" {\n    throw new Error(\"boom\")\n  }\n}\n"
    )
    const vitest = path.join(import.meta.dirname, "../../../../node_modules/.bin/vitest")
    const result = spawnSync(vitest, ["run", "--root", dir], { cwd: dir, encoding: "utf8" })
    const output = `${result.stdout}${result.stderr}`
    expect(output).toContain("1 passed")
    expect(output).toContain("1 failed")
    expect(output).toMatch(/greet\.test\.efx:9:/)
  }, 120_000)
})
