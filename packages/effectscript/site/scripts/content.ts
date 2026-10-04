/**
 * Prepares the site's generated inputs (ADR-0054): brand assets copied from `brand/` (never
 * edited here), and, from Plan 16 Task 2 on, the generated docs pages. Run by `dev` and `build`.
 */
import { toTypeScript } from "effectscript/compiler"
import * as fs from "node:fs"
import * as path from "node:path"
// @ts-expect-error: subset-font ships no types
import subsetFont from "subset-font"

const site = path.join(import.meta.dirname, "..")
const brand = path.join(site, "../brand")

const copy = (from: string, to: string) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

/**
 * The characters the site's fonts keep (review I10): Latin, Latin-1, punctuation, arrows and the
 * few symbols the pages use, such as ƒ, ≡, ≤, ≥, →, ↔ and ▷.
 */
const fontText = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x192, 0x192],
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
  [0x25a0, 0x25ff]
].flatMap(([from, to]) => Array.from({ length: to! - from! + 1 }, (_, i) => String.fromCodePoint(from! + i))).join("")

export const brandAssets = async () => {
  const fonts = path.join(brand, "fonts")
  // from clean, so no full-size font from an older build ships
  fs.rmSync(path.join(site, "public/fonts"), { recursive: true, force: true })
  fs.mkdirSync(path.join(site, "public/fonts"), { recursive: true })
  for (const font of fs.readdirSync(fonts).filter((f) => /\.(otf|ttf)$/.test(f))) {
    const woff2: Buffer = await subsetFont(fs.readFileSync(path.join(fonts, font)), fontText, { targetFormat: "woff2" })
    fs.writeFileSync(path.join(site, "public/fonts", font.replace(/\.(otf|ttf)$/, ".woff2")), woff2)
  }
  for (const licence of fs.readdirSync(fonts).filter((f) => f.endsWith("-OFL.txt"))) {
    copy(path.join(fonts, licence), path.join(site, "public/fonts", licence))
  }
  // `curl -fsSL https://effectscript.dev/install | sh` (ADR-0038, review I3)
  copy(path.join(site, "../core/distribution/install.sh"), path.join(site, "public/install"))
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
  // the docs header's logo: Blume inlines it, and currentColor follows light and dark
  copy(path.join(brand, "logo/svg/effectscript-mark.svg"), path.join(site, "public/mark.svg"))
  // the landing page's key visuals and film stills, as WebP (brand/scripts/site.py, ADR-0082)
  fs.rmSync(path.join(site, "public/img/lp"), { recursive: true, force: true })
  for (const image of fs.readdirSync(path.join(brand, "web/lp")).filter((f) => f.endsWith(".webp"))) {
    copy(path.join(brand, "web/lp", image), path.join(site, "public/img/lp", image))
  }
  for (
    const svg of [
      "effectscript-lockup-white.svg",
      "effectscript-lockup-black.svg",
      "effectscript-mark-white.svg",
      "effectscript-mark.svg"
    ]
  ) {
    copy(path.join(brand, "logo/svg", svg), path.join(site, "src/assets", svg.replace("effectscript-", "")))
  }
}

/** Blume's content root, mounted at /docs (ADR-0079). */
const docs = path.join(site, "content")
const skill = path.join(site, "../core/skills/effectscript")
const corpus = path.join(site, "../effect-docs/content")
const github = "https://github.com/EffectScript-Lang/effectscript/blob/effectscript"

/** The generated docs paths (gitignored; everything else under content/ is hand-written). */
export const generated = [
  "reference",
  "guides/patterns",
  "guides/pitfalls.md",
  "guides/writing-effectscript.md",
  "guides/editor-setup.md",
  "guides/strict-rules.md",
  "guides/meta.ts",
  "start/meta.ts",
  "effect"
]

