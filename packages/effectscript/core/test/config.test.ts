import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

describe("config (§4.14)", () => {
  it("reads typed values with SCREAMING_SNAKE_CASE keys, defaults and options", async () => {
    const mod = await runCompiled(`
      import { ConfigProvider, Effect, Option, Redacted } from "effect"
      config AppConfig {
        port: Port = 3000
        databaseUrl: Redacted
        region?: "eu" | "us"
        workers: Int = 4
      }
      const provider = ConfigProvider.layer(ConfigProvider.fromUnknown({ DATABASE_URL: "postgres://db", REGION: "eu", WORKERS: "8" }))
      const config = Effect.runSync(Effect.gen(function*() { return yield* AppConfig }).pipe(Effect.provide(provider)))
      export const values = [config.port, Redacted.value(config.databaseUrl), Option.getOrNull(config.region), config.workers]
      export const missing = Effect.runSync(Effect.exit(AppConfig).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))))
    `)
    expect(mod.values).toEqual([3000, "postgres://db", "eu", 8])
    expect(mod.missing._tag).toBe("Failure")
  }, 120_000)

  it("EFX3010: a field type with no Config form", () => {
    const result = toTypeScript("config C {\n  tags: Array<string>\n}\n")
    expect(result.diagnostics.map((d) => d.code)).toEqual(["EFX3010"])
  })
})
