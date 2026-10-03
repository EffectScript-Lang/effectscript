import { editorsToDecorate } from "@effectscript/language/decorations"
import { describe, expect, it } from "vitest"

const doc = (name: string, languageId: string) => ({ name, languageId })
const editor = (document: ReturnType<typeof doc>) => ({ document })

describe("editorsToDecorate (Plan 21)", () => {
  const a = doc("a.efx", "effectscript")
  const b = doc("b.efx", "effectscript")
  const t = doc("c.ts", "typescript")
  const visible = [editor(a), editor(t), editor(b), editor(a)]
  const isEfx = (d: ReturnType<typeof doc>) => d.languageId === "effectscript"

  it("decorates every visible EffectScript editor, split views included", () => {
    expect(editorsToDecorate(visible, undefined, isEfx).map((e) => e.document.name)).toEqual([
      "a.efx",
      "b.efx",
      "a.efx"
    ])
  })

  it("after an edit, decorates every editor showing that document", () => {
    expect(editorsToDecorate(visible, a, isEfx).map((e) => e.document.name)).toEqual(["a.efx", "a.efx"])
    expect(editorsToDecorate(visible, t, isEfx)).toEqual([])
  })
})
