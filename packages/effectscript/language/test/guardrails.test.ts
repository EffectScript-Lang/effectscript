import { bindHover, promiseAwaitMessage } from "@effectscript/language/guardrails"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { createHarness } from "./utils/harness.ts"

const source = [
  "const p: Promise<number> = Promise.resolve(1)",
  "export effect a(n: number): number {",
  "  const x = await succeed(n)",
  "  const y = await p",
  "  for (const z of 1) {}",
  "  return x + (await f())",
  "}",
  "export const f = async () => await p",
  ""
].join("\n")

const hoverText = (info: ts.QuickInfo | undefined) =>
  info === undefined
    ? undefined
    : `${ts.displayPartsToString(info.displayParts)}|${ts.displayPartsToString(info.documentation)}`

describe("await guardrails in the TS language service (Plan 11 Task 2, ADR-0039)", () => {
  const { dir, service } = createHarness({ "a.efx": source }, { guardrails: true })
  const file = `${dir}/a.efx`

  it("explains an effect await on hover", () => {
    const info = service.getQuickInfoAtPosition(file, source.indexOf("await succeed") + 2)
    expect(hoverText(info)).toBe(`await (effect bind)|${bindHover}`)
    expect(info!.textSpan).toEqual({ start: source.indexOf("await succeed"), length: 5 })
    expect(hoverText(service.getQuickInfoAtPosition(file, source.indexOf("await f()") + 1))).toContain(bindHover)
  })

  it("leaves an async function's await and other positions to TypeScript", () => {
    expect(hoverText(service.getQuickInfoAtPosition(file, source.lastIndexOf("await p") + 1)) ?? "").not.toContain(
      bindHover
    )
    expect(ts.displayPartsToString(service.getQuickInfoAtPosition(file, source.indexOf("x +"))!.displayParts)).toBe(
      "const x: number"
    )
  })

  it("rewrites awaiting a Promise inside effect, and nothing else", () => {
    const diagnostics = service.getSemanticDiagnostics(file)
    const promise = diagnostics.find((d) => d.start === source.indexOf("p\n  for"))!
    expect(promise.code).toBe(2488)
    expect(promise.messageText).toBe(promiseAwaitMessage)
    const iterable = diagnostics.find((d) => d.start === source.indexOf("1) {}"))!
    expect(ts.flattenDiagnosticMessageText(iterable.messageText, "\n")).toMatch(/^Type '1' must have/)
  })

  it("rewrites awaiting any thenable type, whatever its name (review I2)", () => {
    const aliased = [
      "type P = Promise<number>",
      "interface Q extends Promise<number> {}",
      "declare const p: P",
      "declare const q: Q",
      "export effect a() {",
      "  const x = await p",
      "  const y = await q",
      "  return x + y",
      "}",
      ""
    ].join("\n")
    const harness = createHarness({ "c.efx": aliased }, { guardrails: true })
    const messages = harness.service.getSemanticDiagnostics(`${harness.dir}/c.efx`).filter((d) => d.code === 2488).map((
      d
    ) => [aliased.slice(d.start!, d.start! + 1), d.messageText])
    expect(messages).toEqual([["p", promiseAwaitMessage], ["q", promiseAwaitMessage]])
  })

  it("never throws on incomplete code", () => {
    const broken = "export effect a() {\n  const x = await succeed(1)\n  const y = x.\n}\n"
    const harness = createHarness({ "b.efx": broken }, { guardrails: true })
    const b = `${harness.dir}/b.efx`
    expect(hoverText(harness.service.getQuickInfoAtPosition(b, broken.indexOf("await") + 1))).toContain(bindHover)
    expect(() => harness.service.getSemanticDiagnostics(b)).not.toThrow()
  })
})
