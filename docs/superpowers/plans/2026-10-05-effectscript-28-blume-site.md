# EffectScript Plan 28: effectscript.dev on Blume, with the Signature theme

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Work in the worktree
> `.claude/worktrees/blume-site` (branch `effectscript-blume-site`). Commit with explicit paths.

**Goal:** Replace Starlight with Blume for the whole of effectscript.dev, and ship the EffectScript
"Signature" theme as `effectscript/blume`, so that `efx init` projects get it too.

**Architecture:**
- The theme lives in the `effectscript` core package. It is made of:
  - plain config objects: `theme`, `markdown`, `frontmatter`, `navigation`;
  - the extended `effectscript()` Astro integration, which registers the grammars and injects the
    facts enhancer;
  - three `.astro` layout parts;
  - `theme.css`, with tokens, fonts and component styles.
- The site becomes one Blume project: docs at `/docs` through `basePath`, plus custom pages for `/`,
  `/playground` and `/soon`.
- Colour comes only from the signal tokens (ADR-0078). Code uses JetBrains Mono with its ligatures on
  (ADR-0080).

**Tech Stack:** Blume 2.1.1 (Astro 7, the Sätteri Markdown processor, Shiki 4, Tailwind 4), Vitest,
happy-dom, subset-font, Cloudflare Workers via the `cf` CLI.

**Spec:** `docs/superpowers/specs/2026-10-05-effectscript-blume-theme-design.md` (ADR-0078,
ADR-0079, ADR-0080). Read it before starting.

## Global Constraints

- Blume is pinned to exactly `2.1.1`, never a range, in the site and in the `efx init` scaffold.
- Signal colours:
  - Dark: Pass `#4ADE80`, Fail `#F87171`, Warn `#FACC15`, Need `#60A5FA`.
  - Light: Pass `#15803D`, Fail `#B91C1C`, Warn `#854D0E`, Need `#1D4ED8`.
  - Signals only mean state. Always pair one with a label or glyph (✓ ! ▲ ◇).
  - No signal on the mark, wordmark, headlines, buttons or page grounds.
- Brand tokens: Ink `#09090B`, Tile `#18181A`, Line `#27272A`, Subtle `#A1A1AA`, White `#FFFFFF`.
  Muted is `#8E8E96` on dark, so small text passes AA.
- Fonts: Inter Display (600/700) for headings, Inter (400/500) for body, JetBrains Mono (400/500) for
  code.
- Ligatures: code uses `font-variant-ligatures: contextual common-ligatures`, and Monaco uses
  `fontLigatures: true`.
- `// LABELS`: mono, uppercase, +6% tracking.
- `efx docs` Markdown output does not change.
- Links on the site are slashless (`/docs/start/install`, `/playground`).
- No Starlight or Expressive Code package remains anywhere.
- Validation (`.agents/AGENTS.md`): `pnpm lint-fix`, targeted `pnpm test --run <file>`, `pnpm check`.
  Never run bare `pnpm test`.
- Every decision not already covered by ADR-0078/0079/0080 gets an ADR in the same commit.

## Review Focus

1. **A visitor on an old slashed URL** (`/docs/`, `/docs/start/install/`, `/soon/`) lands on the
   page, not a 404. This is pinned in Task 7 (gate tests) and Task 6 (link check).
2. **A table that only looks like facts** (a user's own two-column table with a "Returns" row but a
   real header) stays a plain table. Pinned in Task 4.
3. **Client-side navigation:** after Blume swaps pages without a reload, the facts on the new page
   are still marked. Pinned in Task 4 (the enhancer re-runs on `astro:page-load`).
4. **A subset font loses its ligatures:** `|>` in `dist` must still form the ▷ glyph after
   subsetting. Pinned in Task 3 (theme fonts) and Task 6 (site fonts).
5. **Light mode:** every token and signal passes AA on both light grounds as well as the dark ones,
   and the logo swaps. Pinned in Task 3 (contrast test) and Task 6 (both lockups in the HTML).

---

### Task 1: Grammar scopes for return types, `throws` and `needs` clauses

**Files:**
- Modify: `packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json`
- Copy to: `packages/effectscript/core/grammars/effectscript.injection.tmLanguage.json`
- Modify: `packages/effectscript/core/package.json` (devDependency `shiki: "~4.4.3"`)
- Create: `packages/effectscript/core/test/blume-grammar.test.ts`
- Create: `docs/adr/0081-signature-clause-scopes.md`, plus its index row

**Interfaces:**
- Produces these scopes, which Task 2's themes colour:
  - `meta.return-type.efx entity.name.type.efx` on the type after `):` when `throws`, `needs`, `{`
    or the end of the line follows;
  - `meta.throws-clause.efx entity.name.type.efx` on each type name after `throws`;
  - `meta.needs-clause.efx entity.name.type.efx` on each name after `needs`.
  - The keywords keep `keyword.other.throws.efx`.

- [ ] **Step 1: Write the failing test** (`core/test/blume-grammar.test.ts`)

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import { createHighlighter } from "shiki"
import { describe, expect, it } from "vitest"

const grammars = path.join(import.meta.dirname, "../grammars")
const grammar = (f: string) => JSON.parse(fs.readFileSync(path.join(grammars, f), "utf8"))

const scopesOf = async (code: string) => {
  const h = await createHighlighter({
    themes: ["dark-plus"],
    langs: [
      "tsx",
      { ...grammar("effectscript.injection.tmLanguage.json"), name: "efx-injection", injectTo: ["source.efx"] },
      { ...grammar("effectscript.tmLanguage.json"), name: "efx", embeddedLangs: ["tsx"] }
    ]
  })
  const out = new Map<string, string>()
  for (const line of h.codeToTokensBase(code, { lang: "efx", theme: "dark-plus", includeExplanation: true })) {
    for (const t of line) {
      for (const e of t.explanation ?? []) out.set(e.content.trim(), e.scopes.map((s) => s.scopeName).join(" "))
    }
  }
  return out
}

describe("efx signature scopes (ADR-0081)", () => {
  it("scopes the return type, each thrown error and each needed service", async () => {
    const s = await scopesOf(
      "export effect loadUser(id: string): User throws UserNotFound | Timeout needs Database {\n}"
    )
    expect(s.get("User")).toContain("meta.return-type.efx")
    expect(s.get("UserNotFound")).toContain("meta.throws-clause.efx")
    expect(s.get("Timeout")).toContain("meta.throws-clause.efx")
    expect(s.get("Database")).toContain("meta.needs-clause.efx")
    expect(s.get("throws")).toContain("keyword.other.throws.efx")
    expect(s.get("needs")).toContain("keyword.other.throws.efx")
  })

  it("scopes service members and generic types", async () => {
    const s = await scopesOf("service Users {\n  effect all(): ReadonlyArray<User> throws DbError\n}")
    expect(s.get("ReadonlyArray<User>") ?? s.get("ReadonlyArray")).toContain("meta.return-type.efx")
    expect(s.get("DbError")).toContain("meta.throws-clause.efx")
  })

  it("leaves parameter types and ordinary code alone", async () => {
    const s = await scopesOf("export effect f(id: UserId): User {\n  const x = a ? b : c\n}")
    expect(s.get("UserId") ?? "").not.toContain("meta.return-type.efx")
    expect(s.get("c") ?? "").not.toContain("meta.return-type.efx")
  })
})
```

- [ ] **Step 2: Run it and check that it fails**

Run: `pnpm add -D shiki@~4.4.3 --filter effectscript && pnpm test --run packages/effectscript/core/test/blume-grammar.test.ts`
Expected: FAIL, because `User` has no `meta.return-type.efx`.

- [ ] **Step 3: Add the rules to the VS Code grammar**

In `effectscript.injection.tmLanguage.json`, add `{ "include": "#return-type" }` before
`#return-clauses` in `patterns`, and replace the `return-clauses` repository entry with:

