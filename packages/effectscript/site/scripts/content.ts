/**
 * Prepares the site's generated inputs (ADR-0054): brand assets copied from `brand/` (never
 * edited here), and, from Plan 16 Task 2 on, the generated docs pages. Run by `dev` and `build`.
 */
import * as fs from "node:fs"
import * as path from "node:path"

const site = path.join(import.meta.dirname, "..")
const brand = path.join(site, "../brand")

const copy = (from: string, to: string) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

export const brandAssets = () => {
  for (const font of fs.readdirSync(path.join(brand, "fonts")).filter((f) => /\.(otf|ttf)$/.test(f))) {
    copy(path.join(brand, "fonts", font), path.join(site, "public/fonts", font))
  }
  for (
    const icon of [
      "favicon.ico",
      "favicon.svg",
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
      "site.webmanifest"
    ]
  ) {
    copy(path.join(brand, "icons", icon), path.join(site, "public", icon))
  }
  copy(path.join(brand, "social/web/og-image.jpg"), path.join(site, "public/og-image.jpg"))
  for (const svg of ["effectscript-lockup-white.svg", "effectscript-mark-white.svg", "effectscript-mark.svg"]) {
    copy(path.join(brand, "logo/svg", svg), path.join(site, "src/assets", svg.replace("effectscript-", "")))
  }
}

const docs = path.join(site, "src/content/docs/docs")
const skill = path.join(site, "../core/skills/effectscript")
const corpus = path.join(site, "../effect-docs/content")
const github = "https://github.com/EffectScript-Lang/effect-lang/blob/effectscript"

/** The generated docs paths (gitignored; everything else under src/content/docs is hand-written). */
export const generated = [
  "reference",
  "guides/patterns",
  "guides/pitfalls.md",
  "guides/writing-effectscript.md",
  "effect"
]

const slug = (text: string) => text.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const page = (file: string, title: string, body: string, extra: Record<string, unknown> = {}) => {
  const front = Object.entries({ title, ...extra }).map(([k, v]) =>
    `${k}: ${typeof v === "object" ? JSON.stringify(v) : JSON.stringify(v)}`
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `---\n${front.join("\n")}\n---\n\n${body.trim()}\n`)
}

