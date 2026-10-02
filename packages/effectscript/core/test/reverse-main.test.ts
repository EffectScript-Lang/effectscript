import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const roundTrip = (efx: string, options: { runtime?: "node" | "browser" } = {}) => {
  const ts = toTypeScript(efx, options).code
  const back = toEffectScript(ts, options)
  expect(toTypeScript(back.code, options).code).toBe(ts)
  return back
}

describe("reverse: main (Plan 6 Task 10)", () => {
  it.each([
    ["plain", "declare const program: Effect<void>\nmain {\n  await program\n}\n"],
    ["with pipes", "main {\n  console.log(\"hi\")\n} |> provide(Layer.empty) |> orDie\n"],
    ["with defer", "declare const close: Effect<void>\nmain {\n  defer close\n  console.log(\"hi\")\n}\n"],
    ["with telemetry", "// @efx observability otlp\nmain {\n  console.log(\"traced\")\n}\n"]
  ])("%s", (_name, efx) => {
    expect(roundTrip(efx).code).toBe(efx)
  })

  it("follows the runtime option", () => {
    const efx = "main {\n  console.log(\"hi\")\n}\n"
    expect(roundTrip(efx, { runtime: "browser" }).code).toBe(efx)
  })

  it("keeps another runtime's main as TypeScript", () => {
    const ts = toTypeScript("main {\n  console.log(\"hi\")\n}\n", { runtime: "browser" }).code
    const back = toEffectScript(ts, { runtime: "node" })
    expect(back.code).toContain("runMain")
    expect(back.notes.map((n) => n.message).join("\n")).toMatch(/runtime/)
  })
})
