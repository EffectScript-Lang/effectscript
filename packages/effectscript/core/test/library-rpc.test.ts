import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const fixture = fs.readFileSync(path.join(import.meta.dirname, "fixtures/rpc/users.efx"), "utf8")

describe("rpc groups and impl (ADR-0068)", () => {
  it("serve calls, typed failures and streams through an in-memory client", async () => {
    const mod = await runCompiled(`${fixture}
import { RpcTest } from "effect/rpc"
export const result = await Effect.runPromise(effect {
  const client = await RpcTest.makeClient(UsersRpc)
  const user = await client.getUser({ id: "1" })
  const renamed = await client.rename({ id: "1", name: "Grace" })
  const missing = await Effect.flip(client.getUser({ id: "2" }))
  const forbidden = await Effect.flip(client.rename({ id: "0", name: "x" }))
  const events = await Stream.runCollect(client.watch({ id: "7" }))
  return [user.name, renamed.name, missing._tag, forbidden._tag, events]
} |> scoped |> provide(UsersLive))
`)
    expect(mod.result).toEqual(["Ada", "Grace", "UserNotFound", "Forbidden", ["7:a", "7:b"]])
  }, 180_000)

  it("keeps rpc, impl and Stream names elsewhere", () => {
    const source = "const rpc = { call: (x: number) => x }\nrpc.call(1)\nconst impl = 2\nconst o = { impl }\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