```json
"return-type": {
  "match": "(?<=\\))\\s*(:)\\s*([A-Za-z_$][\\w$.]*(?:<[^{}()]*?>)?(?:\\[\\])*)(?=\\s+(?:throws|needs)\\b|\\s*\\{|\\s*$)",
  "captures": {
    "1": { "name": "keyword.operator.type.annotation.efx" },
    "2": { "name": "meta.return-type.efx entity.name.type.efx" }
  }
},
"return-clauses": {
  "patterns": [
    {
      "match": "\\b(throws)\\s+([A-Za-z_$][\\w$.]*(?:<[^{}()]*?>)?(?:\\s*\\|\\s*[A-Za-z_$][\\w$.]*(?:<[^{}()]*?>)?)*)",
      "captures": {
        "1": { "name": "keyword.other.throws.efx" },
        "2": { "name": "meta.throws-clause.efx entity.name.type.efx" }
      }
    },
    {
      "match": "\\b(needs)\\s+([A-Za-z_$][\\w$.]*(?:\\s*[|,&]\\s*[A-Za-z_$][\\w$.]*)*)",
      "captures": {
        "1": { "name": "keyword.other.throws.efx" },
        "2": { "name": "meta.needs-clause.efx entity.name.type.efx" }
      }
    },
    { "match": "\\b(throws|needs)\\b(?=\\s+[({\\[])", "captures": { "1": { "name": "keyword.other.throws.efx" } } }
  ]
}
```

Then copy the file into `core/grammars/`, because `blume.test.ts` checks that the two are
byte-identical: `cp packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json packages/effectscript/core/grammars/`.
If the zed or tree-sitter packages have grammar parity tests, run them too.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `pnpm test --run packages/effectscript/core/test/blume-grammar.test.ts packages/effectscript/core/test/blume.test.ts packages/effectscript/vscode`
Expected: PASS. If the tokenizer splits `ReadonlyArray<User>` differently, adjust the assertion to the
token that carries the scope, not the regex.

- [ ] **Step 5: Write ADR-0081 and commit**

ADR-0081, "The grammar scopes an effect's success, error and requirement types": why the clauses get
their own scopes (the A/E/R colouring in ADR-0078, in the editor and on the site), the regex limits
(single-line signatures; nested generics with braces are not matched), and the alternatives (a
semantic-token provider in the language server, which comes later).

```bash
git add packages/effectscript/vscode/syntaxes/effectscript.injection.tmLanguage.json packages/effectscript/core/grammars packages/effectscript/core/package.json pnpm-lock.yaml packages/effectscript/core/test/blume-grammar.test.ts docs/adr/0081-signature-clause-scopes.md docs/adr/README.md
git commit -m "feat(effectscript): grammar scopes for return types, throws and needs clauses (ADR-0081)"
```

---

### Task 2: The signal-aware monochrome syntax themes

**Files:**
- Create: `packages/effectscript/core/blume/shiki/effectscript-dark.json`
- Create: `packages/effectscript/core/blume/shiki/effectscript-light.json`
- Create: `packages/effectscript/core/test/blume-themes.test.ts`

**Interfaces:**
- Consumes: Task 1's scopes.
- Produces: two Shiki theme JSON files named `effectscript-dark` / `effectscript-light`, loaded by
  Task 4's `markdown` export and by the site's `highlight.ts` and Playground.

- [ ] **Step 1: Write the failing test**

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const dir = path.join(import.meta.dirname, "../blume/shiki")
const theme = (mode: "dark" | "light") =>
  JSON.parse(fs.readFileSync(path.join(dir, `effectscript-${mode}.json`), "utf8"))
const signals = {
  dark: { pass: "#4ade80", fail: "#f87171", need: "#60a5fa" },
  light: { pass: "#15803d", fail: "#b91c1c", need: "#1d4ed8" }
}
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) > 16
}

describe("effectscript syntax themes (ADR-0078)", () => {
  for (const mode of ["dark", "light"] as const) {
    it(`${mode}: colours only the three signature clauses`, () => {
      const t = theme(mode)
      const colourOf = (scope: string) =>
        t.tokenColors.find((c: any) => [c.scope].flat().includes(scope))?.settings.foreground?.toLowerCase()
      expect(colourOf("meta.return-type.efx")).toBe(signals[mode].pass)
      expect(colourOf("meta.throws-clause.efx")).toBe(signals[mode].fail)
      expect(colourOf("meta.needs-clause.efx")).toBe(signals[mode].need)
      const coloured = t.tokenColors.filter((c: any) => c.settings.foreground && hue(c.settings.foreground))
      expect(coloured.flatMap((c: any) => [c.scope].flat()).sort()).toEqual(
        ["meta.needs-clause.efx", "meta.return-type.efx", "meta.throws-clause.efx"]
      )
    })
  }
})
```

- [ ] **Step 2: Run it and check that it fails**

Run: `pnpm test --run packages/effectscript/core/test/blume-themes.test.ts`
Expected: FAIL with ENOENT.

- [ ] **Step 3: Write the two themes**

`effectscript-dark.json`:

```json
{
  "name": "effectscript-dark",
  "type": "dark",
  "colors": { "editor.background": "#0b0b0d", "editor.foreground": "#e4e4e7" },
  "tokenColors": [
    { "scope": ["comment", "punctuation.definition.comment"], "settings": { "foreground": "#71717a", "fontStyle": "italic" } },
    { "scope": ["keyword", "storage", "storage.type", "keyword.control.effect.efx", "keyword.other.throws.efx", "keyword.operator.pipeline.efx"], "settings": { "foreground": "#ffffff", "fontStyle": "bold" } },
    { "scope": ["entity.name.type", "support.type", "support.class", "entity.name.class"], "settings": { "foreground": "#f4f4f5" } },
    { "scope": ["entity.name.function", "support.function"], "settings": { "foreground": "#ffffff" } },
    { "scope": ["string", "constant.numeric", "constant.language", "constant.character"], "settings": { "foreground": "#a1a1aa" } },
    { "scope": ["variable", "variable.parameter", "meta.object-literal.key"], "settings": { "foreground": "#d4d4d8" } },
    { "scope": ["punctuation", "meta.brace", "keyword.operator"], "settings": { "foreground": "#8e8e96" } },
    { "scope": "meta.return-type.efx", "settings": { "foreground": "#4ade80" } },
    { "scope": "meta.throws-clause.efx", "settings": { "foreground": "#f87171" } },
    { "scope": "meta.needs-clause.efx", "settings": { "foreground": "#60a5fa" } }
  ]
}
```

`effectscript-light.json` is the same, with `"type": "light"`, background `#fafafa`, foreground
`#27272a`, and the greys and signals swapped:

| Scope group | Light value |
| --- | --- |
| comments | `#71717a` |
| keywords | `#09090b` |
| types | `#18181b` |
| functions | `#09090b` |
| strings | `#52525b` |
| variables | `#3f3f46` |
| punctuation | `#71717a` |
| return type | `#15803d` |
| throws clause | `#b91c1c` |
| needs clause | `#1d4ed8` |

Keep the light theme's `name` as `effectscript-light`.

- [ ] **Step 4: Run it and check that it passes**

Run: `pnpm test --run packages/effectscript/core/test/blume-themes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core/blume/shiki packages/effectscript/core/test/blume-themes.test.ts
git commit -m "feat(effectscript): signal-aware monochrome syntax themes for Blume (ADR-0078)"
```

---

### Task 3: `theme.css`, the brand fonts and the package exports

