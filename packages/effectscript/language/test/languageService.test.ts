import { createLanguagePlugin } from "@effectscript/language"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { createHarness } from "./utils/harness.ts"

const a =
  "export effect double(n: number): number {\n  const x = await succeed(n)\n  return x * 2\n}\nexport schema User { name: string }\n"
const b =
  "import { double, User } from \"./a.efx\"\nexport const r = double(2)\nexport const u = new User({ name: 1 })\n"

describe("language service over .efx", () => {
  const { dir, service } = createHarness({ "a.efx": a, "b.ts": b })

  it("type-checks a .ts consumer of an .efx module", () => {
    const messages = service.getSemanticDiagnostics(`${dir}/b.ts`).map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n")
    )
    expect(messages).toEqual(["Type 'number' is not assignable to type 'string'."])
    expect(service.getSemanticDiagnostics(`${dir}/a.efx`)).toEqual([])
  })

  it("navigates from .ts to the .efx declaration", () => {
    const [definition] = service.getDefinitionAtPosition(`${dir}/b.ts`, b.indexOf("double(2)"))!
    expect(definition!.fileName).toBe(`${dir}/a.efx`)
    expect(a.slice(definition!.textSpan.start, definition!.textSpan.start + 6)).toBe("double")
  })

  it("renames across .efx and .ts", () => {
    const locations = service.findRenameLocations(`${dir}/a.efx`, a.indexOf("double"), false, false, {})!
    expect(locations.map((l) => base(l.fileName)).sort()).toEqual(["a.efx", "b.ts", "b.ts"])
  })

  it("hovers and completes inside effect code", () => {
    const hover = service.getQuickInfoAtPosition(`${dir}/a.efx`, a.indexOf("x * 2"))!
    expect(ts.displayPartsToString(hover.displayParts)).toBe("const x: number")
    const names = service.getCompletionsAtPosition(`${dir}/a.efx`, a.indexOf("x * 2"), {})!.entries.map((e) => e.name)
    expect(names).toEqual(expect.arrayContaining(["n", "x"]))
  })

  it("completes members on a half-typed line (ADR-0020)", () => {
    const source = "export effect f(n: number) {\n  const x = n.\n  return 1\n}\n"
    const harness = createHarness({ "c.efx": source })
    const names = harness.service.getCompletionsAtPosition(`${harness.dir}/c.efx`, source.indexOf("n.\n") + 2, {})!
      .entries.map((e) => e.name)
    expect(names).toContain("toFixed")
  })
})

const base = (fileName: string) => fileName.split("/").pop()!

describe("language plugin options", () => {
  it("derives service keys from the nearest package.json, like efx build (review I5)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efx-plugin-"))
    try {
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "app" }))
      const source = "export service Database {\n  effect ping(): void\n}\n"
      const code = createLanguagePlugin(ts).createVirtualCode!(
        path.join(dir, "src/a.efx"),
        "effectscript",
        ts.ScriptSnapshot.fromString(source),
        { getAssociatedScript: () => undefined }
      )!
      expect(code.snapshot.getText(0, code.snapshot.getLength())).toContain("\"app/a/Database\"")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
