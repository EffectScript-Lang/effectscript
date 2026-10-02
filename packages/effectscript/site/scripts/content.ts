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

if (import.meta.main) brandAssets()
