# ADR-0073: The site launches as a private preview behind an invite link, on Workers with `cf`

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user (publish the site, first to Effect developers privately, no sign-up, on
  effectscript.dev, with the new `cf` CLI rather than Wrangler); agent ruling for the details
- **Related:** ADR-0054 (the site), ADR-0062 (release order); RELEASING.md step 13

## Context

The user wants effectscript.dev online now, shown first to Effect developers they invite, with a
teaser for everyone else and no registration. None of the packages are published yet, so the
site's install commands don't work. The user asked for Cloudflare's new CLI, `cf`, instead of
Wrangler. During its beta, `cf` can't build Astro 6 or later, and the site uses Astro 7.

## Decision

- **A separate deploy package, `packages/effectscript/site-edge`:** a Vite project with the
  Cloudflare Vite plugin. Its static assets are the Astro build (`publicDir: "../site/dist"`), and
  its Worker (`src/gate.ts`) runs first on every request. `cloudflare.config.ts` names the Worker
  `effectscript-site`, binds the assets and the `INVITE_CODE` secret, and publishes it as the
  Workers Custom Domain `effectscript.dev` (Cloudflare creates the DNS record and certificate).
- **The gate:**
  - `?invite=<code>` with the right code sets an `HttpOnly`, `Secure` cookie for 60 days holding a
    SHA-256 hash of the code (never the code), and redirects to the same URL without it.
  - With the cookie, the site is served with a banner saying it isn't released and asking people
    to keep the link to themselves.
  - Without it, `/` is the teaser (`site/src/pages/soon.astro`) and every other page redirects
    there; the teaser's own files are served to everyone.
  - Without a configured code, everyone sees the teaser (it fails closed).
  - Every response has `X-Robots-Tag: noindex, nofollow`, HTML is `private, no-store`, and
    `/robots.txt` disallows everything.
- **Secrets stay out of the repository:** the invite code lives in the package's gitignored
  `.dev.vars` and is uploaded with each version (`cf deploy --secrets-file .dev.vars`); the account
  id is in a gitignored `.env`. Changing the code locks out every earlier link and cookie.
- **Deploy:** `pnpm --filter @effectscript/site-edge deploy` builds the site, then runs `cf deploy`.

## Consequences

- Invited developers see the real site, playground included, with a clear "not released" banner;
  search engines and uninvited visitors see only the teaser.
- Launch is a change to the gate (serve everything, drop the banner and `noindex`), or removing the
  Worker and serving the assets directly.
- A leaked link works until the code is changed; anyone can then be locked out by rotating it.
- **Cost if wrong:** `cf` and its configuration are in beta and may change; the deploy package is
  small, so adapting it is cheap.

## Alternatives considered

- **A waitlist with email sign-up (D1, Turnstile):** the user wanted no registration, and storing
  emails needs a privacy policy.
- **Cloudflare Access in front of the site:** a login per visitor is too much friction for sharing
  with a community.
- **Wrangler, or building Astro through `cf`:** the user asked for `cf`, and `cf` doesn't build
  Astro 7 during its beta; a Vite project around the prebuilt site does.
