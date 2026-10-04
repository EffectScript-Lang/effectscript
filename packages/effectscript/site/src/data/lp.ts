/**
 * The landing page's computed facts (ADR-0082): every number, diagnostic and compiled snippet on
 * the page comes from the compiler, the gallery or the tokenizer when the site is built.
 */
import { toTypeScript } from "effectscript/compiler"
import { encode } from "gpt-tokenizer/encoding/o200k_base"
import { gallery, saving } from "./gallery.ts"

export const scenarios = gallery()

/** o200k_base totals of the ten scenarios, per pane. */
export const totals = scenarios.reduce(
  (sum, s) => ({
    plain: sum.plain + s.panes[0].tokens,
    effect: sum.effect + s.panes[1].tokens,
    efx: sum.efx + s.panes[2].tokens
  }),
  { plain: 0, effect: 0, efx: 0 }
)

export const savings = {
  effect: saving(totals.effect, totals.efx),
  plain: saving(totals.plain, totals.efx)
}

/**
 * The ceremony the compiler writes so you don't: each form counted in the ten samples' compiled
 * Effect TypeScript and in their EffectScript.
 */
export const ceremony = (() => {
  const forms: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
    ["yield*", /yield\*/g],
    ["function*", /function\*/g],
    ["Effect.fn(…)", /Effect\.fn\b/g],
    ["Effect.gen(…)", /Effect\.gen\b/g],
    ["pipe(…)", /\bpipe\(/g],
    ["import { … }", /^import /gm]
  ]
  const effect = scenarios.map((s) => s.panes[1].code).join("\n")
  const efx = scenarios.map((s) => s.panes[2].code).join("\n")
  return forms.map(([label, pattern]) => ({
    label,
    effect: effect.match(pattern)?.length ?? 0,
    efx: efx.match(pattern)?.length ?? 0
  }))
})()

/** A snippet and what the compiler says about it, compiled when the page is built. */
export interface Diagnosed {
  readonly title: string
  readonly code: string
  readonly diagnostics: ReadonlyArray<{ code: string; severity: string; message: string; hint?: string }>
}

const diagnose = (title: string, code: string): Diagnosed => ({
  title,
  code,
  diagnostics: toTypeScript(code, { filename: "app.efx" }).diagnostics.map((d) => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    ...(d.hint === undefined ? {} : { hint: d.hint })
  }))
})

/** The strict rules, shown on real mistakes (spec §4.17). */
export const mistakes: ReadonlyArray<Diagnosed> = [
  diagnose(
    "An effect created and never run",
    "effect save(name: string) {\n  console.log(`saving ${name}`)\n}\n\nexport effect register(name: string) {\n  save(name)\n  return name\n}"
  ),
  diagnose(
    "A Promise awaited inside effect code",
    "export effect load(url: string) {\n  const response = await fetch(url)\n  return response.status\n}"
  ),
  diagnose(
    "An array of effects awaited one by one",
    "effect load(id: string) {\n  return id\n}\n\nexport effect loadAll(ids: Array<string>) {\n  return await ids.map((id) => load(id))\n}"
  ),
  diagnose(
    "A string thrown as an error",
    "export effect check(n: number) {\n  if (n < 0) throw \"negative\"\n  return n\n}"
  )
]

/** One small file, and the Effect TypeScript it compiles to. */
export const outputExample = (() => {
  const efx =
    "export error UserNotFound { id: string }\n\nexport effect getUser(id: string): string throws UserNotFound {\n  if (id === \"\") throw new UserNotFound({ id })\n  return id\n} |> retry({ times: 3 })"
  const ts = toTypeScript(efx, { filename: "users.efx" }).code.trim()
  return { efx, ts, efxTokens: encode(efx).length, tsTokens: encode(ts).length }
})()

/** The Effect TypeScript the hero's strands are made of: the samples' compiled panes. */
export const ceremonySheet = scenarios
  .flatMap((s) => s.panes[1].code.split("\n"))
  .map((line) => line.trim())
  .filter((line) => line.length > 24 && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*"))
