/**
 * The Blume theme's fonts (ADR-0079, ADR-0080): the brand fonts, subset to the characters docs use,
 * as WOFF2. Layout features stay, so JetBrains Mono keeps its `calt` ligatures (`|>` draws as ▷).
 * Run `pnpm --filter effectscript theme-fonts` after the brand fonts change.
 */
import * as fs from "node:fs"
import * as path from "node:path"
// @ts-expect-error: subset-font ships no types
import subsetFont from "subset-font"

const core = path.join(import.meta.dirname, "..")
const brand = path.join(core, "../brand/fonts")
const out = path.join(core, "blume/fonts")

/** Latin, Latin-1, punctuation, arrows, maths and the few symbols docs use (ƒ, ≡, ▷, ◇, ▲). */
const ranges = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x192, 0x192],
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
  [0x25a0, 0x25ff],
  [0x2713, 0x2713]
]
const text = ranges.flatMap(([from, to]) =>
  Array.from({ length: to! - from! + 1 }, (_, i) => String.fromCodePoint(from! + i))
).join("")

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
for (const font of fs.readdirSync(brand).filter((f) => /\.(otf|ttf)$/.test(f))) {
  const woff2: Buffer = await subsetFont(fs.readFileSync(path.join(brand, font)), text, { targetFormat: "woff2" })
  fs.writeFileSync(path.join(out, font.replace(/\.(otf|ttf)$/, ".woff2")), woff2)
}
for (const licence of fs.readdirSync(brand).filter((f) => f.endsWith("-OFL.txt"))) {
  fs.copyFileSync(path.join(brand, licence), path.join(out, licence))
}
