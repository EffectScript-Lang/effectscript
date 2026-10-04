import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const fixture = fs.readFileSync(path.join(import.meta.dirname, "fixtures/workflow/welcome.efx"), "utf8")

describe("workflow and activity (ADR-0072)", () => {
  it("run on the in-memory engine: a result, a typed failure, and one execution per key", async () => {
    const mod = await runCompiled(`${fixture}
import { WorkflowEngine } from "effect/workflow"
const live = SendWelcome.layer |> Layer.provideMerge(WorkflowEngine.layerMemory)
export const result = await Effect.runPromise(effect {
  const welcome = await SendWelcome.execute({ email: "ada@example.com", name: "Ada" })
  const failure = await Effect.flip(SendWelcome.execute({ email: "x@invalid" }))
  const first = await SendWelcome.executionId({ email: "same@example.com" })
  const second = await SendWelcome.executionId({ email: "same@example.com", name: "other" })
  return [welcome, failure._tag, first === second]
} |> provide(live))
`)
    expect(mod.result).toEqual(["Welcome, Ada", "EmailFailed", true])
  }, 180_000)

  it("needs a key, names a keyed activity by its key, and keeps the names elsewhere", () => {
    const message = (source: string) => toTypeScript(source).diagnostics[0]?.message
    expect(message("workflow A(x: string): void { }")).toMatch(/needs `key <expression>`/)
    // an activity's parentheses hold its key: one recorded result per key (Plan 23 review)
    expect(toTypeScript("workflow A(x: string): void key x { await activity a(x): void { } }").code).toContain(
      "name: `a/${x}`"
    )
    const source = "const workflow = { key: 1 }\nconst activity = (n: number) => n\nactivity(workflow.key)\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
