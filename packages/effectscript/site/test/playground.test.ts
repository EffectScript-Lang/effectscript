import {
  compile,
  createTracker,
  createWatchdog,
  decodeHash,
  encodeHash,
  maxSource,
  paneToUpdate
} from "@effectscript/site/playground/protocol"
import { describe, expect, it, vi } from "vitest"

describe("the playground protocol (Plan 16 Task 4, ADR-0054)", () => {
  it("compiles EffectScript to TypeScript, with diagnostics at line and column", () => {
    const ok = compile({ seq: 1, direction: "toTypeScript", source: "effect f() {\n  return await succeed(1)\n}\n" })
    expect(ok.code).toContain("Effect.fn(\"f\")")
    expect(ok.diagnostics).toEqual([])
    const bad = compile({ seq: 2, direction: "toTypeScript", source: "effect f() {\n  const x = \n}\n" })
    expect(bad.diagnostics[0]).toMatchObject({ code: "EFX1001", severity: "error", line: 3 })
  })

  it("converts TypeScript back to EffectScript, with the notes", () => {
    const ts =
      "import { Effect } from \"effect\"\nexport const two = Effect.fn(\"two\", { attributes: { a: 1 } })(function*() {\n  return 2\n})\nexport const one = Effect.fn(\"one\")(function*() {\n  return 1\n})\n"
    const result = compile({ seq: 3, direction: "toEffectScript", source: ts })
    expect(result.code).toContain("export effect one()")
    expect(result.notes[0]).toMatchObject({ line: 2, message: expect.stringContaining("span options") })
  })

  it("never throws, and refuses sources over the size limit", () => {
    expect(compile({ seq: 4, direction: "toTypeScript", source: "@@@ effect {{{" }).diagnostics.length).toBeGreaterThan(
      0
    )
    const huge = compile({ seq: 5, direction: "toTypeScript", source: "x".repeat(maxSource + 1) })
    expect(huge.diagnostics[0]!.message).toMatch(/too large/)
  })

  it("drops results older than the newest request", () => {
    const tracker = createTracker()
    const first = tracker.next()
    const second = tracker.next()
    expect(tracker.accept(first)).toBe(false)
    expect(tracker.accept(second)).toBe(true)
  })

  it("shares code in the URL hash, and rejects malformed or oversized hashes", () => {
    const code = "effect f() {\n  return \"héllo ƒx 🎉\"\n}\n"
    expect(decodeHash(encodeHash(code))).toBe(code)
    expect(encodeHash(code)).toMatch(/^#code=[A-Za-z0-9_-]+$/)
    expect(decodeHash("#code=%%%")).toBeUndefined()
    expect(decodeHash("#nothing")).toBeUndefined()
    expect(decodeHash(`#code=${"A".repeat(Math.ceil((maxSource * 4) / 3) + 100)}`)).toBeUndefined()
  })

  it("review I7: a refusal or an internal error never overwrites the other pane", () => {
    const huge = compile({ seq: 6, direction: "toEffectScript", source: "x".repeat(maxSource + 1) })
    expect(huge.code).toBeUndefined()
    expect(paneToUpdate(huge)).toBeUndefined()
    expect(paneToUpdate(compile({ seq: 7, direction: "toEffectScript", source: "const a = 1\n" }))).toBe("efx")
    expect(paneToUpdate(compile({ seq: 8, direction: "toTypeScript", source: "const a = 1\n" }))).toBe("ts")
  })

  it("Plan 18: the watchdog fires only when a compile outlives its limit", () => {
    vi.useFakeTimers()
    try {
      const fired: Array<string> = []
      const dog = createWatchdog(5000, () => fired.push("restart"))
      dog.start()
      vi.advanceTimersByTime(4999)
      dog.stop()
      vi.advanceTimersByTime(10_000)
      expect(fired).toEqual([])
      dog.start()
      vi.advanceTimersByTime(3000)
      dog.start() // a newer request restarts the clock
      vi.advanceTimersByTime(3000)
      expect(fired).toEqual([])
      vi.advanceTimersByTime(2000)
      expect(fired).toEqual(["restart"])
      // `running` lets the page arm it once per burst of requests, not on every keystroke
      expect(dog.running()).toBe(false)
      dog.start()
      expect(dog.running()).toBe(true)
      dog.stop()
      expect(dog.running()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("the playground's live mapping (ADR-0084)", async () => {
  const { toTypeScript } = await import("effectscript/compiler")
  const { fromGenerated, fromSource, toGeneratedOffset, toLinks } = await import(
    "@effectscript/site/playground/mapping"
  )
  const { signalRanges } = await import("@effectscript/site/lib/signals")
  const source =
    "error UserNotFound { id: string }\n\nexport effect greet(id: string): string throws UserNotFound needs Users {\n  const user = await Users.find(id)\n  return user.name\n} |> retry({ times: 3 })\n"
  const { code, mappings } = toTypeScript(source, { filename: "playground.efx" })
  const links = toLinks(source, code, mappings)
  const generatedOf = (offset: number) =>
    fromSource(links, source, offset)!.generated.map(([from, to]) => code.slice(from, to))

  it("links each rewritten part to everything it became", () => {
    expect(generatedOf(source.indexOf("await"))).toEqual(["yield*"])
    expect(generatedOf(source.indexOf("effect greet")).join("")).toContain("Effect.fn(\"greet\")(function*")
    expect(generatedOf(source.indexOf("|>")).join("")).toContain("Effect.")
    expect(links.find((l) => l.kind === "prelude")).toBeDefined()
  })

  it("follows a copied word to its twin, and back from the output", () => {
    const user = source.indexOf("user.name")
    expect(generatedOf(user)).toEqual(["user"])
    const back = fromGenerated(links, code, code.indexOf("yield*"))!
    expect(source.slice(back.source[0], back.source[1])).toBe("await")
  })

  it("lines the output up with the source for scrolling, in order", () => {
    const offsets = [0, source.indexOf("export"), source.indexOf("const user"), source.indexOf("|>")]
    const mapped = offsets.map((o) => toGeneratedOffset(links, o))
    expect([...mapped].sort((a, b) => a - b)).toEqual(mapped)
  })

  it("finds A, E and R in Effect.fn.Return in the output", () => {
    const named = signalRanges(code, "ts").map((r) => [code.slice(r.start, r.end), r.signal])
    expect(named).toEqual([["string", "pass"], ["UserNotFound", "fail"], ["Users", "need"]])
  })
})

describe("the playground's concepts (ADR-0084)", async () => {
  const { parse, toTypeScript } = await import("effectscript/compiler")
  const { conceptAt, toConcepts, toLinks } = await import("@effectscript/site/playground/mapping")
  const source = `error UserNotFound { id: string }

service Users {
  effect find(id: string): string throws UserNotFound
}

export effect greet(id: string): string throws UserNotFound needs Users {
  const name = await Users.find(id)
  const [a, b] = await [Users.find("a"), Users.find("b")]
  return name + a + b
} |> retry({ times: 3 })
`
  const { code, mappings } = toTypeScript(source, { filename: "playground.efx" })
  const parsed = parse(source)
  if (parsed._tag === "Failure") throw new Error("the sample doesn't parse")
  const concepts = toConcepts(parsed.program, source, code, toLinks(source, code, mappings))
  const at = (needle: string, nth = 0) => {
    let offset = -1
    for (let i = 0; i <= nth; i++) offset = source.indexOf(needle, offset + 1)
    const concept = conceptAt(concepts, offset, "source")!
    return {
      kind: concept.kind,
      source: source.slice(...concept.source),
      generated: concept.generated.map((g) => code.slice(...g))
    }
  }

  it("maps a whole phrase to the phrase it became", () => {
    expect(at("await Users")).toMatchObject({ kind: "await", source: "await Users.find(id)" })
    expect(at("await Users").generated).toEqual(["yield* Users.find(id)"])
    expect(at("await [").generated.join("")).toContain("Effect.all(")
  })

  it("maps a signature to its Effect.fn header, and a pipe step to its combinator", () => {
    const header = at("export effect greet")
    expect(header.kind).toBe("effect-function")
    expect(header.generated.join("")).toContain("Effect.fn(\"greet\")(function*")
    expect(header.generated.join("")).toContain("Effect.fn.Return<string, UserNotFound, Users>")
    expect(at("|> retry").kind).toBe("pipe")
    expect(at("|> retry").generated.join("")).toContain("Effect.retry({ times: 3 })")
  })

  it("maps an error to its class, and a service method to every place it went", () => {
    expect(at("error UserNotFound").generated.join("")).toContain("Schema.TaggedError<UserNotFound>")
    const method = at("effect find")
    expect(method.kind).toBe("service-method")
    expect(method.generated.join("")).toContain("find(id: string): Effect.Effect<string, UserNotFound>")
    expect(method.generated.join("")).toContain("static readonly find = (id: string) => Users.use(")
  })
})

describe("the playground's intent colours (ADR-0085)", async () => {
  const { namesOf, paint } = await import("@effectscript/site/playground/intent")
  const efx = "error Gone { id: string }\nschema User { id: string }\nservice Users {}\n" +
    "export effect f(id: string): User throws Gone needs Users {\n  const u = await Users.get(id)\n  return u\n} |> retry({ times: 3 })\n"
  const ts =
    "class Gone extends Schema.TaggedError<Gone>()(\"Gone\", {}) {}\nconst f = Effect.fn(\"f\")(function*() {\n  return yield* Users.get(\"1\")\n})\n"
  const names = namesOf(efx, ts)
  const roles = (text: string, language: "efx" | "ts") =>
    new Map(paint(text, language, names).map((p) => [text.slice(p.start, p.end), p.role]))

  it("finds Effect's A, E and R among the declared names, on both sides", () => {
    expect([...names.errors]).toEqual(["Gone"])
    expect([...names.data]).toEqual(["User"])
    expect([...names.services]).toEqual(["Users"])
  })

  it("paints effects, structure, channels and literals by what they mean", () => {
    const efxRoles = roles(efx, "efx")
    expect(efxRoles.get("await")).toBe("effect")
    expect(efxRoles.get("|>")).toBe("effect")
    expect(efxRoles.get("retry")).toBe("effect")
    expect(efxRoles.get("export")).toBe("keyword")
    expect(efxRoles.get("Gone")).toBe("fail")
    expect(efxRoles.get("Users")).toBe("need")
    expect(efxRoles.get("3")).toBe("literal")
    const tsRoles = roles(ts, "ts")
    expect(tsRoles.get("Effect.fn")).toBe("effect")
    expect(tsRoles.get("function*")).toBe("effect")
    expect(tsRoles.get("yield*")).toBe("effect")
    expect(tsRoles.get("Schema.TaggedError")).toBe("type")
    expect(tsRoles.get("Gone")).toBe("fail")
  })
})

describe("the playground's presets", async () => {
  const { toTypeScript } = await import("effectscript/compiler")
  const { presets } = await import("@effectscript/site/playground/presets")
  const compiled = (code: string) => toTypeScript(code, { filename: "playground.efx" })

  it("compiles every live preset without a problem", () => {
    for (const preset of presets.filter((p) => p.proposal === undefined)) {
      expect({ id: preset.id, diagnostics: compiled(preset.code).diagnostics }).toEqual({
        id: preset.id,
        diagnostics: []
      })
    }
  })

  it("keeps a preset proposed only while the compiler refuses it", () => {
    const proposed = presets.filter((p) => p.proposal !== undefined)
    expect(proposed.map((p) => p.id)).toEqual(["brands-where", "law"])
    // once the syntax is built, the preset becomes live and its lowering is the compiler's
    for (const preset of proposed) expect(compiled(preset.code).diagnostics[0]?.code).toBe("EFX1001")
  })

  it("shows a law's lowering after the compiler's own output for the rest of the file", () => {
    const law = presets.find((p) => p.id === "law")!
    // the laws add `Exit` to the imports, so the comparison starts after them
    const body = (code: string) => code.slice(code.indexOf("\n") + 1)
    const before = law.code.slice(0, law.code.indexOf("/** Withdrawing"))
    expect(body(law.proposal!.lowering).startsWith(body(compiled(before).code).trimEnd())).toBe(true)
    expect(law.proposal!.lowering).toMatch(/^import \{ Effect, Exit, Schema \} from "effect"\n/)
  })

  it("matches a match arm's object literal with an object, not a block", () => {
    const foldkit = compiled(presets.find((p) => p.id === "foldkit")!.code).code
    expect(foldkit).toContain("ClickedIncrement: () => ({ model: { ...model, count: model.count + 1 } })")
  })
})
