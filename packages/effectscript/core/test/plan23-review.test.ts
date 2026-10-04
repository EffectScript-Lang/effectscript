import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it, vi } from "vitest"
import { runCompiled } from "./utils/run.ts"
import { typecheck } from "./utils/typecheck.ts"

vi.setConfig({ testTimeout: 180_000 })

describe("Plan 23 final review", () => {
  it("I1: an activity in a loop takes a key, and runs once per key", async () => {
    const mod = await runCompiled(`
import { WorkflowEngine } from "effect/workflow"
const sent: Array<string> = []
export workflow Notify(ids: Array<string>): number key ids.join(",") {
  let count = 0
  for (const id of ids) {
    count += await activity send(id): number {
      sent.push(id)
      return 1
    }
  }
  return count
}
export const result = await Effect.runPromise(Notify.execute({ ids: ["a", "b", "c"] }) |> provide(Notify.layer |> Layer.provideMerge(WorkflowEngine.layerMemory)))
export { sent }
`)
    expect([mod.result, mod.sent]).toEqual([3, ["a", "b", "c"]])
    const loop = toTypeScript(
      "workflow W(ids: Array<string>): void key \"w\" {\n  for (const id of ids) await activity send(): void {}\n}\n"
    )
    expect(loop.diagnostics[0]?.message).toMatch(/activity in a loop needs a key/)
    const twice = toTypeScript(
      "workflow W(x: string): void key x {\n  await activity send(): void {}\n  await activity send(): void {}\n}\n"
    )
    expect(twice.diagnostics[0]?.message).toMatch(/two activities named `send`/)
  })

  it("I2: a variable named impl before as or satisfies stays a variable", () => {
    const source = "const impl = { a: 1 }\nconst y = impl as { a: number }\nconst z = impl satisfies { a: number }\n"
    const result = toTypeScript(source)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toBe(source)
  })

  it("I3: workflow fields destructure only what the key and body use, so reserved words and unused fields compile", () => {
    const result = toTypeScript(
      "export workflow W(class: string, id: string, note?: string): string key id {\n  return id\n}\n"
    )
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain("idempotencyKey: ({ id }) => id")
    expect(result.code).toContain("function*({ id })")
    expect(typecheck(new Map([["plan23-i3.ts", result.code]]))).toEqual([])
  })

  it("I4: a stream's error and the line's throws are both the RPC's error", () => {
    const { code } = toTypeScript(
      "error Boom {}\nerror Other {}\nrpc R {\n  both(): Stream<string, Boom> throws Other\n}\n"
    )
    expect(code).toContain("error: Schema.Union([Boom, Other]), stream: true")
  })

  it("I7: hand-written near-misses stay TypeScript", () => {
    const back = (ts: string) => toEffectScript(ts, { filename: "near.ts" }).code
    const tool = `import { Schema } from "effect"
import { Tool } from "effect/ai"
/** Shown to people. */
export const T = Tool.make("T", { description: "Shown to the model." })
`
    expect(back(tool)).toContain("Tool.make")
    const workflow = `import { Effect, Schedule, Schema } from "effect"
import { Workflow } from "effect/workflow"
const WWorkflow = Workflow.make("W", { payload: { id: Schema.String }, idempotencyKey: ({ id }) => id, suspendedRetrySchedule: Schedule.forever })
export const W = Object.assign(WWorkflow, {
  layer: WWorkflow.toLayer(Effect.fn("W")(function*({ id }) {
    return
  }))
})
`
    expect(back(workflow)).toContain("Workflow.make")
    const entity = `import { Entity } from "effect/cluster"
import { Rpc } from "effect/rpc"
export const Counter = Entity.make("OtherName", [Rpc.make("get")])
`
    expect(back(entity)).toContain("Entity.make")
    const toolkit = `import { Toolkit } from "effect/ai"
declare const tools: ReadonlyArray<any>
export const K = Toolkit.make(...tools)
`
    expect(back(toolkit)).toContain("Toolkit.make")
    const activity = `import { Effect, Schedule } from "effect"
import { Activity } from "effect/workflow"
export const a = Activity.make({ name: "a", execute: Effect.gen(function*() { return 1 }), interruptRetryPolicy: Schedule.forever })
`
    expect(back(activity)).toContain("Activity.make")
  })
})
