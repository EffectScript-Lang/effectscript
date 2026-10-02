import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

const head =
  "export group UsersApi {\n  get list \"/\": string\n  get one \"/:id\" (params: { id: string }): string\n}\n\nexport api Api { UsersApi }\n\ndeclare const Live: Layer<never>\n\n"

describe("reverse: impl (Plan 7 Task 7)", () => {
  it.each([
    [
      "handlers, an effect member and pipes",
      "export const Handlers = impl Api.users {\n  const prefix = \"user-\"\n  return {\n    list: () => succeed(\"all\"),\n    effect one({ params }) {\n      return `${prefix}${params.id}`\n    }\n  }\n} |> provide(Live)\n"
    ],
    [
      "a bare impl",
      "export const Plain = impl Api.users {\n  return { list: () => succeed(\"a\"), one: () => succeed(\"b\") }\n}\n"
    ]
  ])("%s", (_name, efx) => {
    expect(roundTrip(`${head}${efx}`)).toBe(`${head}${efx}`)
  })

  it("keeps a handler whose span name doesn't match", () => {
    const ts =
      "import { Effect } from \"effect\"\nimport { HttpApiBuilder } from \"effect/http-api\"\ndeclare const Api: any\nexport const H = HttpApiBuilder.group(Api, \"users\", Effect.fn(\"other\")(function*(handlers) {\n  return handlers.handleAll({})\n}))\n"
    expect(expectSafe(ts).code).toContain("HttpApiBuilder.group(")
  })
})
