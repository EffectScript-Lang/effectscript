/**
 * The site's build output is this Worker's static assets: Vite copies `publicDir` into the client
 * build, and the Cloudflare plugin bundles the gate (ADR-0073).
 */
import { cloudflare } from "@cloudflare/vite-plugin"
import { defineConfig } from "vite"

export default defineConfig({
  publicDir: "../site/dist",
  plugins: [cloudflare()]
})
