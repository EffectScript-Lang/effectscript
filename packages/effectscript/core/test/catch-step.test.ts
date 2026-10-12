import { toEffectScript, toTypeScript } from "effectscript/compiler"
import { describe, expect, it } from "vitest"

const head = `error NotFound { id: string }
error Gone
error RateLimited { retryAfter: number }
declare const find: (id: string) => Effect<string, NotFound | Gone | RateLimited>
declare const fallback: (id: string) => Effect<string>
`

const compile = (body: string) => {
  const result = toTypeScript(`${head}${body}`, { filename: "a.efx" })
  return { code: result.code.slice(result.code.indexOf("declare const fallback")), diagnostics: result.diagnostics }
}

describe("|> catch Tag => value (ADR-0308)", () => {
  it.each([
    [
      "a value",
      "export const a = (id: string) => find(id) |> catch NotFound => \"guest\"\n",
      "find(id).pipe(Effect.catchTag(\"NotFound\", () => Effect.succeed(\"guest\")))"
    ],
    [
      "several tags, ignored",
      "export const b = (id: string) => find(id) |> catch NotFound or Gone => undefined\n",
      "find(id).pipe(Effect.catchTag([\"NotFound\", \"Gone\"], () => Effect.void))"
    ],
    [
      "a binding the value reads",
      "export const c = (id: string) => find(id) |> catch (e: RateLimited) => e.retryAfter\n",
      "find(id).pipe(Effect.catchTag(\"RateLimited\", (e) => Effect.succeed(e.retryAfter)))"
    ],
    [
      "another effect",
      "export effect d(id: string) {\n  return await find(id) |> catch NotFound => await fallback(id)\n}\n",
      "find(id).pipe(Effect.catchTag(\"NotFound\", () => fallback(id)))"
    ],
    [
      "a failure",
      "export const e = (id: string) => find(id) |> catch NotFound => throw new Gone()\n",
      "find(id).pipe(Effect.catchTag(\"NotFound\", () => Effect.fail(new Gone())))"
    ],
    [
      "followed by other steps",
      "export const f = (id: string) => find(id) |> catch NotFound => ({ id }) |> orDie\n",
      "find(id).pipe(Effect.catchTag(\"NotFound\", () => Effect.succeed({ id })), Effect.orDie)"
    ]
  ])("%s", (_name, body, expected) => {
    const result = compile(body)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain(expected)
  })

  it.each([
    [
      "inside a step",
      "export const g = (id: string) => find(id) |> map((x) => [catch NotFound => 1])\n",
      "is a pipe step"
    ],
    [
      "an effect inside the value",
      "export effect h(id: string) {\n  return await find(id) |> catch NotFound => (await fallback(id)).length\n}\n",
      "can't run effects"
    ]
  ])("reports %s (EFX5003)", (_name, body, message) => {
    const result = compile(body)
    expect(result.diagnostics.map((d) => d.code)).toContain("EFX5003")
    expect(result.diagnostics.map((d) => d.message).join("\n")).toContain(message)
  })

  it("leaves `catch` blocks and `schema`-like names alone", () => {
    const result = compile(
      "export effect i(id: string) {\n  try {\n    return await find(id)\n  } catch (e: NotFound) {\n    return \"guest\"\n  }\n}\n"
    )
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain("Effect.catchTag(\"NotFound\"")
  })

  it("is what the reverse compiler writes, and round-trips", () => {
    const ts = `import * as Effect from "effect/Effect"
declare const find: (id: string) => Effect.Effect<string, { _tag: "NotFound" } | { _tag: "Gone" }>
declare const fallback: (id: string) => Effect.Effect<string>

export const a = Effect.fn("a")(function*(id: string) {
  return yield* find(id).pipe(
    Effect.catchTag(["NotFound", "Gone"], () => Effect.void),
    Effect.timeout("1 second"))
})
export const b = Effect.fn("b")(function*(id: string) {
  return yield* find(id).pipe(Effect.catchTag("NotFound", () => fallback(id)))
})
export const c = (id: string) => find(id).pipe(Effect.catchTag("NotFound", (e) => Effect.succeed(e._tag)))
`
    const efx = toEffectScript(ts, { filename: "a.ts" }).code
    expect(efx).toContain("|> catch NotFound or Gone => undefined\n")
    expect(efx).toContain("|> catch NotFound => await fallback(id)\n")
    expect(efx).toContain("|> catch (e: NotFound) => e._tag\n")
    expect(toTypeScript(efx, { filename: "a.efx" }).code).toBe(ts)
  })

  it("keeps a handler the form can't hold", () => {
    const ts = `import * as Effect from "effect/Effect"
declare const find: (id: string) => Effect.Effect<string, { _tag: "NotFound" }>
export const a = (id: string) => find(id).pipe(Effect.catchTag("NotFound", () => Effect.succeed(undefined)))
export const c = (id: string) => find(id).pipe(Effect.catchTag("NotFound", () => Effect.succeed<string | null>(null)))
export const b = (id: string) => find(id).pipe(Effect.catchTag("@app/NotFound" as any, () => Effect.succeed(1)))
`
    const efx = toEffectScript(ts, { filename: "a.ts" }).code
    expect(efx).not.toContain("|> catch ")
  })
})