/** `## Heading` sections of a markdown file: the text before the first heading, and each section. */
const sections = (markdown: string) => {
  const parts = markdown.split(/^## /m)
  return {
    intro: parts[0]!.replace(/^# .*\n/m, "").trim(),
    sections: parts.slice(1).map((part) => {
      const newline = part.indexOf("\n")
      return { heading: part.slice(0, newline).trim(), body: part.slice(newline + 1) }
    })
  }
}

/** The playground link for a piece of EffectScript (base64url of its UTF-8). */
export const playgroundLink = (code: string) => `/playground/#code=${Buffer.from(code, "utf8").toString("base64url")}`

/** Adds an "Open in playground" link after each `efx` fence. */
const withPlaygroundLinks = (markdown: string) =>
  markdown.replace(
    /^```efx\n([\s\S]*?)^```$/gm,
    (fence, code: string) => `${fence}\n\n[Open in playground](${playgroundLink(code)})`
  )

/** The skill's links, as site routes. */
const skillLinks = (markdown: string) =>
  markdown
    .replaceAll("](references/syntax.md)", "](/docs/reference/effect/)")
    .replaceAll("](references/patterns.md)", "](/docs/guides/patterns/services-and-layers/)")
    .replaceAll("](references/pitfalls.md)", "](/docs/guides/pitfalls/)")
    .replaceAll("](references/effect-docs.md)", "](/docs/effect/guide/)")

/** Relative links in a corpus page point at the original files on GitHub. */
const githubLinks = (markdown: string, original: string) =>
  markdown.replace(
    /\]\((?!https?:|#|\/|mailto:)([^)\s]+)\)/g,
    (_, target: string) => `](${github}/${path.posix.normalize(path.posix.join(path.posix.dirname(original), target))})`
  )

const reference = () => {
  const { sections: constructs } = sections(fs.readFileSync(path.join(skill, "references/syntax.md"), "utf8"))
  constructs.forEach(({ body, heading }, order) => {
    const dir = /<!-- fixtures\/([\w-]+) -->/.exec(body)![1]!
    const title = heading.replace(/\s*\(§[^)]*\)$/, "")
    const intro =
      "Each example is EffectScript followed by the TypeScript it compiles to, from the compiler's own tests."
    page(
      path.join(docs, "reference", `${dir}.md`),
      title,
      `${intro}\n\n${withPlaygroundLinks(body.replace(/^###/gm, "##"))}`,
      {
        sidebar: { order }
      }
    )
  })
}

const guides = () => {
  const skillMd = fs.readFileSync(path.join(skill, "SKILL.md"), "utf8").replace(/^---[\s\S]*?---\n/, "")
  page(
    path.join(docs, "guides/writing-effectscript.md"),
    "Writing EffectScript",
    skillLinks(skillMd.replace(/^# .*\n/m, "")),
    {
      description: "The core rules, async ↔ effect, and Effect's best practices the EffectScript way.",
      sidebar: { order: 0 }
    }
  )
  const patterns = sections(fs.readFileSync(path.join(skill, "references/patterns.md"), "utf8"))
  patterns.sections.forEach(({ body, heading }, order) => {
    page(path.join(docs, "guides/patterns", `${slug(heading)}.md`), heading, `${withPlaygroundLinks(body)}`, {
      sidebar: { order: order + 2 }
    })
  })
  const pitfalls = fs.readFileSync(path.join(skill, "references/pitfalls.md"), "utf8").replace(/^# .*\n/m, "")
  page(path.join(docs, "guides/pitfalls.md"), "Pitfalls", pitfalls, { sidebar: { order: 1 } })
}

const walk = (dir: string, out: Array<string> = []): Array<string> => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** The first `# Title` of a markdown file, and the file without it. */
const titled = (markdown: string, fallback: string) => {
  const match = /^# (.+)$/m.exec(markdown)
  return match === null
    ? { title: fallback, body: markdown }
    : { title: match[1]!.trim(), body: markdown.replace(match[0], "") }
}

const effect = () => {
  const llms = fs.readFileSync(path.join(corpus, "LLMS.efx.md"), "utf8")
  page(
    path.join(docs, "effect/guide.md"),
    "Effect's guide, in EffectScript",
    githubLinks(titled(llms, "").body, "packages/effectscript/effect-docs/content/LLMS.efx.md"),
    {
      description: "Effect's own guide for agents (LLMS.md), with every example converted to EffectScript.",
      sidebar: { order: 0 }
    }
  )
  for (const file of walk(path.join(corpus, "guides"))) {
    const original = path.relative(path.join(corpus, "guides"), file).split(path.sep).join("/")
    const { body, title } = titled(fs.readFileSync(file, "utf8"), original)
    page(path.join(docs, "effect/guides", original.toLowerCase()), title, githubLinks(body, original))
  }
  for (const file of walk(path.join(corpus, "api"))) {
    const relative = path.relative(path.join(corpus, "api"), file).split(path.sep).join("/")
    // `@effect/x` would slug to `effect/x`, next to the `effect` package's own modules
    const target = relative.replace(/^@effect\//, "effect-").toLowerCase()
    const { body, title } = titled(fs.readFileSync(file, "utf8"), relative)
    page(path.join(docs, "effect/api", target), title, body)
  }
}

/** `llms.txt` (llmstxt.org) and `llms-full.txt`: the docs for agents, as plain text. */
const llms = () => {
  const base = "https://effectscript.dev"
  const reference = fs.readdirSync(path.join(docs, "reference")).sort().map((f) => {
    const title = /^title: (.*)$/m.exec(fs.readFileSync(path.join(docs, "reference", f), "utf8"))![1]!
    return `- [${JSON.parse(title)}](${base}/docs/reference/${f.replace(/\.md$/, "")}/)`
  })
  const text = [
    "# EffectScript",
    "",
    "> TypeScript with Effect as native syntax. Every .ts file is valid EffectScript (.efx), and every .efx file compiles to plain, idiomatic Effect v4 TypeScript.",
    "",
    "## Docs",
    "",
    `- [Install](${base}/docs/start/install/): the efx CLI, efx setup, efx init`,
    `- [Writing EffectScript](${base}/docs/guides/writing-effectscript/): core rules, async ↔ effect, best practices`,
    `- [Pitfalls](${base}/docs/guides/pitfalls/): mistakes and the diagnostics that catch them`,
    "",
    "## Language reference",
    "",
    ...reference,
    "",
    "## Effect, in EffectScript",
    "",
    `- [Effect's guide, in EffectScript](${base}/docs/effect/guide/): Effect's LLMS.md with EffectScript code`,
    "",
    "## Optional",
    "",
    `- [llms-full.txt](${base}/llms-full.txt): the agent skill and Effect's guide in one file`,
    ""
  ].join("\n")
  fs.writeFileSync(path.join(site, "public/llms.txt"), text)
  const full = [
    "SKILL.md",
    "references/syntax.md",
    "references/patterns.md",
    "references/pitfalls.md",
    "references/effect-docs.md"
  ]
    .map((f) => fs.readFileSync(path.join(skill, f), "utf8")).join("\n\n---\n\n")
  fs.writeFileSync(path.join(site, "public/llms-full.txt"), full)
}

/**
 * Writes every generated input of the site.
 *
 * @since 4.0.0
 */
export const generate = () => {
  for (const target of generated) fs.rmSync(path.join(docs, target), { recursive: true, force: true })
  brandAssets()
  reference()
  guides()
  effect()
  llms()
}

if (import.meta.main) generate()
