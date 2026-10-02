// Runs inside VS Code's extension host (Plan 11 Task 5): drives the installed EffectScript
// extension and writes what it saw to EFX_E2E_OUT. Throwing fails the run.
const fs = require("node:fs")
const vscode = require("vscode")

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const poll = async (what, get, ok, seconds = 120) => {
  let last
  for (let i = 0; i < seconds * 2; i++) {
    last = await get()
    if (ok(last)) return last
    await sleep(500)
  }
  throw new Error(`timed out waiting for ${what}: ${JSON.stringify(last)}`)
}
const hoverText = (hovers) =>
  (hovers ?? []).flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value))).join("\n")

exports.run = async () => {
  const results = {}
  const root = vscode.workspace.workspaceFolders[0].uri
  const at = (file) => vscode.Uri.joinPath(root, file)
  const exists = async (file) => vscode.workspace.fs.stat(at(file)).then(() => true, () => false)
  const read = async (file) => Buffer.from(await vscode.workspace.fs.readFile(at(file))).toString("utf8")

  const extension = vscode.extensions.getExtension("effectscript.effectscript-vscode")
  if (extension === undefined) throw new Error("the EffectScript extension isn't installed")

  const a = await vscode.workspace.openTextDocument(at("a.efx"))
  await vscode.window.showTextDocument(a)
  results.languageId = a.languageId
  await poll("activation", () => extension.isActive, (active) => active)

  // the TypeScript server with the bundled plugin: hover on an effect bind
  const bind = a.positionAt(a.getText().indexOf("await succeed") + 1)
  results.hover = hoverText(
    await poll("the bind hover", () => vscode.commands.executeCommand("vscode.executeHoverProvider", a.uri, bind), (h) =>
      hoverText(h).includes("Effect bind"))
  )
  results.diagnostics = (await poll(
    "diagnostics",
    () => vscode.languages.getDiagnostics(a.uri).map((d) => d.message),
    (messages) => messages.some((m) => m.includes("Promise inside `effect`"))
  ))

  await vscode.commands.executeCommand("effectscript.showCompiledTypeScript")
  const compiled = await poll(
    "Show Compiled TypeScript",
    () => vscode.workspace.textDocuments.find((d) => d.uri.scheme === "efx-compiled"),
    (d) => d !== undefined
  )
  results.compiled = compiled.getText()

  const b = await vscode.workspace.openTextDocument(at("b.ts"))
  await vscode.window.showTextDocument(b)
  await vscode.commands.executeCommand("effectscript.convertToEffectScript")
  await poll("b.efx", () => exists("b.efx"), (yes) => yes)
  results.toEffectScript = { b: await read("b.efx"), c: await read("c.ts"), oldGone: !(await exists("b.ts")) }

  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(at("b.efx")))
  await vscode.commands.executeCommand("effectscript.convertToTypeScript")
  await poll("b.ts", () => exists("b.ts"), (yes) => yes)
  results.toTypeScript = { b: await read("b.ts"), c: await read("c.ts"), oldGone: !(await exists("b.efx")) }

  // from the explorer or a title bar, the command gets the clicked file, not the active one (review I1)
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(at("a.efx")))
  await vscode.commands.executeCommand("effectscript.convertToEffectScript", at("d.ts"))
  await poll("d.efx", () => exists("d.efx"), (yes) => yes, 30)
  results.byUri = { converted: await exists("d.efx"), activeStays: await exists("a.efx") }

  fs.writeFileSync(process.env.EFX_E2E_OUT, JSON.stringify(results, null, 2))
}