**Files:**
- Create: `packages/effectscript/core/scripts/theme-fonts.ts`
- Create (generated, checked in): `packages/effectscript/core/blume/fonts/{InterDisplay-SemiBold,InterDisplay-Bold,Inter-Regular,Inter-Medium,JetBrainsMono-Regular,JetBrainsMono-Medium}.woff2`, plus the two `*-OFL.txt` licences
- Create: `packages/effectscript/core/blume/theme.css`
- Modify: `packages/effectscript/core/package.json`:
  - `exports`: add `"./blume/*": "./blume/*"` before `"./*"`, in both `exports` and `publishConfig.exports`;
  - `files`: add `"blume/**"`;
  - devDependency `subset-font`;
  - script `"theme-fonts": "node scripts/theme-fonts.ts"`.
- Create: `packages/effectscript/core/test/blume-theme-css.test.ts`

**Interfaces:**
- Produces:
  - `effectscript/blume/theme.css`: `@font-face` for the three families (named `"Inter Display"`,
    `"Inter"` and `"JetBrains Mono"`), plus the tokens.
  - Brand tokens mapped onto `--blume-*`, for light under `:root` and dark under
    `:root[data-theme="dark"]`.
  - Signal tokens `--efx-pass/fail/warn/need`, each with a `-tint` variant.
  - Styles for: `[data-efx-fact="a|e|r"]` rows, `.efx-kind` badges, `.efx-version` pills, the
    headline fade on `h1`, the canvas, and callouts.

- [ ] **Step 1: Write the failing test**

```ts
import * as fs from "node:fs"
import * as path from "node:path"
import subsetFont from "subset-font"
import { describe, expect, it } from "vitest"

const blume = path.join(import.meta.dirname, "../blume")
const css = fs.readFileSync(path.join(blume, "theme.css"), "utf8")
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  return css.slice(start, css.indexOf("}", start))
}
const token = (selector: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block(selector))![1]!
const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

describe("the EffectScript Blume theme CSS (ADR-0078)", () => {
  const modes = { light: ":root", dark: ":root[data-theme=\"dark\"]" } as const
  for (const [mode, selector] of Object.entries(modes)) {
    it(`${mode}: every text token passes WCAG AA on the background and the muted surface`, () => {
      const grounds = [token(selector, "--blume-background"), token(selector, "--blume-muted")]
      for (const name of ["--blume-foreground", "--blume-muted-foreground", "--efx-pass", "--efx-fail", "--efx-warn", "--efx-need"]) {
        for (const ground of grounds) {
          expect(contrast(token(selector, name), ground), `${mode} ${name} on ${ground}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
  }

  it("uses the brand's exact signal values", () => {
    expect(token(modes.dark, "--efx-fail").toLowerCase()).toBe("#f87171")
    expect(token(modes.light, "--efx-warn").toLowerCase()).toBe("#854d0e")
  })

  it("turns code ligatures on (ADR-0080)", () => {
    expect(css).toMatch(/font-variant-ligatures:\s*contextual common-ligatures/)
    expect(css).not.toMatch(/font-variant-ligatures:\s*none/)
  })

  it("ships subset fonts that still form the |> ligature", async () => {
    const font = fs.readFileSync(path.join(blume, "fonts/JetBrainsMono-Regular.woff2"))
    expect(font.length).toBeLessThan(120_000)
    // the shipped subset still has the glyph the `|>` ligature maps to
    const { create } = await import("fontkit")
    const f = create(font) as any
    const run = f.layout("|>", ["calt"])
    expect(run.glyphs.length).toBe(2)
    expect(run.glyphs.map((g: any) => g.name).join(" ")).toMatch(/bar_greater/)
  })
})
```

`fontkit` is a devDependency for this test (`pnpm add -D fontkit --filter effectscript`). If its
glyph names differ, assert that the glyph ids differ from those of the unligated `|` and `>`.

- [ ] **Step 2: Run it and check that it fails**

Run: `pnpm test --run packages/effectscript/core/test/blume-theme-css.test.ts`
Expected: FAIL with ENOENT for `theme.css`.

- [ ] **Step 3: Write `scripts/theme-fonts.ts`**

```ts
/**
 * The theme's fonts (ADR-0079, ADR-0080): the brand fonts, subset to the characters docs use, as
 * WOFF2. Layout features stay, so JetBrains Mono keeps its `calt` ligatures (`|>` → ▷).
 * Run with `pnpm --filter effectscript theme-fonts` after the brand fonts change.
 */
import * as fs from "node:fs"
import * as path from "node:path"
// @ts-expect-error: subset-font ships no types
import subsetFont from "subset-font"

const core = path.join(import.meta.dirname, "..")
const brand = path.join(core, "../brand/fonts")
const out = path.join(core, "blume/fonts")
const ranges = [[0x20, 0x7e], [0xa0, 0xff], [0x192, 0x192], [0x2010, 0x2027], [0x2030, 0x203a], [0x2190, 0x21ff], [0x2200, 0x22ff], [0x25a0, 0x25ff]]
const text = ranges.flatMap(([a, b]) => Array.from({ length: b! - a! + 1 }, (_, i) => String.fromCodePoint(a! + i))).join("")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
for (const font of fs.readdirSync(brand).filter((f) => /\.(otf|ttf)$/.test(f))) {
  const woff2: Buffer = await subsetFont(fs.readFileSync(path.join(brand, font)), text, { targetFormat: "woff2" })
  fs.writeFileSync(path.join(out, font.replace(/\.(otf|ttf)$/, ".woff2")), woff2)
}
for (const licence of fs.readdirSync(brand).filter((f) => f.endsWith("-OFL.txt"))) {
  fs.copyFileSync(path.join(brand, licence), path.join(out, licence))
}
```

Run it with `pnpm --filter effectscript theme-fonts`. If the brand folder lacks
`JetBrainsMono-Medium` or `InterDisplay-SemiBold`, ship what exists and declare only those weights.

- [ ] **Step 4: Write `blume/theme.css`**

The full file:
- `@font-face` blocks with `src: url("./fonts/<file>.woff2") format("woff2")` and `font-display: swap`.
- Light tokens under `:root` and dark tokens under `:root[data-theme="dark"]`. Blume declares its own
  dark values at that selector, so both blocks are needed.
- The component rules.

```css
/* EffectScript for Blume (ADR-0078, ADR-0079, ADR-0080). Import from a project's theme.css. */
@font-face { font-family: "Inter Display"; font-weight: 600; font-display: swap; src: url("./fonts/InterDisplay-SemiBold.woff2") format("woff2"); }
@font-face { font-family: "Inter Display"; font-weight: 700; font-display: swap; src: url("./fonts/InterDisplay-Bold.woff2") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 400; font-display: swap; src: url("./fonts/Inter-Regular.woff2") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 500; font-display: swap; src: url("./fonts/Inter-Medium.woff2") format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; font-display: swap; src: url("./fonts/JetBrainsMono-Regular.woff2") format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 500; font-display: swap; src: url("./fonts/JetBrainsMono-Medium.woff2") format("woff2"); }

:root {
  --blume-font-display: "Inter Display", "Inter", ui-sans-serif, system-ui, sans-serif;
  --blume-font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
  --blume-font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --blume-radius: 0.625rem;
  --blume-background: #ffffff;
  --blume-foreground: #09090b;
  --blume-muted: #f4f4f5;
  --blume-muted-foreground: #52525b;
  --blume-border: #e4e4e7;
  --blume-accent: #09090b;
  --blume-accent-foreground: #ffffff;
  --blume-code-background: #fafafa;
  --efx-pass: #15803d; --efx-pass-tint: rgb(21 128 61 / 0.08);
  --efx-fail: #b91c1c; --efx-fail-tint: rgb(185 28 28 / 0.08);
  --efx-warn: #854d0e; --efx-warn-tint: rgb(133 77 14 / 0.08);
  --efx-need: #1d4ed8; --efx-need-tint: rgb(29 78 216 / 0.08);
  --efx-fade-end: #a1a1aa;
  --efx-grid: rgb(9 9 11 / 0.06);
  --blume-code-add: var(--efx-pass-tint); --blume-code-add-border: var(--efx-pass);
  --blume-code-remove: var(--efx-fail-tint); --blume-code-remove-border: var(--efx-fail);
}

