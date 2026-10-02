import { runTests } from "@vscode/test-electron"
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

// Opt-in: it opens a VS Code window for about a minute (EFX_VSCODE_E2E=1).
const app = process.env.EFX_VSCODE_APP ?? "/Applications/Visual Studio Code.app"
const enabled = process.env.EFX_VSCODE_E2E === "1" && fs.existsSync(app)
const extensionDir = path.resolve(import.meta.dirname, "..")
const packages = path.resolve(extensionDir, "../..")
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "efx-vscode-e2e-")))
afterAll(() => fs.rmSync(work, { recursive: true, force: true }))

const files: Record<string, string> = {
  "a.efx": [
    "const p: Promise<number> = Promise.resolve(1)",
    "export effect double(n: number): number {",
    "  const x = await succeed(n)",
    "  const y = await p",
    "  return x * 2 + y",
    "}",
    ""
  ].join("\n"),
  "b.ts":
    "import { Effect } from \"effect\"\n\nexport const greet = Effect.fn(\"greet\")(function*(name: string) {\n  return `Hello, ${name}`\n})\n",
  "c.ts": "import { greet } from \"./b.ts\"\n\nexport const hi = greet(\"Ada\")\n",
  "tsconfig.json": JSON.stringify({
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
  })
}

describe.skipIf(!enabled)("the extension in VS Code (Plan 11 Task 5, ADR-0041)", () => {
  it("installs from the .vsix and serves hovers, diagnostics and the commands", async () => {
    const vsix = path.join(work, "effectscript.vsix")
    const packaged = spawnSync(process.execPath, [path.join(extensionDir, "scripts/package.ts"), "--out", vsix], {
      encoding: "utf8"
    })
    expect(packaged.status, packaged.stderr).toBe(0)
    // a throwaway profile: the user's settings and extensions are never touched
    const userData = path.join(work, "user-data")
    const extensions = path.join(work, "extensions")
    fs.mkdirSync(path.join(userData, "User"), { recursive: true })
    fs.writeFileSync(
      path.join(userData, "User/settings.json"),
      JSON.stringify({
        "security.workspace.trust.enabled": false,
        "update.mode": "none",
        "extensions.autoUpdate": false
      })
    )
    const cli = path.join(app, "Contents/Resources/app/bin/code")
    const installed = spawnSync(cli, [
      "--user-data-dir",
      userData,
      "--extensions-dir",
      extensions,
      "--install-extension",
      vsix
    ], {
      encoding: "utf8"
    })
    expect(installed.status, installed.stderr).toBe(0)
    const workspace = path.join(work, "workspace")
    fs.mkdirSync(workspace)
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(workspace, name), text)
    // the runner travels as a development extension that only carries the test entry point
    const runnerExtension = path.join(work, "runner")
    fs.mkdirSync(runnerExtension)
    fs.writeFileSync(
      path.join(runnerExtension, "package.json"),
      JSON.stringify({ name: "efx-e2e-runner", publisher: "test", version: "0.0.0", engines: { vscode: "^1.95.0" } })
    )
    const out = path.join(work, "results.json")
    await runTests({
      vscodeExecutablePath: path.join(app, "Contents/MacOS/Code"),
      extensionDevelopmentPath: runnerExtension,
      extensionTestsPath: path.join(import.meta.dirname, "e2e/runner.cjs"),
      extensionTestsEnv: { EFX_E2E_OUT: out },
      launchArgs: [
        workspace,
        "--user-data-dir",
        userData,
        "--extensions-dir",
        extensions,
        "--skip-welcome",
        "--skip-release-notes"
      ]
    })
    const results = JSON.parse(fs.readFileSync(out, "utf8"))
    expect(results.languageId).toBe("effectscript")
    expect(results.hover).toContain("Effect bind (`yield*`)")
    expect(results.diagnostics).toContain("Cannot `await` a Promise inside `effect`: use `await tryPromise(() => …)`")
    expect(results.compiled).toContain("yield* Effect.succeed(n)")
    expect(results.toEffectScript.b).toContain("export effect greet(name: string)")
    expect(results.toEffectScript.c).toContain("from \"./b.efx\"")
    expect(results.toEffectScript.oldGone).toBe(true)
    expect(results.toTypeScript.b).toContain("Effect.fn(\"greet\")")
    expect(results.toTypeScript.c).toContain("from \"./b.ts\"")
    expect(results.toTypeScript.oldGone).toBe(true)
  }, 300_000)
})
