import { toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"
import { httpTestPrelude } from "./utils/http.ts"
import { runCompiled } from "./utils/run.ts"

describe("Plan 5 final review", () => {
  it("I1: a command body with defer gets Effect.scoped and runs its finalizer", async () => {
    const mod = await runCompiled(`
      import { Effect } from "effect"
      import { Command } from "effect/cli"
      import { NodeServices } from "@effect/platform-node"
      export const seen: Array<string> = []
      command c() {
        defer { seen.push("release") }
        seen.push("body")
      }
      await Effect.runPromise(Command.runWith(c, { version: "1.0.0" })([]).pipe(Effect.provide(NodeServices.layer)))
    `)
    expect(mod.seen).toEqual(["body", "release"])
  }, 180_000)

  it("I2: every return of an impl body is wrapped in handleAll", async () => {
    const mod = await runCompiled(`${httpTestPrelude}
      group UsersApi {
        get list "/": string
      }
      api Api { UsersApi }
      const fast = true
      const UsersLive = impl Api.users {
        if (fast) return { list: () => succeed("fast") }
        const handlers = { list: () => succeed("slow") }
        return handlers
      }
      export const result = await Effect.runPromise(Effect.gen(function*() {
        const client = yield* HttpApiTest.groups(Api, ["users"]).pipe(Effect.provide(UsersLive))
        return yield* client.users.list()
      }).pipe(Effect.scoped, Effect.provide(TestServices)))
    `)
    expect(mod.result).toBe("fast")
  }, 180_000)

  it("I3: ? with a default on a command parameter is EFX9001", () => {
    expect(toTypeScript("command c(--n?: string = \"d\") {\n  return\n}\n").diagnostics.map((d) => d.code)).toContain(
      "EFX9001"
    )
  })

  it("I4: JSDoc extraction stops at its own closing */", () => {
    const { code } = toTypeScript(
      "/** Doc A */\n/* plain */\ncommand c(/** Title */ /* note */ name: string) {\n  return\n}\n"
    )
    expect(code).not.toContain("withDescription(\"Title */")
    expect(code).not.toContain("withDescription(\"Doc A */")
  })

  it("M5 (raised): a section member that isn't a property is EFX9002, not a crash", () => {
    const codes = toTypeScript("group G {\n  get a \"/a\" (query: { [k: string]: string })\n}\n").diagnostics.map((d) =>
      d.code
    )
    expect(codes).toEqual(["EFX9002"])
  })
})
