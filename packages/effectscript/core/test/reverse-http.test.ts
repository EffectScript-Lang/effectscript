import { describe, expect, it } from "vitest"
import { expectSafe, roundTrip } from "./utils/reverse.ts"

const schemas =
  "export schema User {\n  id: string\n}\n\nexport error UserNotFound { id: string }\n\nexport error Forbidden {}\n\n"

describe("reverse: group and api (Plan 7 Task 6)", () => {
  it.each([
    [
      "endpoints of every kind",
      "export group UsersApi {\n  get list \"/\" (query: { search?: string }): Array<User>\n  get getById \"/:id\" (params: { id: string }): User throws UserNotFound | Forbidden\n  post create \"/\" (payload: User): User\n  del remove \"/:id\" (params: { id: string }, headers: { token: string })\n}\n"
    ],
    [
      "a custom identifier and a middleware",
      "declare const Auth: any\n\ngroup SystemApi \"sys\" {\n  get health \"/health\": string\n  middleware Auth\n}\n"
    ],
    ["an api", "group AApi {\n  get a \"/a\"\n}\n\ngroup BApi {\n  get b \"/b\"\n}\n\nexport api Api { AApi, BApi }\n"]
  ])("%s", (_name, efx) => {
    expect(roundTrip(`${schemas}${efx}`)).toBe(`${schemas}${efx}`)
  })

  it.each([
    [
      "options out of order",
      "export class G extends HttpApiGroup.make(\"g\").add(\n  HttpApiEndpoint.get(\"a\", \"/a\", { success: Schema.String, query: { q: Schema.String } })\n) {}\n"
    ],
    [
      "a section field with no type form",
      "export class G extends HttpApiGroup.make(\"g\").add(\n  HttpApiEndpoint.get(\"a\", \"/a\", { query: { q: Schema.String.pipe(Schema.check(Schema.isMinLength(1))) } })\n) {}\n"
    ]
  ])("keeps %s as TypeScript", (_name, body) => {
    const ts =
      `import * as Schema from "effect/Schema"\nimport * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"\nimport * as HttpApiGroup from "effect/http-api/HttpApiGroup"\n${body}`
    expect(expectSafe(ts).code).toContain("HttpApiGroup.make(")
  })
})
