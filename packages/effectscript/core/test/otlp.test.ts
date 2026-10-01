import { toTypeScript } from "effectscript/compiler"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

process.env.EFFECTSCRIPT_DEV = "1"

const packages = path.resolve(import.meta.dirname, "../../..")
const register = path.resolve(import.meta.dirname, "../src/register.ts")

describe("OTLP telemetry for main (§4.16, ADR-0029)", () => {
  it("provides Otlp.layerFromConfig only when enabled", () => {
    const source = "main {\n  await log(\"x\")\n}\n"
    expect(toTypeScript(source).code).not.toContain("Otlp")
    const enabled = toTypeScript(source, { observability: "otlp" }).code
    expect(enabled).toContain(
      "Effect.provide(Otlp.layerFromConfig().pipe(Layer.provide([FetchHttpClient.layer, OtlpSerialization.layerJson])))"
    )
  })

  it("a main program runs with telemetry enabled and no OTEL_* configuration", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-otlp-"))
    try {
      fs.mkdirSync(path.join(dir, "node_modules/@effect"), { recursive: true })
      fs.symlinkSync(path.join(packages, "effect"), path.join(dir, "node_modules/effect"))
      fs.symlinkSync(path.join(packages, "platform/node"), path.join(dir, "node_modules/@effect/platform-node"))
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "app", type: "module" }))
      fs.writeFileSync(
        path.join(dir, "app.efx"),
        "// @efx observability otlp\nmain {\n  await sync(() => process.stdout.write(\"ran\\n\"))\n}\n"
      )
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("OTEL_")))
      const result = spawnSync(process.execPath, ["--import", register, "app.efx"], { cwd: dir, encoding: "utf8", env })
      expect(result.stdout).toContain("ran")
      expect(result.status).toBe(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
