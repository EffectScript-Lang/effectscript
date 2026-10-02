/**
 * effectscript.dev (spec §9, ADR-0054): a static Astro site with Starlight docs at /docs, React
 * islands for the gallery toggle and the playground, and the `source.efx` grammar for code.
 */
import react from "@astrojs/react"
import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import * as fs from "node:fs"
import tsx from "shiki/langs/tsx.mjs"

const grammar = (file: string) =>
  JSON.parse(fs.readFileSync(new URL(`../vscode/syntaxes/${file}`, import.meta.url), "utf8"))

/** The EffectScript grammar of the VS Code extension (ADR-0041), for Shiki and Expressive Code. */
export const efxLanguages = [
  // the efx grammar includes source.tsx, so Shiki needs TSX loaded with it
  ...tsx,
  { ...grammar("effectscript.tmLanguage.json"), name: "efx", aliases: ["effectscript"], embeddedLangs: ["tsx"] },
  { ...grammar("effectscript.injection.tmLanguage.json"), name: "efx-injection", injectTo: ["source.efx"] }
]

export default defineConfig({
  site: "https://effectscript.dev",
  output: "static",
  integrations: [
    starlight({
      title: "EffectScript",
      description: "All of Effect. None of the ceremony.",
      logo: { src: "./src/assets/lockup-white.svg", replacesTitle: true },
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/EffectScript-Lang/effect-lang" },
        { icon: "x.com", label: "@gunta85", href: "https://x.com/gunta85" }
      ],
      customCss: ["./src/styles/starlight.css"],
      expressiveCode: { shiki: { langs: efxLanguages }, themes: ["dark-plus", "light-plus"] },
      sidebar: [
        { label: "Start here", items: [{ autogenerate: { directory: "docs/start" } }] },
        { label: "Guides", items: [{ autogenerate: { directory: "docs/guides" } }] },
        { label: "Language reference", items: [{ autogenerate: { directory: "docs/reference" } }] },
        { label: "Effect, in EffectScript", items: [{ autogenerate: { directory: "docs/effect" } }] }
      ],
      head: [
        { tag: "meta", attrs: { name: "theme-color", content: "#09090B" } },
        { tag: "meta", attrs: { property: "og:image", content: "https://effectscript.dev/og-image.jpg" } }
      ]
    }),
    react()
  ],
  vite: {
    plugins: [tailwindcss()],
    worker: { format: "es" }
  }
})