:root[data-theme="dark"] {
  --blume-background: #09090b;
  --blume-foreground: #fafafa;
  --blume-muted: #18181a;
  --blume-muted-foreground: #a1a1aa;
  --blume-border: #27272a;
  --blume-accent: #ffffff;
  --blume-accent-foreground: #09090b;
  --blume-code-background: #0b0b0d;
  --efx-pass: #4ade80; --efx-pass-tint: rgb(74 222 128 / 0.1);
  --efx-fail: #f87171; --efx-fail-tint: rgb(248 113 113 / 0.1);
  --efx-warn: #facc15; --efx-warn-tint: rgb(250 204 21 / 0.1);
  --efx-need: #60a5fa; --efx-need-tint: rgb(96 165 250 / 0.1);
  --efx-fade-end: #71717a;
  --efx-grid: rgb(255 255 255 / 0.05);
  --blume-code-add: var(--efx-pass-tint); --blume-code-add-border: var(--efx-pass);
  --blume-code-remove: var(--efx-fail-tint); --blume-code-remove-border: var(--efx-fail);
}

/* code: JetBrains Mono with its ligatures on (ADR-0080) */
code, pre, kbd { font-family: var(--blume-font-mono); font-variant-ligatures: contextual common-ligatures; }

/* the canvas: a quiet dot grid behind the docs */
body { background-image: radial-gradient(var(--efx-grid) 1px, transparent 1px); background-size: 22px 22px; }

