import { bindHover, promiseAwaitMessage } from "@effectscript/language/guardrails"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { position, startLsp } from "./utils/lsp.ts"

process.env.EFFECTSCRIPT_DEV = "1"

const packageDir = path.resolve(import.meta.dirname, "..")
const packages = path.resolve(packageDir, "../..")
const server = path.join(packageDir, "bin/efx-language-server.js")

const a = [
  "const p: Promise<number> = Promise.resolve(1)",
  "export effect double(n: number): number {",
  "  const x = await succeed(n)",
  "  const y = await p",
  "  return x * 2",
  "}",
  "effect {",
  "  1",
  "}",
  ""
].join("\n")
const b = "import { double } from \"./a.efx\"\nexport const r = double(2)\n"

const tsconfig = {
  compilerOptions: {
    strict: true,
    target: "ES2022",
    lib: ["ESNext"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    allowImportingTsExtensions: true,
    allowArbitraryExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    paths: {
      "effect": [path.join(packages, "effect/src/index.ts")],
      "effect/*": [path.join(packages, "effect/src/*/index.ts"), path.join(packages, "effect/src/*.ts")]
    }
  },
  include: ["*.ts", "*.efx"]
}

const workspace = (withTypeScript: boolean) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-lsp-")))
  fs.writeFileSync(path.join(dir, "a.efx"), a)
  fs.writeFileSync(path.join(dir, "b.ts"), b)
  fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(tsconfig))
  if (withTypeScript) {
    fs.mkdirSync(path.join(dir, "node_modules"))
    fs.symlinkSync(path.join(packageDir, "node_modules/typescript"), path.join(dir, "node_modules/typescript"))
  }
  return dir
}

const start = async (dir: string) => {
  const lsp = startLsp(process.execPath, [server, "--stdio"], { cwd: dir })
  const init = await lsp.request("initialize", {
    processId: null,
    rootUri: pathToFileURL(dir).href,
    workspaceFolders: [{ uri: pathToFileURL(dir).href, name: "w" }],
    capabilities: {
      textDocument: {
        hover: { contentFormat: ["markdown", "plaintext"] },
        diagnostic: {},
        semanticTokens: {
          requests: { full: true },
          tokenTypes: ["keyword", "variable"],
          tokenModifiers: ["effect"],
          formats: ["relative"]
        },
        completion: { completionItem: { snippetSupport: false } }
      },
      workspace: { workspaceFolders: true }
    },
    initializationOptions: {}
  })
  lsp.notify("initialized", {})
  return { lsp, init }
}

const open = (lsp: ReturnType<typeof startLsp>, dir: string, name: string, text: string) => {
  const uri = pathToFileURL(path.join(dir, name)).href
  lsp.notify("textDocument/didOpen", {
    textDocument: { uri, languageId: name.endsWith(".efx") ? "effectscript" : "typescript", version: 1, text }
  })
  return uri
}

describe("efx-language-server (Plan 11 Task 3, ADR-0040)", () => {
  const dir = workspace(true)
  let session: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    session = await start(dir)
  }, 120_000)
  afterAll(() => {
    session.lsp.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("reports EffectScript and rewritten Promise-await diagnostics", async () => {
    const uri = open(session.lsp, dir, "a.efx", a)
    const report = await session.lsp.request("textDocument/diagnostic", { textDocument: { uri } })
    const messages = report.items.map((d: { message: string }) => d.message)
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringContaining("EFX2003"), promiseAwaitMessage])
    )
    const promise = report.items.find((d: { message: string }) => d.message === promiseAwaitMessage)
    expect(promise.range.start).toEqual(position(a, a.indexOf("p\n  return")))
  }, 120_000)

  it("explains an effect await on hover", async () => {
    const uri = open(session.lsp, dir, "a.efx", a)
    const hover = await session.lsp.request("textDocument/hover", {
      textDocument: { uri },
      position: position(a, a.indexOf("await succeed") + 1)
    })
    expect(JSON.stringify(hover.contents)).toContain(bindHover.slice(0, 30))
  }, 120_000)

  it("completes and navigates through the TypeScript service", async () => {
    const uri = open(session.lsp, dir, "a.efx", a)
    const completion = await session.lsp.request("textDocument/completion", {
      textDocument: { uri },
      position: position(a, a.indexOf("x * 2"))
    })
    const items = Array.isArray(completion) ? completion : completion.items
    expect(items.map((i: { label: string }) => i.label)).toEqual(expect.arrayContaining(["n", "x"]))
    const bUri = open(session.lsp, dir, "b.ts", b)
    const definition = await session.lsp.request("textDocument/definition", {
      textDocument: { uri: bUri },
      position: position(b, b.indexOf("double(2)"))
    })
    const target = Array.isArray(definition) ? definition[0] : definition
    expect(target.targetUri ?? target.uri).toBe(uri)
  }, 120_000)

  it("serves incomplete code (ADR-0020)", async () => {
    const broken = "export effect f(n: number) {\n  const x = await succeed(n)\n  const y = x.\n}\n"
    const uri = open(session.lsp, dir, "broken.efx", broken)
    const report = await session.lsp.request("textDocument/diagnostic", { textDocument: { uri } })
    expect(report.items.map((d: { message: string }) => d.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("EFX1001")])
    )
    const hover = await session.lsp.request("textDocument/hover", {
      textDocument: { uri },
      position: position(broken, broken.indexOf("await") + 1)
    })
    expect(JSON.stringify(hover.contents)).toContain(bindHover.slice(0, 30))
    const completion = await session.lsp.request("textDocument/completion", {
      textDocument: { uri },
      position: position(broken, broken.indexOf("x.\n") + 2)
    })
    const items = Array.isArray(completion) ? completion : completion.items
    expect(items.map((i: { label: string }) => i.label)).toContain("toFixed")
  }, 120_000)

  it("marks binds with a keyword token carrying the effect modifier", async () => {
    const uri = open(session.lsp, dir, "a.efx", a)
    const legend = session.init.capabilities.semanticTokensProvider.legend
    const tokens = await session.lsp.request("textDocument/semanticTokens/full", { textDocument: { uri } })
    const decoded: Array<{ line: number; character: number; length: number; type: string; modifiers: number }> = []
    let line = 0
    let character = 0
    for (let i = 0; i < tokens.data.length; i += 5) {
      const [dl, dc, length, type, modifiers] = tokens.data.slice(i, i + 5)
      line += dl
      character = dl === 0 ? character + dc : dc
      decoded.push({ line, character, length, type: legend.tokenTypes[type], modifiers })
    }
    const effect = 1 << legend.tokenModifiers.indexOf("effect")
    const at = position(a, a.indexOf("await succeed"))
    expect(decoded).toContainEqual({ ...at, length: 5, type: "keyword", modifiers: effect })
  }, 120_000)
})

describe("efx-language-server without the project's TypeScript", () => {
  it("serves with its own TypeScript and says so", async () => {
    const dir = workspace(false)
    const { lsp } = await start(dir)
    try {
      const uri = open(lsp, dir, "a.efx", a)
      const hover = await lsp.request("textDocument/hover", {
        textDocument: { uri },
        position: position(a, a.indexOf("x * 2"))
      })
      expect(JSON.stringify(hover.contents)).toContain("const x: number")
      const log = await lsp.waitFor((n) => n.method === "window/logMessage" && /TypeScript \d/.test(n.params.message))
      expect(log.params.message).toMatch(/bundled with the language server/)
    } finally {
      lsp.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
