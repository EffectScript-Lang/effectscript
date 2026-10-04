/**
 * effectscript.dev (ADR-0073): the site's files, with the gate running first on every request.
 * `INVITE_CODE` is a secret, uploaded with `cf deploy --secrets-file .dev.vars`.
 */
import { bindings, defineConfig } from "cf/config"
import * as entrypoint from "./src/gate.ts" with { type: "cf-worker" }

export default defineConfig({
  worker: {
    name: "effectscript-site",
    entrypoint,
    compatibilityDate: "2026-10-01",
    assets: { runWorkerFirst: true, htmlHandling: "auto-trailing-slash", notFoundHandling: "404-page" },
    // the invite code: `.dev.vars` locally, uploaded with the version on deploy
    env: { ASSETS: bindings.assets(), INVITE_CODE: bindings.secret() },
    // a Workers Custom Domain: Cloudflare creates the DNS record and the certificate
    domains: ["effectscript.dev"],
    workersDev: false
  }
})
