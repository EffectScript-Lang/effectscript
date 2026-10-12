/**
 * The before/after gallery (spec §9.2, ADR-0054): each scenario in plain TypeScript, in Effect
 * TypeScript, and in EffectScript. The Effect pane is compiled from the EffectScript at build time,
 * so it can't drift. Token counts are o200k (the GPT-4o and GPT-5 vocabulary) through Hugging Face
 * tokenizers, counted on the code shown (ADR-0301).
 */
import { count, pieces } from "@effectscript/tokens"
import { toTypeScript } from "effectscript/compiler"
import { scenarios } from "../samples/scenarios.ts"

const sources = import.meta.glob<string>("../samples/*/*.{ts,efx}", { query: "?raw", import: "default", eager: true })

const source = (id: string, file: string): string => {
  const text = sources[`../samples/${id}/${file}`]
  if (text === undefined) throw new Error(`missing gallery sample ${id}/${file}`)
  return text
}

export interface Pane {
  readonly kind: "plain" | "effect" | "efx"
  /** The editor tab's file name. */
  readonly name: string
  readonly language: "ts" | "efx"
  readonly code: string
  readonly tokens: number
  /** The code split at token boundaries, for the "show tokens" toggle. */
  readonly pieces: ReadonlyArray<string>
}

export interface Scenario {
  readonly id: string
  readonly title: string
  readonly panes: readonly [Pane, Pane, Pane]
  /** EffectScript compiler errors (none, for a correct sample). */
  readonly diagnostics: ReadonlyArray<string>
}

const pane = async (kind: Pane["kind"], name: string, language: Pane["language"], code: string): Promise<Pane> => ({
  kind,
  name,
  language,
  code,
  tokens: (await count([code]))[0]!,
  pieces: await pieces(code)
})

export const gallery = (): Promise<Array<Scenario>> =>
  Promise.all(scenarios.map(async ({ file, id, title }): Promise<Scenario> => {
    const efx = source(id, "app.efx")
    const compiled = toTypeScript(efx, { filename: `${file}.efx` })
    return {
      id,
      title,
      diagnostics: compiled.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`),
      panes: [
        await pane("plain", `${file}.ts`, "ts", source(id, "plain.ts")),
        await pane("effect", `${file}.effect.ts`, "ts", compiled.code),
        await pane("efx", `${file}.efx`, "efx", efx)
      ]
    }
  }))

/** How much smaller `after` is than `before`, as a whole percentage. */
export const saving = (before: number, after: number): number => Math.round((1 - after / before) * 100)
