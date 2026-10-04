/**
 * The private-preview gate in front of effectscript.dev (ADR-0073). A visitor with the invite
 * cookie sees the site, with a banner saying it isn't released yet; anyone else sees the teaser
 * (`/soon`) and the files it needs. `?invite=<code>` sets the cookie. Nothing is indexed.
 *
 * @since 4.0.0
 */

/** The bindings the Worker gets. */
export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
  /** The invite code, a secret. Without it, everyone sees the teaser. */
  readonly INVITE_CODE?: string
}

const cookieName = "efx_preview"
const maxAge = 60 * 24 * 60 * 60

/** Files the teaser itself loads, served to everyone. */
const teaserFiles = [
  // the teaser; assets redirect /soon/ to /soon (htmlHandling "drop-trailing-slash", ADR-0079)
  /^\/soon\/?$/,
  /^\/_astro\//,
  /^\/fonts\//,
  /^\/favicon\.(ico|svg)$/,
  /^\/apple-touch-icon\.png$/,
  /^\/icon-[\w-]+\.png$/,
  /^\/og-image\.jpg$/,
  /^\/site\.webmanifest$/
]

/** The banner the full site carries during the preview. */
export const banner =
  `<div role="note" style="position:sticky;top:0;z-index:1000;background:#fafafa;color:#09090b;font:500 14px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center">` +
  `Private preview: EffectScript isn't released yet. The packages aren't on npm or the VS Code Marketplace, so the install commands work at launch. Please keep this link to yourself.` +
  `</div>`

/** The cookie's value: a hash of the code, so the cookie doesn't carry the code itself. */
const token = async (code: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`effectscript-preview:${code}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const cookieOf = (request: Request): string | undefined => {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === cookieName) return value.join("=")
  }
  return undefined
}

/** Equal strings, compared in time that doesn't depend on where they differ. */
const same = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Headers every response gets: never indexed, never shared between visitors by a cache. */
const privately = (response: Response): Response => {
  const copy = new Response(response.body, response)
  copy.headers.set("x-robots-tag", "noindex, nofollow")
  if ((copy.headers.get("content-type") ?? "").includes("text/html")) {
    copy.headers.set("cache-control", "private, no-store")
  }
  return copy
}

/** The banner, right after `<body …>`. */
const withBanner = async (response: Response): Promise<Response> => {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response
  const html = await response.text()
  const body = /<body[^>]*>/i.exec(html)
  const text = body === null
    ? html
    : `${html.slice(0, body.index + body[0].length)}${banner}${html.slice(body.index + body[0].length)}`
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return new Response(text, { status: response.status, statusText: response.statusText, headers })
}

const teaser = (request: Request, env: Env): Promise<Response> =>
  env.ASSETS.fetch(new Request(new URL("/soon", request.url), { headers: request.headers }))

/**
 * Handles one request.
 *
 * @since 4.0.0
 */
export const handle = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  if (url.pathname === "/robots.txt") {
    return privately(new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } }))
  }
  const code = env.INVITE_CODE === undefined || env.INVITE_CODE === "" ? undefined : env.INVITE_CODE
  const expected = code === undefined ? undefined : await token(code)
  const invite = url.searchParams.get("invite")
  if (invite !== null && expected !== undefined && same(await token(invite), expected)) {
    url.searchParams.delete("invite")
    return privately(
      new Response(null, {
        status: 302,
        headers: {
          location: `${url.pathname}${url.search}`,
          "set-cookie": `${cookieName}=${expected}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
        }
      })
    )
  }
  const cookie = cookieOf(request)
  if (expected !== undefined && cookie !== undefined && same(cookie, expected)) {
    return privately(await withBanner(await env.ASSETS.fetch(request)))
  }
  if (teaserFiles.some((file) => file.test(url.pathname))) return privately(await env.ASSETS.fetch(request))
  if (url.pathname === "/") return privately(await teaser(request, env))
  return privately(new Response(null, { status: 302, headers: { location: "/" } }))
}

export default { fetch: handle }
