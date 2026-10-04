import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"
import { runCompiled } from "./utils/run.ts"

const fixture = fs.readFileSync(path.join(import.meta.dirname, "fixtures/ai/assistant.efx"), "utf8")

describe("tool and toolkit (ADR-0070)", () => {
  it("describe tools with their doc comments, and run them through the toolkit's handlers", async () => {
    const mod = await runCompiled(`${fixture}
export const description = GetForecast.description
export const result = await Effect.runPromise(effect {
  const tools = await Assistant
  const found = await Stream.runCollect(await tools.handle("GetForecast", { city: "Tokyo" }))
  const missing = await Stream.runCollect(await tools.handle("GetForecast", { city: "Atlantis" })) |> flip
  return [found.at(-1)?.result, missing]
} |> provide(AssistantLive))
`)
    expect(mod.description).toBe("Looks up the forecast for a city.")
    expect(mod.result[0]).toMatchObject({ city: "Tokyo", high: 21 })
    expect(mod.result[1]._tag).toBe("UnknownCity")
  }, 180_000)

  it("keeps tool and toolkit names elsewhere", () => {
    const source = "const tool = { name: \"x\" }\ntool.name\nconst toolkit = [tool]\nfunction tool2() {}\n"
    expect(toTypeScript(source).code).toBe(source)
  })
})
