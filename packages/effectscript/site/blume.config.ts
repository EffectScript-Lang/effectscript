/**
 * effectscript.dev (ADR-0079): one Blume project. The docs are generated into `content/` by
 * `scripts/content.ts` and mounted at /docs; the landing page, the playground and the teaser are
 * custom pages in `pages/`. The look is the public EffectScript theme, `effectscript/blume`.
 */
import { defineConfig } from "blume"
import { effectscript, frontmatter, markdown, theme } from "effectscript/blume"

export default defineConfig({
  title: "EffectScript",
  description: "All of Effect. None of the ceremony.",
  // the ƒx mark (currentColor, so it follows light and dark) and the name, set like the wordmark
  logo: { image: "/mark.svg", text: "EffectScript", href: "/" },
  basePath: "/docs",
  content: { root: "content" },
  theme,
  markdown,
  frontmatter,
  github: {
    owner: "EffectScript-Lang",
    repo: "effectscript",
    branch: "effectscript",
    dir: "packages/effectscript/site"
  },
  footer: { socials: { x: "https://x.com/gunta85" } },
  navigation: {
    sidebar: { display: "group" },
    tabs: [
      { label: "Guides", path: "/" },
      { label: "Reference", path: "/reference" },
      { label: "Effect", path: "/effect" }
    ],
    // absolute: the playground is a custom page outside /docs, which Blume would otherwise prefix
    cta: { label: "Playground", href: "https://effectscript.dev/playground" }
  },
  deployment: { site: "https://effectscript.dev" },
  integrations: [effectscript()]
})