const slug = (text: string) => text.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const page = (file: string, title: string, body: string, extra: Record<string, unknown> = {}) => {
  // titles are plain text in the sidebar, the browser tab and llms.txt (review I13)
  const front = Object.entries({ title: title.replace(/`/g, ""), ...extra }).map(([k, v]) =>
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

/**
 * The playground link for a piece of EffectScript (base64url of its UTF-8). Absolute: Blume puts
 * `/docs` in front of every root link in the docs, and the playground lives outside it (ADR-0079).
 */
export const playgroundLink = (code: string) =>
  `https://effectscript.dev/playground#code=${Buffer.from(code, "utf8").toString("base64url")}`

/** Adds an "Open in playground" link after each `efx` fence. */
const withPlaygroundLinks = (markdown: string) =>
  markdown.replace(
    /^```efx\n([\s\S]*?)^```$/gm,
    (fence, code: string) => `${fence}\n\n[Open in playground](${playgroundLink(code)})`
  )

/** The skill's links, as site routes. */
const skillLinks = (markdown: string) =>
  markdown
    .replaceAll("](references/syntax.md)", "](/docs/reference/effect)")
    .replaceAll("](references/patterns.md)", "](/docs/guides/patterns/services-and-layers)")
    .replaceAll("](references/pitfalls.md)", "](/docs/guides/pitfalls)")
    .replaceAll("](references/effect-docs.md)", "](/docs/effect/guide)")

/**
 * Effect's pages, republished: without Effectful's own calls to action, which would read as ours,
 * and with credit to Effect (review I12).
 */
const republished = (markdown: string) =>
  `${
    markdown
      .replace(/^## Let's talk\n[\s\S]*?(?=^## |(?![\s\S]))/m, "")
      .replace(/, and talk to the core team/g, "")
      .trimEnd()
  }\n\n---\n\n_From [Effect](https://effect.website)'s documentation (MIT License, © Effectful Technologies Inc.), with its examples converted to EffectScript. EffectScript is a separate project, not an official Effect one._\n`

/**
 * Relative links in a corpus page: to the site's own page for another guide it publishes, else to
 * the original file on GitHub (Plan 21).
 */
const githubLinks = (markdown: string, original: string, published: ReadonlySet<string> = new Set()) =>
  markdown.replace(
    /\]\((?!https?:|#|\/|mailto:)([^)\s]+)\)/g,
    (_, link: string) => {
      const [target, anchor] = link.split("#") as [string, string | undefined]
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(original), target))
      const hash = anchor === undefined ? "" : `#${anchor}`
      return published.has(resolved)
        ? `](/docs/effect/guides/${resolved.toLowerCase().replace(/\.md$/, "")}${hash})`
        : `](${github}/${resolved}${hash})`
    }
  )

/** A heading's anchor, as Blume makes it (github-slugger, in its heading-anchors plugin). */
const anchorOf = (heading: string) =>
  heading.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-")

/**
 * A link to a heading the page doesn't have becomes plain text: upstream's own pages have a few
 * (Plan 21).
 */
const withoutDanglingAnchors = (markdown: string) => {
  const anchors = new Set(
    [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map((m) =>
      anchorOf(m[1]!.replace(/`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"))
    )
  )
  return markdown.replace(
    /\[([^\]]+)\]\(#([^)\s]+)\)/g,
    (link, text: string, anchor: string) => anchors.has(decodeURIComponent(anchor)) ? link : text
  )
}

const reference = () => {
  const { sections: constructs } = sections(fs.readFileSync(path.join(skill, "references/syntax.md"), "utf8"))
  constructs.forEach(({ body, heading }, order) => {
    const dir = /<!-- fixtures\/([\w-]+) -->/.exec(body)![1]!
    const title = heading.replace(/\s*\(§[^)]*\)$/, "")
    const intro = [
      "Each example is EffectScript followed by the TypeScript it compiles to, from the compiler's own tests.",
      // ADR-0080: the site draws `|>` as a ligature
      ...(dir === "pipeline"
        // plain text, not code, so the note itself shows the two characters
        ? ["Code on this site draws |> as a ▷ ligature. You type |>, and copying gives |>."]
        : [])
    ].join("\n\n")
    page(
      path.join(docs, "reference", `${dir}.md`),
      title,
      `${intro}\n\n${withPlaygroundLinks(body.replace(/^###/gm, "##"))}`,
      {
        // the construct badge (spec §4.3)
        kind: dir,
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
      sidebar: { order: order + 10 }
    })
  })
  // code blocks don't know the skill's `wrong` meta, so the site titles those blocks (review I2)
  const pitfalls = fs.readFileSync(path.join(skill, "references/pitfalls.md"), "utf8").replace(/^# .*\n/m, "")
    .replace(
      /^```efx wrong( EFX\d+)?$/gm,
      (_, code: string | undefined) => `\`\`\`efx title="Wrong${code ? `:${code}` : ""}"`
    )
    .replace("Blocks marked `efx wrong` show the mistake", "Blocks titled “Wrong” show the mistake")
  page(path.join(docs, "guides/pitfalls.md"), "Pitfalls", pitfalls, { sidebar: { order: 2 } })
  editorSetup()
  strictRules()
}

/** Editor setup: VS Code through `efx setup`, then the language server's README section. */
const editorSetup = () => {
  const readme = fs.readFileSync(path.join(site, "../language/README.md"), "utf8")
  const section = /^## Editor setup\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme)![1]!
  const body = [
    "`efx setup` finds the editors on your machine and sets each one up, after asking. This page is",
    "what it does, so you can do it by hand.",
    "",
    "**VS Code, Cursor, VSCodium and Windsurf:** the EffectScript extension. `efx setup` installs it;",
    "it adds highlighting, the language features and the `await` guardrails.",
    "",
    "**Every other editor** talks to `efx lsp`, the EffectScript language server over stdio.",
    "",
    githubLinks(section, "packages/effectscript/language/README.md")
  ].join("\n")
  page(path.join(docs, "guides/editor-setup.md"), "Editor setup", body, {
    description: "VS Code and its forks, Neovim, Helix, and any LSP client.",
    sidebar: { order: 3 }
  })
}

/**
 * One example per strict rule. The page shows what the compiler itself reports for each, so it
 * can't drift from the rules (review I11).
 */
const strictExamples: ReadonlyArray<readonly [code: string, title: string, source: string]> = [
  ["EFX8001", "An effect that is never run", `effect main() {\n  sleep("1 second")\n}`],
  [
    "EFX8003",
    "Running an effect inside an effect",
    `import { Effect } from "effect"\n\neffect main() {\n  Effect.runPromise(sleep("1 second"))\n}`
  ],
  ["EFX8004", "Throwing a primitive", `effect main() {\n  throw "boom"\n}`],
  [
    "EFX8005",
    "`catch (e: any)`",
    `effect main() {\n  try {\n    await sleep("1 second")\n  } catch (e: any) {\n    console.error(e)\n  }\n}`
  ],
  [
    "EFX8101",
    "Effect TypeScript written by hand",
    `import { Effect } from "effect"\n\nexport const main = Effect.gen(function*() {\n  yield* Effect.sleep("1 second")\n})`
  ],
  [
    "EFX8102",
    "Promises inside `effect` code",
    `effect main() {\n  const one = new Promise((resolve) => resolve(1))\n}`
  ],
  ["EFX8103", "`throw new Error(…)`", `effect main() {\n  throw new Error("boom")\n}`],
  ["EFX8104", "Explicit `any`", `export const id = (x: any) => x`],
  ["EFX8105", "Timers", `effect main() {\n  setTimeout(() => {}, 10)\n}`],
  ["EFX8106", "`fetch`", `effect main() {\n  const response = fetch("https://example.com")\n}`],
  ["EFX8107", "Promise combinators", `effect main() {\n  const both = Promise.all([])\n}`],
  ["EFX8108", "`JSON.parse`", `effect main() {\n  const data = JSON.parse("{}")\n}`],
  ["EFX8109", "`new Date()`", `effect main() {\n  const now = new Date()\n}`],
  ["EFX8110", "A nullable type in a service", `service Users {\n  effect find(id: string): string | undefined\n}`],
  ["EFX8111", "`await` on a Promise", `effect main() {\n  const response = await fetch("https://example.com")\n}`],
  [
    "EFX8112",
    "`await` on an array built at runtime",
    `effect main(ids: ReadonlyArray<string>) {\n  await ids.map((id) => sleep("1 second"))\n}`
  ]
]

const strictRules = () => {
  const rules = strictExamples.map(([code, title, source]) => {
    const reported = toTypeScript(source, { filename: "example.efx" }).diagnostics
    const own = reported.find((d) => d.code === code)
    if (own === undefined) throw new Error(`the strict-rules example for ${code} doesn't report it`)
    return [
      `## ${code}: ${title}`,
      "",
      `\`\`\`efx title="Wrong: ${code}"`,
      source,
      "```",
      "",
      ...reported.map((d) =>
        `- **${d.code}** (${d.severity}): ${d.message}${d.hint === undefined ? "" : `. Fix: ${d.hint}.`}`
      ),
      ""
    ].join("\n")
  })
  const body = [
    "EffectScript holds `effect` code to one way of doing each thing. Errors stop the build; warnings",
    "don't, unless the file starts with `// @efx strict` or the project sets `strict: true`, which turn",
    "them into errors. Each rule below shows a wrong example and exactly what the compiler reports for",
    "it. The same diagnostics appear in your editor as you type.",
    "",
    ...rules
  ].join("\n")
  page(path.join(docs, "guides/strict-rules.md"), "Strict rules", body, {
    description: "Every strict rule, with an example and the compiler's own message.",
    sidebar: { order: 4 }
  })
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
    republished(
      withPlaygroundLinks(githubLinks(titled(llms, "").body, "packages/effectscript/effect-docs/content/LLMS.efx.md"))
    ),
    {
      description: "Effect's own guide for agents (LLMS.md), with every example converted to EffectScript.",
      sidebar: { order: 0 }
    }
  )
  const guideFiles = walk(path.join(corpus, "guides"))
  const published = new Set(
    guideFiles.map((file) => path.relative(path.join(corpus, "guides"), file).split(path.sep).join("/"))
  )
  for (const file of guideFiles) {
    const original = path.relative(path.join(corpus, "guides"), file).split(path.sep).join("/")
    const { body, title } = titled(fs.readFileSync(file, "utf8"), original)
    page(
      path.join(docs, "effect/guides", original.toLowerCase()),
      title,
      republished(withPlaygroundLinks(withoutDanglingAnchors(githubLinks(body, original, published))))
    )
  }
  for (const file of walk(path.join(corpus, "api"))) {
    const relative = path.relative(path.join(corpus, "api"), file).split(path.sep).join("/")
    // `@effect/x` would slug to `effect/x`, next to the `effect` package's own modules
    const target = relative.replace(/^@effect\//, "effect-").toLowerCase()
    const { body, title } = titled(fs.readFileSync(file, "utf8"), relative)
    page(path.join(docs, "effect/api", target), title, republished(withPlaygroundLinks(body)))
  }
}

/** A sidebar group's `meta.ts` (Blume's folder meta), for a generated folder. */
const meta = (dir: string, fields: Record<string, unknown>) => {
  fs.mkdirSync(path.join(docs, dir), { recursive: true })
  fs.writeFileSync(
    path.join(docs, dir, "meta.ts"),
    `import { defineMeta } from "blume"\n\nexport default defineMeta(${JSON.stringify(fields, null, 2)})\n`
  )
}

/**
 * The sidebar: the four sections, in order, with their groups' labels. A generated folder's own
 * subfolders are capitalized (`migration` → Migration); their subfolders are package and module
 * names, kept as they are (Plan 21).
 */
const sidebar = () => {
  meta("start", { title: "Start here", order: 0 })
  meta("guides", {
    title: "Guides",
    order: 1,
    pages: ["writing-effectscript", "migrating", "pitfalls", "editor-setup", "strict-rules", "patterns"]
  })
  meta("guides/patterns", { title: "Patterns", collapsed: true })
  meta("reference", { title: "Language reference", order: 2 })
  meta("effect", { title: "Effect, in EffectScript", order: 3, pages: ["guide", "guides", "api"] })
  meta("effect/guides", { title: "Guides", collapsed: true })
  meta("effect/api", { title: "API examples", collapsed: true })
  for (const section of ["effect/guides", "effect/api"]) {
    const subfolders = (dir: string) =>
      fs.readdirSync(path.join(docs, dir), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    for (const name of subfolders(section)) {
      meta(`${section}/${name}`, { title: `${name[0]!.toUpperCase()}${name.slice(1)}`, collapsed: true })
      const walkNames = (dir: string) => {
        for (const child of subfolders(dir)) {
          meta(`${dir}/${child}`, { title: child, collapsed: true })
          walkNames(`${dir}/${child}`)
        }
      }
      walkNames(`${section}/${name}`)
    }
  }
}

/**
 * Writes every generated input of the site.
 *
 * @since 4.0.0
 */
export const generate = async () => {
  for (const target of generated) fs.rmSync(path.join(docs, target), { recursive: true, force: true })
  await brandAssets()
  reference()
  guides()
  effect()
  sidebar()
}

if (import.meta.main) await generate()
