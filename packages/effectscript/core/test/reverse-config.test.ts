import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

describe("reverse: config (Plan 7 Task 2)", () => {
  it.each([
    [
      "every field kind",
      "export config AppConfig {\n  port: Port = 3000\n  databaseUrl: Redacted\n  logLevel: LogLevel = \"Info\"\n  region?: \"eu\" | \"us\"\n  mode: \"dev\"\n  serviceName: string\n  retries: number = 2\n  verbose: boolean\n  workers: Int = 4\n}\n"
    ],
    ["inline", "config Small { a: string; b: number }\n"],
    [
      "a schema field",
      "const Url = Schema.String\nconfig Remote {\n  baseUrl: Url\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx)).toBe(efx)
  })

  it.each([
    ["an env name that isn't the derived one", "export const C = Config.all({ port: Config.Port(\"PORT_NUMBER\") })\n"],
    ["a computed key", "export const C = Config.all({ [\"port\"]: Config.Port(\"PORT\") })\n"],
    [
      "two pipe steps",
      "export const C = Config.all({ port: Config.Port(\"PORT\").pipe(Config.withDefault(1), Config.orElse(() => Config.succeed(2))) })\n"
    ]
  ])("keeps %s as TypeScript", (_name, body) => {
    const ts = `import * as Config from "effect/Config"\n${body}`
    expect(expectSafe(ts).code).toContain("Config.all(")
  })
})
