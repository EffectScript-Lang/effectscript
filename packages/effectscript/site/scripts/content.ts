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

const docs = path.join(site, "src/content/docs/docs")
const skill = path.join(site, "../core/skills/effectscript")
const corpus = path.join(site, "../effect-docs/content")
const github = "https://github.com/EffectScript-Lang/effectscript/blob/effectscript"

/** The generated docs paths (gitignored; everything else under src/content/docs is hand-written). */
export const generated = [
  "reference",
  "guides/patterns",
  "guides/pitfalls.md",
  "guides/writing-effectscript.md",
  "guides/editor-setup.md",
  "guides/strict-rules.md",
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
      sidebar: { order: order + 10 }
    })
  })
  // Expressive Code ignores the skill's `wrong` meta, so the site titles those blocks (review I2)
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
    republished(githubLinks(titled(llms, "").body, "packages/effectscript/effect-docs/content/LLMS.efx.md")),
    {
      description: "Effect's own guide for agents (LLMS.md), with every example converted to EffectScript.",
      sidebar: { order: 0 }
    }
  )
  for (const file of walk(path.join(corpus, "guides"))) {
    const original = path.relative(path.join(corpus, "guides"), file).split(path.sep).join("/")
    const { body, title } = titled(fs.readFileSync(file, "utf8"), original)
    page(path.join(docs, "effect/guides", original.toLowerCase()), title, republished(githubLinks(body, original)))
  }
  for (const file of walk(path.join(corpus, "api"))) {
    const relative = path.relative(path.join(corpus, "api"), file).split(path.sep).join("/")
    // `@effect/x` would slug to `effect/x`, next to the `effect` package's own modules
    const target = relative.replace(/^@effect\//, "effect-").toLowerCase()
    const { body, title } = titled(fs.readFileSync(file, "utf8"), relative)
    page(path.join(docs, "effect/api", target), title, republished(body))
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
    `- [Strict rules](${base}/docs/guides/strict-rules/): every rule, with an example and the compiler's message`,
    `- [Migrating with efx convert](${base}/docs/guides/migrating/): converting an Effect TypeScript project`,
    `- [Editor setup](${base}/docs/guides/editor-setup/): VS Code, Neovim, Helix and any LSP client`,
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
export const generate = async () => {
  for (const target of generated) fs.rmSync(path.join(docs, target), { recursive: true, force: true })
  await brandAssets()
  reference()
  guides()
  effect()
  llms()
}

if (import.meta.main) await generate()
