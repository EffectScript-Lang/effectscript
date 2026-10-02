/**
 * `effectscript/blume` (ADR-0043): an Astro integration for Blume that highlights ```efx code
 * blocks with the EffectScript grammars (the VS Code extension's, copied into `grammars/`).
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"

/**
 * The part of an Astro integration this package uses (structural: Astro is Blume's dependency).
 *
 * @since 4.0.0
 * @category models
 */
export interface AstroIntegration {
  readonly name: string
  readonly hooks: {
    readonly "astro:config:setup": (options: { readonly updateConfig: (config: object) => unknown }) => void
  }
}

const grammar = (file: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(new URL(`../grammars/${file}`, import.meta.url), "utf8"))

/**
 * @since 4.0.0
 * @category integrations
 */
export const effectscript = (): AstroIntegration => ({
  name: "effectscript",
  hooks: {
    "astro:config:setup": ({ updateConfig }) => {
      const efx = {
        ...grammar("effectscript.tmLanguage.json"),
        name: "efx",
        aliases: ["effectscript"],
        embeddedLangs: ["tsx"]
      }
      const injection = {
        ...grammar("effectscript.injection.tmLanguage.json"),
        name: "efx-injection",
        injectTo: ["source.efx"]
      }
      updateConfig({ markdown: { shikiConfig: { langs: ["tsx", injection, efx] } } })
    }
  }
})