/* headings: Inter Display, the brand's headline fade on the page title */
h1, h2, h3 { font-family: var(--blume-font-display); letter-spacing: -0.025em; }
article h1, main > header h1 {
  background: linear-gradient(90deg, var(--blume-foreground) 55%, var(--efx-fade-end));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

/* // LABELS */
.efx-label { font: 500 0.6875rem/1 var(--blume-font-mono); letter-spacing: 0.06em; text-transform: uppercase; }

/* the kind badge (PageHeader) and the version pill (Logo) */
.efx-kind { display: inline-flex; gap: 0.5rem; align-items: center; color: var(--blume-muted-foreground); margin-bottom: 0.75rem; }
.efx-kind b { font-weight: 500; color: var(--blume-foreground); border: 1px solid var(--blume-border); border-radius: 0.25rem; padding: 0.2rem 0.45rem; }
.efx-kind[data-signal="fail"] b { color: var(--efx-fail); background: var(--efx-fail-tint); border-color: var(--efx-fail); }
.efx-kind[data-signal="need"] b { color: var(--efx-need); background: var(--efx-need-tint); border-color: var(--efx-need); }
.efx-version { color: var(--efx-warn); background: var(--efx-warn-tint); border-radius: 999px; padding: 0.15rem 0.5rem; margin-left: 0.5rem; }

/* signal-coded facts (efx docs tables, marked by the enhancer) */
tr[data-efx-fact] > :first-child { white-space: nowrap; }
tr[data-efx-fact] > :first-child strong { font: 500 0.6875rem/1 var(--blume-font-mono); letter-spacing: 0.06em; text-transform: uppercase; }
tr[data-efx-fact="a"] { box-shadow: inset 2px 0 var(--efx-pass); }
tr[data-efx-fact="e"] { box-shadow: inset 2px 0 var(--efx-fail); }
tr[data-efx-fact="r"] { box-shadow: inset 2px 0 var(--efx-need); }
tr[data-efx-fact="a"] > :first-child strong { color: var(--efx-pass); }
tr[data-efx-fact="e"] > :first-child strong { color: var(--efx-fail); }
tr[data-efx-fact="r"] > :first-child strong { color: var(--efx-need); }
tr[data-efx-fact="a"] > :first-child strong::before { content: "✓ "; }
tr[data-efx-fact="e"] > :first-child strong::before { content: "! "; }
tr[data-efx-fact="r"] > :first-child strong::before { content: "◇ "; }

/* callouts: tip ✓ Pass, caution ▲ Warn, danger ! Fail, note ◇ Need */
[data-callout="tip"], .callout-tip { border-color: var(--efx-pass); background: var(--efx-pass-tint); }
[data-callout="warning"], [data-callout="caution"], .callout-warning { border-color: var(--efx-warn); background: var(--efx-warn-tint); }
[data-callout="danger"], .callout-danger { border-color: var(--efx-fail); background: var(--efx-fail-tint); }
[data-callout="note"], [data-callout="info"], .callout-note { border-color: var(--efx-need); background: var(--efx-need-tint); }

/* a fence titled "Wrong…" (pitfalls, strict rules) */
pre[data-title^="Wrong"] { box-shadow: inset 2px 0 var(--efx-fail); }
```

Check the callout and code-title selectors against the HTML Blume actually emits. Build any page with
a `:::tip` and a titled fence in Task 6's site, and fix the selectors to the classes Blume uses. The
selectors above are guesses until then, and Task 6 Step 7 re-checks them.

- [ ] **Step 5: Run the test and check that it passes**

Run: `pnpm test --run packages/effectscript/core/test/blume-theme-css.test.ts`
Expected: PASS. If the light `--blume-muted-foreground` fails AA on `#f4f4f5`, darken it to `#52525b`
(already the value above) and keep the test.

- [ ] **Step 6: Commit**

```bash
git add packages/effectscript/core/scripts/theme-fonts.ts packages/effectscript/core/blume/fonts packages/effectscript/core/blume/theme.css packages/effectscript/core/package.json pnpm-lock.yaml packages/effectscript/core/test/blume-theme-css.test.ts
git commit -m "feat(effectscript): the Blume theme's tokens, signal colours and subset brand fonts (ADR-0078, ADR-0080)"
```

---

### Task 4: The integration, the config exports, the facts enhancer and the three page parts

**Files:**
- Modify: `packages/effectscript/core/src/blume.ts`
- Create: `packages/effectscript/core/src/blume-facts.ts`
- Create: `packages/effectscript/core/blume/components/Logo.astro`
- Create: `packages/effectscript/core/blume/components/PageHeader.astro`
- Create: `packages/effectscript/core/blume/components/Footer.astro`
- Modify: `packages/effectscript/core/test/blume.test.ts`
- Create: `packages/effectscript/core/test/blume-facts.test.ts`
- Copy: the brand lockups to `packages/effectscript/core/blume/components/lockup-{white,black}.svg`

**Interfaces:**
- Consumes: Task 2's theme JSONs and Task 3's CSS.
- Produces, from `effectscript/blume`:
  - `theme`: `{ mode: "system", radius: "md" }`;
  - `markdown`: `{ code: { theme: { light: <effectscript-light>, dark: <effectscript-dark> }, icons: true } }`;
  - `frontmatter`: `{ extend: { kind: <Standard Schema for an optional string> } }`;
  - `effectscript(): AstroIntegration` (grammars plus the injected enhancer);
  - `factKind(label: string): "a" | "e" | "r" | undefined`;
  - `kindGlyph(kind: string): { glyph: string; signal?: "fail" | "need" }`.
- Produces, from `effectscript/blume-facts`: `markFacts(root: ParentNode): number`, which returns the
  number of rows it marked.

- [ ] **Step 1: Write the failing tests**

`core/test/blume-facts.test.ts`:

```ts
// @vitest-environment happy-dom
import { markFacts } from "effectscript/blume-facts"
import { describe, expect, it } from "vitest"

const facts = (head: string, rows: string) =>
  `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
const row = (label: string) => `<tr><td><strong>${label}</strong></td><td><code>X</code></td></tr>`

describe("markFacts (spec §4.4)", () => {
  it("marks Returns, Fails with and Needs in an efx docs facts table", () => {
    document.body.innerHTML = facts("<th></th><th></th>", row("id") + row("Returns") + row("Fails with") + row("Needs"))
    expect(markFacts(document)).toBe(3)
    expect([...document.querySelectorAll("tr[data-efx-fact]")].map((r) => (r as HTMLElement).dataset.efxFact)).toEqual(["a", "e", "r"])
  })

  it("leaves a table with a real header alone, even with a Returns row", () => {
    document.body.innerHTML = facts("<th>Name</th><th>Value</th>", row("Returns"))
    expect(markFacts(document)).toBe(0)
  })

  it("needs the label to be the whole first cell, in bold", () => {
    document.body.innerHTML = facts("<th></th><th></th>", "<tr><td>Returns something</td><td>x</td></tr>")
    expect(markFacts(document)).toBe(0)
  })

  it("is idempotent, for Blume's client-side navigation", () => {
    document.body.innerHTML = facts("<th></th><th></th>", row("Returns"))
    markFacts(document)
    expect(markFacts(document)).toBe(1)
    expect(document.querySelectorAll("tr[data-efx-fact]").length).toBe(1)
  })

  it("also accepts a table Blume stripped the empty header from", () => {
    document.body.innerHTML = `<table><tbody>${row("Needs")}</tbody></table>`
    expect(markFacts(document)).toBe(1)
  })
})
```

Add to `core/test/blume.test.ts`:

```ts
import { effectscript, factKind, frontmatter, kindGlyph, markdown, theme } from "effectscript/blume"

it("injects the facts enhancer on every page, re-run after client navigation", () => {
  const scripts: Array<[string, string]> = []
  effectscript().hooks["astro:config:setup"]({ updateConfig: () => {}, injectScript: (stage, code) => scripts.push([stage, code]) })
  expect(scripts).toHaveLength(1)
  expect(scripts[0]![0]).toBe("page")
  expect(scripts[0]![1]).toContain("effectscript/blume-facts")
  expect(scripts[0]![1]).toContain("astro:page-load")
})

it("exports the theme config: syntax themes, the kind key and the system mode", async () => {
  expect(theme.mode).toBe("system")
  expect(markdown.code.theme.dark.name).toBe("effectscript-dark")
  expect(markdown.code.theme.light.name).toBe("effectscript-light")
  const kind = frontmatter.extend.kind["~standard"]
  expect(await kind.validate("error")).toEqual({ value: "error" })
  expect(await kind.validate(undefined)).toEqual({ value: undefined })
  expect("issues" in (await kind.validate(3))).toBe(true)
})

it("maps facts labels and construct kinds to signals", () => {
  expect(factKind("Returns")).toBe("a")
  expect(factKind("Fails with")).toBe("e")
  expect(factKind("Needs")).toBe("r")
  expect(factKind("id")).toBeUndefined()
  expect(kindGlyph("error")).toEqual({ glyph: "!", signal: "fail" })
  expect(kindGlyph("service")).toEqual({ glyph: "◇", signal: "need" })
  expect(kindGlyph("effect")).toEqual({ glyph: "ƒ" })
  expect(kindGlyph("unknown-thing")).toEqual({ glyph: "·" })
})
```

The existing "registers efx with Shiki" test passes `{ updateConfig }` only. Give it a no-op
`injectScript` too.

- [ ] **Step 2: Run them and check that they fail**

Run: `pnpm test --run packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/blume-facts.test.ts`
Expected: FAIL, because the exports are missing.

- [ ] **Step 3: Write `src/blume-facts.ts`**

```ts
/**
 * `effectscript/blume-facts` (spec §4.4): marks the Returns / Fails with / Needs rows that `efx docs`
 * writes, so the theme can colour them by Effect's A / E / R. Runs in the browser on every page.
 *
 * @since 4.0.0
 */

const kinds: Record<string, "a" | "e" | "r"> = { "Returns": "a", "Fails with": "e", "Needs": "r" }

/**
 * The fact a label names, if any.
 *
 * @since 4.0.0
 * @category facts
 */
export const factKind = (label: string): "a" | "e" | "r" | undefined => kinds[label]

/** An `efx docs` facts table has no header text (Blume may drop the empty header row). */
const headerless = (table: HTMLTableElement): boolean =>
  table.tHead === null || (table.tHead.textContent ?? "").trim() === ""

/**
 * Marks every facts row under `root` with `data-efx-fact`, and returns how many rows carry it.
 *
 * @since 4.0.0
 * @category facts
 */
export const markFacts = (root: ParentNode): number => {
  let marked = 0
  for (const table of root.querySelectorAll("table")) {
    if (!headerless(table)) continue
    for (const row of table.querySelectorAll("tbody tr")) {
      const cell = (row as HTMLTableRowElement).cells[0]
      const strong = cell?.children.length === 1 ? cell.querySelector(":scope > strong") : null
      if (strong === null || strong === undefined || cell!.textContent!.trim() !== strong.textContent!.trim()) continue
      const kind = factKind(strong.textContent!.trim())
      if (kind === undefined) continue
      ;(row as HTMLElement).dataset.efxFact = kind
      marked++
    }
  }
  return marked
}
```

- [ ] **Step 4: Extend `src/blume.ts`**

Keep the existing grammar code. Add the following, and make `AstroIntegration`'s setup options
include an optional `injectScript`:

```ts
import { factKind } from "./blume-facts.ts"
export { factKind }

const json = (file: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(new URL(`../blume/${file}`, import.meta.url), "utf8"))

/** @since 4.0.0 @category config */
export const theme = { mode: "system", radius: "md" } as const

/** @since 4.0.0 @category config */
export const markdown = {
  code: { icons: true, theme: { light: json("shiki/effectscript-light.json"), dark: json("shiki/effectscript-dark.json") } }
} as const

/** The optional `kind` key a page sets to show its construct badge (spec §4.3), as a Standard Schema. */
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

/** @since 4.0.0 @category config */
export const frontmatter = { extend: { kind: optionalString } } as const

const glyphs: Record<string, { readonly glyph: string; readonly signal?: "fail" | "need" }> = {
  effect: { glyph: "ƒ" }, error: { glyph: "!", signal: "fail" }, schema: { glyph: "{}" },
  service: { glyph: "◇", signal: "need" }, layer: { glyph: "◇", signal: "need" }, config: { glyph: "⚙" },
  cli: { glyph: "$" }, command: { glyph: "$" }, pipeline: { glyph: "|>" }, match: { glyph: "?" },
  main: { glyph: "▶" }, try: { glyph: "!" }, test: { glyph: "✓" }
}

/**
 * The glyph (and signal, for errors and services) of a construct's badge.
 *
 * @since 4.0.0
 * @category config
 */
export const kindGlyph = (kind: string): { readonly glyph: string; readonly signal?: "fail" | "need" } =>
  glyphs[kind] ?? { glyph: "·" }
```

In `effectscript()`'s `astro:config:setup`, after `updateConfig`, add:

```ts
injectScript?.(
  "page",
  `import { markFacts } from "effectscript/blume-facts"\nmarkFacts(document)\ndocument.addEventListener("astro:page-load", () => markFacts(document))`
)
```

An effect-less hand-written Standard Schema is used here because Blume validates with whatever
implements the interface. Importing Effect Schema into a config module would load all of `effect`
twice per run (the config is evaluated twice).

- [ ] **Step 5: Write the three components**

`blume/components/Logo.astro` (props: `site`, `logo`, `locale`):

```astro
---
/** The EffectScript lockup, white on dark and black on light, with the preview pill (spec §4.1). */
import black from "./lockup-black.svg?raw"
import white from "./lockup-white.svg?raw"
const { site } = Astro.props
---
<a href="/" class="efx-logo" aria-label={site?.title ?? "EffectScript"}>
  <span class="efx-logo-light" set:html={black} />
  <span class="efx-logo-dark" set:html={white} />
  <span class="efx-label efx-version">alpha</span>
</a>
<style is:global>
  .efx-logo { display: inline-flex; align-items: center; }
  .efx-logo svg { height: 1.25rem; width: auto; }
  .efx-logo-dark { display: none; }
  :root[data-theme="dark"] .efx-logo-light { display: none; }
  :root[data-theme="dark"] .efx-logo-dark { display: inline-flex; }
</style>
```

`blume/components/PageHeader.astro` (props: `page`, `headings`, `route`):

```astro
---
/** The construct badge above a page's title, from its `kind` frontmatter (spec §4.3). */
import data from "blume:data"
import { getEntry } from "astro:content"
import { kindGlyph } from "effectscript/blume"
const { route } = Astro.props
const current = data.routes.find((r) => r.path === route)
const entry = current === undefined ? undefined : await getEntry(current.collection as "docs", current.entryId)
const kind = (entry?.data as { kind?: string } | undefined)?.kind
const badge = kind === undefined ? undefined : kindGlyph(kind)
---
{badge && (
  <p class="efx-kind efx-label" data-signal={badge.signal}>
    <b>{badge.glyph} {kind}</b> construct · language reference
  </p>
)}
```

`blume/components/Footer.astro` (props: `footer`, `locale`, `site`, `navigation`, `ui`). Blume's
docs say a Footer override should keep the repository and social links:

```astro
---
/** The site footer: the tagline, the Effect disclaimer, and the repository and social links (spec §4.6). */
const { footer, site } = Astro.props
const socials = Object.entries((footer?.socials ?? {}) as Record<string, string>)
const repo = site?.github?.url ?? site?.repository
---
<footer class="efx-footer">
  <p class="efx-tagline">All of Effect. None of the ceremony.</p>
  <p class="efx-disclaimer">Built on Effect. Not affiliated with or endorsed by Effectful Technologies.</p>
  <nav class="efx-label">
    {repo && <a href={repo}>GitHub</a>}
    {socials.map(([name, href]) => <a href={href}>{name}</a>)}
  </nav>
</footer>
<style is:global>
  .efx-footer { border-top: 1px solid var(--blume-border); padding: 2rem 1.5rem; display: grid; gap: 0.5rem; color: var(--blume-muted-foreground); }
  .efx-tagline { font-family: var(--blume-font-display); font-weight: 600; color: var(--blume-foreground); }
  .efx-footer nav { display: flex; gap: 1rem; }
</style>
```

`footer`'s and `site`'s exact shapes come from Blume's `Footer` props. Read
`node_modules/blume/src/components/layout/Footer.astro` (or wherever `blume add footer` copies from)
and use the same fields for the repository link and socials.

Copy the lockups: `cp packages/effectscript/brand/logo/svg/effectscript-lockup-{white,black}.svg packages/effectscript/core/blume/components/`,
renaming them to `lockup-white.svg` and `lockup-black.svg`.

- [ ] **Step 6: Run the tests and check that they pass**

Run: `pnpm test --run packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/blume-facts.test.ts && pnpm check`
Expected: PASS. The components are compiled by Task 6's site build, which is their test.

- [ ] **Step 7: Commit**

```bash
git add packages/effectscript/core/src/blume.ts packages/effectscript/core/src/blume-facts.ts packages/effectscript/core/blume/components packages/effectscript/core/test/blume.test.ts packages/effectscript/core/test/blume-facts.test.ts
git commit -m "feat(effectscript): effectscript/blume theme: config, facts enhancer, Logo, PageHeader and Footer (ADR-0079)"
```

---

### Task 5: `efx init` wires the theme

**Files:**
- Modify: `packages/effectscript/core/src/cli/init.ts` (`blumeConfig`, `setUpDocs`, the `blume` dependency)
- Modify: `packages/effectscript/core/test/init.test.ts`

**Interfaces:**
- Consumes: the Task 4 exports and the component paths.
- Produces: `docs/blume.config.ts`, `docs/components.ts` and `docs/theme.css` in an initialized
  project, and the `blume@2.1.1` install hint.

- [ ] **Step 1: Write the failing test.** In the existing init test (around `init.test.ts:74`), add:

```ts
const config = read(dir, "docs/blume.config.ts")
expect(config).toContain("import { effectscript, frontmatter, markdown, theme } from \"effectscript/blume\"")
expect(config).toContain("theme,")
expect(config).toContain("integrations: [effectscript()]")
expect(read(dir, "docs/components.ts")).toBe(
  "import { defineComponents } from \"blume\"\n" +
    "import Footer from \"effectscript/blume/components/Footer.astro\"\n" +
    "import Logo from \"effectscript/blume/components/Logo.astro\"\n" +
    "import PageHeader from \"effectscript/blume/components/PageHeader.astro\"\n\n" +
    "export default defineComponents({ layout: { Footer, Logo, PageHeader } })\n"
)
expect(read(dir, "docs/theme.css")).toBe("@import \"effectscript/blume/theme.css\";\n")
fs.writeFileSync(path.join(dir, "docs/theme.css"), "/* mine */\n")
init(dir)
expect(read(dir, "docs/theme.css")).toBe("/* mine */\n")
```

Also find where the missing dependencies are listed (`init.ts:212`, `"blume"`) and assert that the
printed install line says `blume@2.1.1`.

- [ ] **Step 2: Run it and check that it fails**

Run: `pnpm test --run packages/effectscript/core/test/init.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`blumeConfig` writes:

```ts
`import { defineConfig } from "blume"\nimport { effectscript, frontmatter, markdown, theme } from "effectscript/blume"\n\n` +
`export default defineConfig({\n  title: ${JSON.stringify(title)},\n` +
`  content: { root: ".", exclude: ["**/_*", "**/.*", "dist/**", "node_modules/**"] },\n` +
`  theme,\n  markdown,\n  frontmatter,\n  integrations: [effectscript()]\n})\n`
```

`setUpDocs` also writes `docs/components.ts` (the exact text the test expects) and `docs/theme.css`,
each only if it's absent, with an `out(...)` line for each. In the missing-dependency list, `"blume"`
becomes `"blume@2.1.1"`, in whatever form that list prints. Check the surrounding code for how
versions are expressed.

- [ ] **Step 4: Run it and check that it passes**

Run: `pnpm test --run packages/effectscript/core/test/init.test.ts packages/effectscript/core/test/plan12-review.test.ts`
Expected: PASS. Update `plan12-review.test.ts` only where it pinned the old config text.

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/core/src/cli/init.ts packages/effectscript/core/test/init.test.ts packages/effectscript/core/test/plan12-review.test.ts
git commit -m "feat(effectscript): efx init sets up the EffectScript Blume theme, with Blume pinned to 2.1.1"
```

---

### Task 6: The site becomes one Blume project

**Files:**
- Create: `packages/effectscript/site/blume.config.ts`, `components.ts`, `theme.css`
- Move: `site/src/pages/{index,playground,soon}.astro` → `site/pages/` (fix relative imports from
  `../` to `../src/`)
- Move: `site/src/content/docs/docs/{index.mdx,start/install.md,guides/migrating.md}` →
  `site/content/{index.mdx,start/install.md,guides/migrating.md}`
- Delete: `site/astro.config.ts`, `site/src/content.config.ts`, `site/src/styles/starlight.css`, and
  `site/src/pages/` (now empty)
- Modify: `site/scripts/content.ts`
- Modify: `site/package.json`:
  - remove `@astrojs/starlight`, `@astrojs/react`, `astro`, `@tailwindcss/vite` and `tailwindcss`
    if Blume provides them;
  - add `blume: "2.1.1"`;
  - scripts: `dev` and `build` call `blume dev` / `blume build`.
- Modify: `site/src/styles/brand.css` (ligatures on, signal tokens)
- Modify: `site/src/playground/Playground.tsx` (`fontLigatures: true`, the EffectScript themes)
- Modify: `site/src/lib/highlight.ts` (the EffectScript themes)
- Modify: `site/test/build.test.ts`
- Modify: `site/.gitignore` (generated content now under `content/`, plus `.blume/`)
- Modify: `site/tsconfig*.json` (drop the Starlight and Astro types if they're referenced)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `site/dist`, with `index.html`, `playground/index.html`, `soon/index.html`, `404.html`,
  `docs/**/index.html` and `llms.txt`, all linked slashlessly.

- [ ] **Step 1: Rewrite the Starlight-specific assertions in `site/test/build.test.ts` first**

These are the failing tests:

```ts
it("highlights EffectScript code with the efx grammar and the EffectScript themes", () => {
  const page = read("docs/index.html")
  expect(page).toContain("data-language=\"efx\"")
  expect(page).not.toContain("Unknown language")
  // the signature clauses carry their signal colours (ADR-0078, ADR-0081)
  expect(page).toMatch(/--shiki-dark:#F87171[^>]*>UserNotFound/i)
  expect(page).toMatch(/--shiki-dark:#60A5FA[^>]*>Users/i)
})

it("shows the construct badge and marks facts (spec §4.3, §4.4)", () => {
  expect(read("docs/reference/error/index.html")).toMatch(/class="efx-kind[^"]*"[^>]*data-signal="fail"/)
})

it("I1: the docs logo has both lockups, swapped by mode", () => {
  const page = read("docs/index.html")
  expect(page).toContain("efx-logo-light")
  expect(page).toContain("efx-logo-dark")
})

it("I8: small muted text meets WCAG AA", () => {
  // the theme's own contrast test covers every token (core/test/blume-theme-css.test.ts); the site's
  // landing pages keep brand.css's muted #8e8e96 on ink
  const brand = fs.readFileSync(path.join(site, "src/styles/brand.css"), "utf8")
  expect(brand).toMatch(/--color-muted:\s*#8e8e96/i)
})

it("capitalizes sidebar groups and draws |> with its ligature (ADR-0080)", () => {
  const page = read("docs/index.html")
  expect(page).toMatch(/>Patterns</)
  expect(page).not.toMatch(/>patterns</)
  const css = fs.readdirSync(path.join(dist, "_astro")).filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(dist, "_astro", f), "utf8")).join("\n")
  expect(css).toMatch(/font-variant-ligatures:\s*contextual common-ligatures/)
  expect(css).not.toMatch(/font-variant-ligatures:\s*none/)
  expect(css).toMatch(/--efx-fail/)
})

it("writes Blume's llms.txt and llms-full.txt with the docs", () => {
  expect(read("llms.txt")).toContain("/docs/reference/effect")
  expect(read("llms-full.txt")).toContain("EffectScript")
})
```

Other changes in the same file:
- The I13 assertion `expect(read("llms.txt")).not.toContain("[`")` stays.
- Delete the old "writes llms.txt and llms-full.txt" test and the old I1, I8 and Plan 21 ligature
  tests.
- Paths stay `docs/x/index.html`, because Blume writes directory pages. `sidebar groups` expects
  `>Migration<` and `>Packages<` only if the `group` display renders closed groups' labels inline.
  If they're lazy-loaded fragments, assert on `dist/blume-nav/**`.
- Change the link checker's `href` regex so it also resolves slashless routes: `pageOf` already
  tries `target/index.html`, so no change is needed beyond keeping it. Skip `/api/`, `/blume-nav/`
  and `.md`/`.json` twins only if they 404 locally.

- [ ] **Step 2: Run it and check that it fails**

Run: `pnpm test --run packages/effectscript/site/test/build.test.ts`
Expected: FAIL, because Starlight is still building.

- [ ] **Step 3: Write `blume.config.ts`, `components.ts` and `theme.css`**

```ts
// site/blume.config.ts: effectscript.dev (ADR-0079): docs at /docs, landing, playground and teaser as pages
import { defineConfig } from "blume"
import { effectscript, frontmatter, markdown, theme } from "effectscript/blume"

export default defineConfig({
  title: "EffectScript",
  description: "All of Effect. None of the ceremony.",
  basePath: "/docs",
  content: { root: "content" },
  theme,
  markdown,
  frontmatter,
  github: { repo: "EffectScript-Lang/effectscript", branch: "effectscript" },
  footer: { socials: { x: "https://x.com/gunta85" } },
  navigation: {
    sidebar: { display: "group" },
    tabs: [
      { label: "Guides", path: "/" },
      { label: "Reference", path: "/reference" },
      { label: "Effect", path: "/effect" }
    ],
    cta: { label: "Playground ↗", href: "https://effectscript.dev/playground" }
  },
  deployment: { site: "https://effectscript.dev" },
  integrations: [effectscript()]
})
```

Before using these keys, check each one against `node_modules/blume/docs/configuration/index.mdx`
and `docs/content/navigation.mdx`: `github`, `footer.socials`, `navigation.cta`'s shape and
whether a tab may be `/`. If `cta` rejects a site route outside `basePath`, use an absolute URL as
shown. `components.ts` and `theme.css` are exactly the files Task 5's `efx init` writes, and
`theme.css` also gets `@source "./src";` so Tailwind sees the custom pages' classes.

- [ ] **Step 4: Move the pages and content, and remove Starlight**

```bash
cd packages/effectscript/site
mkdir -p pages content/start content/guides
git mv src/pages/index.astro src/pages/playground.astro src/pages/soon.astro pages/
git mv src/content/docs/docs/index.mdx content/index.mdx
git mv src/content/docs/docs/start/install.md content/start/install.md
git mv src/content/docs/docs/guides/migrating.md content/guides/migrating.md
git rm astro.config.ts src/content.config.ts src/styles/starlight.css
```

In the three pages, rewrite the relative imports (`../components/` → `../src/components/`, and
likewise for `../layouts/`, `../playground/`, `../data/`, `../lib/` and `../styles/`). Change
`href="/docs/"` to `href="/docs"` and `href="/playground/"` to `href="/playground"` in
`src/components/Header.astro` and in the pages.

- [ ] **Step 5: Adapt `scripts/content.ts`**

- `const docs = path.join(site, "content")`. Generated paths stay relative to it.
- `brandAssets` stops copying the lockups to `src/assets` (the theme's Logo has them). It keeps the
  fonts, icons, `og-image` and `install`.
- `page(...)` extras: reference pages get `kind: dir`, which `reference()` passes.
- Every generated link drops its trailing slash:
  - `skillLinks`: `/docs/reference/effect`, `/docs/guides/patterns/services-and-layers`,
    `/docs/guides/pitfalls`, `/docs/effect/guide`;
  - `githubLinks`: `/docs/effect/guides/<x>${hash}` with no `/` before the hash.
- `anchorOf`: compare it with Blume's heading slugger (`node_modules/blume/src/markdown/heading-anchors.ts`)
  and use the same algorithm. If they agree for the corpus, keep the function and update its comment
  to name Blume.
- A `meta(dir, fields)` helper writes `content/<dir>/meta.ts`:

```ts
const meta = (dir: string, fields: Record<string, unknown>) => {
  fs.mkdirSync(path.join(docs, dir), { recursive: true })
  fs.writeFileSync(
    path.join(docs, dir, "meta.ts"),
    `import { defineMeta } from "blume"\n\nexport default defineMeta(${JSON.stringify(fields, null, 2)})\n`
  )
}
```

  Call it:
  - `meta("start", { title: "Start here", order: 0 })`;
  - `meta("guides", { title: "Guides", order: 1, pages: ["writing-effectscript", "migrating", "pitfalls", "editor-setup", "strict-rules", "patterns"] })`;
  - `meta("guides/patterns", { title: "Patterns", collapsed: true })`;
  - `meta("reference", { title: "Language reference", order: 2 })`;
  - `meta("effect", { title: "Effect, in EffectScript", order: 3 })`;
  - `meta("effect/guides", { title: "Guides", collapsed: true })`;
  - `meta("effect/api", { title: "API examples", collapsed: true })`;
  - one per subfolder of `effect/guides`, titled with its capitalized folder name, to replace
    `labelledGroups()`.
- Add `meta.ts` paths under `start` and `guides` to `generated`, so a rebuild removes them. They are
  generated, never hand-written.
- Delete `llms()` and its call. Blume writes `llms.txt` and `llms-full.txt`.
- On the pipeline reference page (`dir === "pipeline"`), append to the intro: "Code on this site
  draws `|>` as a ▷ ligature; you type `|>`, and copying gives `|>`."

- [ ] **Step 6: Ligatures and themes on the custom pages**

- `src/styles/brand.css`: replace the Plan 21 rule
  `code, pre, kbd { font-variant-ligatures: none; }` and the one at line 63 with
  `font-variant-ligatures: contextual common-ligatures;`. Add the dark signal tokens to `@theme`
  (`--color-pass: #4ade80; --color-fail: #f87171; --color-warn: #facc15; --color-need: #60a5fa;`).
- `src/playground/Playground.tsx:60`: set `fontLigatures: true`. Load the two theme JSONs
  (`import dark from "effectscript/blume/shiki/effectscript-dark.json"`, and the light one) into
  `createHighlighter`'s `themes`, and select `effectscript-dark`.
- `src/lib/highlight.ts`: the same themes, for the landing page's code windows.
- `site/.gitignore`: replace `src/content/docs/docs/...` entries with `content/reference`,
  `content/effect`, `content/guides/patterns` and the generated guide files and `meta.ts` files.
  Also add `.blume/` and `public/llms*.txt`.

- [ ] **Step 7: Build, fix and run the tests**

Run: `pnpm --filter @effectscript/site build`, then `pnpm test --run packages/effectscript/site/test`.
Expected: PASS. Fix what the build reports:
- frontmatter keys Blume rejects (map or drop them in `page()`);
- links (slashless);
- callout and code-title selectors in `core/blume/theme.css` (inspect `dist/docs/guides/pitfalls/index.html`
  and fix Task 3's selectors to the real markup);
- React and Tailwind on the custom pages. If Blume doesn't scan `src/`, add `@source` lines in
  `site/theme.css`.

Also check that the subset site fonts keep the ligature: `dist/fonts/JetBrainsMono-Regular.woff2`
must lay out `|>` with the `bar_greater` glyph (reuse Task 3's fontkit check as a site test).

- [ ] **Step 8: Commit**

```bash
git add -A packages/effectscript/site
git commit -m "feat(effectscript): effectscript.dev on Blume with the EffectScript theme; Starlight removed (ADR-0079)"
```

---

### Task 7: site-edge serves slashless URLs

**Files:**
- Modify: `packages/effectscript/site-edge/cloudflare.config.ts` (`htmlHandling: "drop-trailing-slash"`)
- Modify: `packages/effectscript/site-edge/src/gate.ts` (the teaser is `/soon`)
- Modify: `packages/effectscript/site-edge/test/gate.test.ts`

**Interfaces:**
- Consumes: Task 6's `dist`.
- Produces: the same gate behaviour, with slashless canonical URLs.

- [ ] **Step 1: Write the failing tests** in `gate.test.ts`, following its existing style
  (a fake `ASSETS`):
  - the teaser at `/` fetches `/soon` from assets;
  - `/soon` and `/soon/` are both allowed without the cookie;
  - with the cookie, `/docs` and `/docs/start/install/` pass through to assets (assets do the slash
    redirect).

- [ ] **Step 2: Run and see them fail.** Run: `pnpm test --run packages/effectscript/site-edge/test/gate.test.ts`

- [ ] **Step 3: Implement.** In `gate.ts`:
  - `teaserFiles[0]` becomes `/^\/soon\/?$/`;
  - `teaser()` fetches `new URL("/soon", request.url)`.

  In `cloudflare.config.ts`, set `htmlHandling: "drop-trailing-slash"`. Update the module comment
  to say why (ADR-0079: Blume links slashless).

- [ ] **Step 4: Run the tests and check that they pass.** Run: `pnpm test --run packages/effectscript/site-edge`

- [ ] **Step 5: Commit**

```bash
git add packages/effectscript/site-edge
git commit -m "fix(effectscript): site-edge serves Blume's slashless URLs; the teaser is /soon (ADR-0079)"
```

---

### Task 8: Brand scripts set code with ligatures, and the code images are rebuilt

**Files:**
- Modify: `packages/effectscript/brand/scripts/text.py:38-41`
- Regenerate: the outputs of `brand/scripts/social.py` (and `brand.py` if it sets code)

- [ ] **Step 1:** In `text.py`, replace the default features with
  `features = {"kern": True, "liga": True, "calt": True}`, and change the comment to
  `# code keeps JetBrains Mono's ligatures: |> draws as ▷ (ADR-0080)`.
- [ ] **Step 2:** Check the tools: `which resvg oxipng magick ffmpeg`. If any are missing, stop here,
  commit only `text.py`, and report the regeneration as pending, with the exact command.
- [ ] **Step 3:** Run `uv run --with fonttools --with uharfbuzz --with pillow packages/effectscript/brand/scripts/social.py`.
  Then look at `social/x/x-post-compare.png` (or whichever image shows code) and confirm that `|>`
  is drawn as ▷.
- [ ] **Step 4: Commit**

```bash
git add packages/effectscript/brand/scripts/text.py packages/effectscript/brand/social packages/effectscript/brand/wallpapers
git commit -m "feat(effectscript): brand images set code with JetBrains Mono's ligatures (ADR-0080)"
```

---

### Task 9: Docs, compatibility and the final check

**Files:**
- Modify: `packages/effectscript/COMPATIBILITY.md` (Starlight row → Blume 2.1.1, exact)
- Modify: `packages/effectscript/site/README.md` (Blume layout, `content/`, `pages/`, theme)
- Modify: `packages/effectscript/RELEASING.md` §13 if it names Astro or Starlight commands
- Modify: `docs/superpowers/specs/2026-10-05-effectscript-blume-theme-design.md` (status: Implemented)
- Modify: `packages/effectscript/language/README.md` "Editor setup": recommend JetBrains Mono with
  `"editor.fontLigatures": true` (ADR-0080). It flows into the site's editor-setup guide.

- [ ] **Step 1:** Make the edits above.
- [ ] **Step 2:** Run `pnpm lint-fix`, then `pnpm check`, then
  `pnpm test --run packages/effectscript/core/test/blume*.test.ts packages/effectscript/core/test/init.test.ts packages/effectscript/site packages/effectscript/site-edge packages/effectscript/vscode`.
- [ ] **Step 3: Visual check.** Serve `site/dist` (static server in the Browser pane). Screenshot:
  - `/docs` and `/docs/reference/error` in dark and light;
  - `/` and `/playground`;
  - a phone width (375px).

  Check:
  - the kind badge;
  - the signal colours on `throws` and `needs`;
  - ▷ ligatures;
  - the fade title;
  - the logo swap;
  - no horizontal scroll on the phone.

  Fix anything that looks broken.
- [ ] **Step 4: Commit**

```bash
git add packages/effectscript/COMPATIBILITY.md packages/effectscript/site/README.md packages/effectscript/RELEASING.md packages/effectscript/language/README.md docs/superpowers/specs/2026-10-05-effectscript-blume-theme-design.md
git commit -m "docs(effectscript): Blume 2.1.1 in COMPATIBILITY, the site README, and ligatures in editor setup"
```
