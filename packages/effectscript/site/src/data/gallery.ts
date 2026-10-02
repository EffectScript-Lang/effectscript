/**
 * The before/after gallery (spec §9.2, ADR-0054): each scenario in plain TypeScript, in Effect
 * TypeScript, and in EffectScript. The Effect pane is compiled from the EffectScript at build time,
 * so it can't drift. Token counts are o200k_base (the GPT-4o tokenizer), counted on the code shown.
 */
import { toTypeScript } from "effectscript/compiler"
import { decode, encode } from "gpt-tokenizer/encoding/o200k_base"
import { scenarios } from "../samples/index.ts"

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

const pane = (kind: Pane["kind"], name: string, language: Pane["language"], code: string): Pane => {
  const ids = encode(code)
  return { kind, name, language, code, tokens: ids.length, pieces: ids.map((id) => decode([id])) }
}

export const gallery = (): Array<Scenario> =>
  scenarios.map(({ file, id, title }) => {
    const efx = source(id, "app.efx")
    const compiled = toTypeScript(efx, { filename: `${file}.efx` })
    return {
      id,
      title,
      diagnostics: compiled.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`),
      panes: [
        pane("plain", `${file}.ts`, "ts", source(id, "plain.ts")),
        pane("effect", `${file}.effect.ts`, "ts", compiled.code),
        pane("efx", `${file}.efx`, "efx", efx)
      ]
    }
  })

/** How much smaller `after` is than `before`, as a whole percentage. */
export const saving = (before: number, after: number): number => Math.round((1 - after / before) * 100)
