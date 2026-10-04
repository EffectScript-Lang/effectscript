import { describe, expect, it } from "vitest"
import { banner, type Env, handle } from "../src/gate.ts"

/** Static assets: `/soon/` is the teaser, `/docs/` a page, `/_astro/a.css` a file. */
const assets: Env["ASSETS"] = {
  fetch: async (request) => {
    const { pathname } = new URL(request.url)
    if (pathname === "/soon/") {
      return new Response("<html><body>teaser</body></html>", { headers: { "content-type": "text/html" } })
    }
    if (pathname.endsWith(".css")) return new Response("body{}", { headers: { "content-type": "text/css" } })
    return new Response(`<html><body class="x">page ${pathname}</body></html>`, {
      headers: { "content-type": "text/html" }
    })
  }
}
const env: Env = { ASSETS: assets, INVITE_CODE: "s3cret" }
const get = (path: string, init: RequestInit = {}, e: Env = env) =>
  handle(new Request(`https://effectscript.dev${path}`, init), e)

const inviteCookie = async () => {
  const response = await get("/?invite=s3cret")
  return response.headers.get("set-cookie")!.split(";")[0]!
}

describe("the private-preview gate (ADR-0073)", () => {
  it("shows the teaser at / and sends every other page there", async () => {
    expect(await (await get("/")).text()).toBe("<html><body>teaser</body></html>")
    const docs = await get("/docs/start/install/")
    expect([docs.status, docs.headers.get("location")]).toEqual([302, "/"])
  })

  it("serves the files the teaser needs to everyone", async () => {
    expect(await (await get("/_astro/a.css")).text()).toBe("body{}")
  })

  it("lets an invite in: a cookie with a hash of the code, a clean URL, then the site with a banner", async () => {
    const response = await get("/docs/?invite=s3cret&x=1")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/docs/?x=1")
    const cookie = response.headers.get("set-cookie")!
    expect(cookie).toMatch(/^efx_preview=[0-9a-f]{64}; Max-Age=\d+; Path=\/; HttpOnly; Secure; SameSite=Lax$/)
    expect(cookie).not.toContain("s3cret")
    const page = await get("/docs/", { headers: { cookie: await inviteCookie() } })
    expect(await page.text()).toBe(`<html><body class="x">${banner}page /docs/</body></html>`)
  })

  it("refuses a wrong code, a forged cookie, and everyone when no code is set", async () => {
    expect((await get("/?invite=guess")).headers.get("set-cookie")).toBeNull()
    expect((await get("/docs/", { headers: { cookie: "efx_preview=s3cret" } })).status).toBe(302)
    const closed: Env = { ASSETS: assets }
    expect(await (await get("/", {}, closed)).text()).toBe("<html><body>teaser</body></html>")
    expect((await get("/?invite=", {}, closed)).headers.get("set-cookie")).toBeNull()
  })

  it("keeps everything out of search engines and shared caches", async () => {
    expect(await (await get("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n")
    for (const path of ["/", "/_astro/a.css", "/robots.txt"]) {
      expect((await get(path)).headers.get("x-robots-tag")).toBe("noindex, nofollow")
    }
    const page = await get("/docs/", { headers: { cookie: await inviteCookie() } })
    expect(page.headers.get("cache-control")).toBe("private, no-store")
  })
})
