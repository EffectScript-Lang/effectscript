/**
 * `effectscript/blume` (ADR-0043, ADR-0079): the EffectScript theme for Blume. It provides the
 * `effectscript()` integration, which highlights ```efx code with the EffectScript grammars (the VS
 * Code extension's, copied into `grammars/`) and marks `efx docs` facts on every page, plus the
 * `theme`, `markdown` and `frontmatter` config. The theme's page parts are
 * `effectscript/blume/components/*.astro`, and its styles are `effectscript/blume/theme.css`.
 *
 * @since 4.0.0
 */
import * as fs from "node:fs"
import { factKind } from "./blume-facts.ts"
import { kindGlyph } from "./blume-kinds.ts"

export {
  /**
   * @since 4.0.0
   * @category facts
   */
  factKind,
  /**
   * @since 4.0.0
   * @category config
   */
  kindGlyph
}

/**
 * The part of an Astro integration this package uses (structural: Astro is Blume's dependency).
 *
 * @since 4.0.0
 * @category models
 */
export interface AstroIntegration {
  readonly name: string
  readonly hooks: {
    readonly "astro:config:setup": (options: {
      readonly updateConfig: (config: object) => unknown
      readonly injectScript?: (stage: "page", content: string) => unknown
    }) => void
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
    "astro:config:setup": ({ injectScript, updateConfig }) => {
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
      // the facts tiles (spec §4.4): again after each client-side navigation
      injectScript?.(
        "page",
        `import { markFacts } from "effectscript/blume-facts"\nmarkFacts(document)\n` +
          `document.addEventListener("astro:page-load", () => markFacts(document))`
      )
    }
  }
})

const json = (file: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(new URL(`../blume/${file}`, import.meta.url), "utf8"))

/**
 * Blume's `theme` config: follows the reader's light or dark preference. Colours and fonts come
 * from `effectscript/blume/theme.css`.
 *
 * @since 4.0.0
 * @category config
 */
export const theme = { mode: "system", radius: "md" } as const

/**
 * Blume's `markdown` config: the signal-aware monochrome syntax themes (ADR-0078).
 *
 * @since 4.0.0
 * @category config
 */
export const markdown = {
  code: {
    icons: true,
    theme: {
      light: json("shiki/effectscript-light.json") as { readonly name: string },
      dark: json("shiki/effectscript-dark.json") as { readonly name: string }
    }
  }
} as const

/**
 * The optional `kind` key a page sets to show its construct badge, as a Standard Schema. It is
 * written by hand: Blume evaluates the config twice, and Effect Schema would load `effect` both times.
 */
const optionalString = {
  "~standard": {
    version: 1,
    vendor: "effectscript",
    validate: (value: unknown) =>
      value === undefined || typeof value === "string"
        ? { value }
        : { issues: [{ message: "kind must be a construct name, like \"error\" or \"service\"" }] }
  }
} as const

/**
 * Blume's `frontmatter` config: registers `kind`, which `PageHeader` shows as a construct badge.
 *
 * @since 4.0.0
 * @category config
 */
export const frontmatter = { extend: { kind: optionalString } } as const
