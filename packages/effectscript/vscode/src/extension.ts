/**
 * The EffectScript VS Code extension (spec §7.4, ADR-0041). Language features come from VS Code's
 * TypeScript server with the `@effectscript/language` plugin (ADR-0019); this module adds the
 * commands and the effect-`await` decorations (ADR-0039).
 *
 * @since 4.0.0
 */
import { editorsToDecorate } from "@effectscript/language/decorations"
import { toTypeScript } from "effectscript/compiler"
import { planConversion, retargetImports } from "effectscript/convert/plan"
import { packageInfo } from "effectscript/project"
import * as path from "node:path"
import * as vscode from "vscode"

const scheme = "efx-compiled"
const sourceFiles = "**/*.{ts,tsx,mts,cts,efx,js,jsx,mjs,cjs}"

/** `efx-compiled:` URIs carry the source URI in their query. */
const compiledUri = (source: vscode.Uri): vscode.Uri =>
  vscode.Uri.from({ scheme, path: `${source.path}.ts`, query: source.toString() })

const isEffectScript = (document: vscode.TextDocument) =>
  document.languageId === "effectscript" || document.uri.path.endsWith(".efx")

/** The compiled TypeScript of an `.efx` document, as Show Compiled TypeScript displays it. */
const compiledText = (document: vscode.TextDocument): string => {
  const result = toTypeScript(document.getText(), {
    filename: document.uri.fsPath,
    recover: true,
    ...packageInfo(document.uri.fsPath)
  })
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  const header = errors.length === 0
    ? ""
    : `// ${errors.length} EffectScript error(s); the output below may be partial:\n${
      errors.map((d) => `//   ${d.code}: ${d.message}`).join("\n")
    }\n\n`
  return `${header}${result.code}`
}

/** The workspace's source files (project-relative posix path → text), open editors winning. */
const workspaceFiles = async (folder: vscode.WorkspaceFolder): Promise<Map<string, string>> => {
  const open = new Map(vscode.workspace.textDocuments.map((d) => [d.uri.toString(), d]))
  const files = new Map<string, string>()
  const found = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, sourceFiles),
    "**/node_modules/**"
  )
  for (const uri of found) {
    const relative = path.posix.relative(folder.uri.path, uri.path)
    const document = open.get(uri.toString())
    files.set(
      relative,
      document !== undefined
        ? document.getText()
        : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8")
    )
  }
  return files
}

const fullRange = (text: string): vscode.Range => {
  const lines = text.split("\n")
  return new vscode.Range(0, 0, lines.length - 1, lines.at(-1)!.length)
}

/** Applies a conversion and saves every file it touched, so the disk matches the editors. */
const applyAndSave = async (edit: vscode.WorkspaceEdit): Promise<boolean> => {
  if (!(await vscode.workspace.applyEdit(edit))) return false
  for (const [uri] of edit.entries()) {
    const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())
    if (document?.isDirty) await document.save()
  }
  return true
}

/** One undoable edit: rename `from`, then replace its text and rewrite its importers. */
const conversionEdit = (
  folder: vscode.WorkspaceFolder,
  files: ReadonlyMap<string, string>,
  rename: { readonly from: string; readonly to: string; readonly code: string },
  importers: ReadonlyArray<{ readonly file: string; readonly code: string }>
): vscode.WorkspaceEdit => {
  const edit = new vscode.WorkspaceEdit()
  const at = (file: string) => vscode.Uri.joinPath(folder.uri, file)
  edit.renameFile(at(rename.from), at(rename.to), { overwrite: false })
  edit.replace(at(rename.to), fullRange(files.get(rename.from)!), rename.code)
  for (const importer of importers) edit.replace(at(importer.file), fullRange(files.get(importer.file)!), importer.code)
  return edit
}

const target = async (folder: vscode.WorkspaceFolder, file: string): Promise<boolean> => {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, file))
    return true
  } catch {
    return false
  }
}

/**
 * The document a command acts on: the clicked file when VS Code passes one (explorer, title bar,
 * review I1), else the active editor's.
 */
const targetDocument = async (uri: unknown): Promise<vscode.TextDocument | undefined> =>
  uri instanceof vscode.Uri ? vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document

const converting = <A>(file: string, task: () => Promise<A>): Thenable<A> =>
  vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Converting ${file}…` }, task)

const convertToEffectScript = async (output: vscode.OutputChannel, uri: unknown) => {
  const document = await targetDocument(uri)
  const folder = document && vscode.workspace.getWorkspaceFolder(document.uri)
  if (document === undefined || folder === undefined || !/\.tsx?$/.test(document.uri.path)) {
    return vscode.window.showWarningMessage(
      "Convert File to EffectScript works on a .ts or .tsx file in a workspace folder"
    )
  }
  const file = path.posix.relative(folder.uri.path, document.uri.path)
  const { files, plan } = await converting(file, async () => {
    const files = await workspaceFiles(folder)
    const { packageName, packageRoot } = packageInfo(document.uri.fsPath)
    return {
      files,
      plan: planConversion(files, {
        only: new Set([file]),
        packageName,
        packageRoot: packageRoot === undefined ? undefined : path.relative(folder.uri.fsPath, packageRoot)
      })
    }
  })
  const [rename] = plan.renames
  if (rename === undefined) {
    const reason = plan.skipped.find((s) => s.file === file)?.reason ?? "nothing to convert"
    return vscode.window.showInformationMessage(`${file} stays TypeScript: ${reason}`)
  }
  if (!(await applyAndSave(conversionEdit(folder, files, rename, plan.edits)))) {
    return vscode.window.showErrorMessage(`Couldn't convert ${file}`)
  }
  await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, rename.to))
  if (rename.notes.length > 0) {
    output.appendLine(`${rename.to}: ${rename.notes.length} part(s) stayed TypeScript`)
    for (const note of rename.notes) output.appendLine(`  ${note.message}`)
    output.show(true)
  }
}

const convertToTypeScript = async (uri: unknown) => {
  const document = await targetDocument(uri)
  const folder = document && vscode.workspace.getWorkspaceFolder(document.uri)
  if (document === undefined || folder === undefined || !document.uri.path.endsWith(".efx")) {
    return vscode.window.showWarningMessage("Convert File to TypeScript works on a .efx file in a workspace folder")
  }
  const result = toTypeScript(document.getText(), {
    filename: document.uri.fsPath,
    ...packageInfo(document.uri.fsPath)
  })
  const errors = result.diagnostics.filter((d) => d.severity === "error")
  if (errors.length > 0) {
    return vscode.window.showErrorMessage(`Fix the EffectScript errors first: ${errors[0]!.code} ${errors[0]!.message}`)
  }
  const file = path.posix.relative(folder.uri.path, document.uri.path)
  const to = file.replace(/\.efx$/, result.mode === "tsx" ? ".tsx" : ".ts")
  if (await target(folder, to)) return vscode.window.showErrorMessage(`${to} already exists`)
  const edit = await converting(file, async () => {
    const files = await workspaceFiles(folder)
    return conversionEdit(folder, files, { from: file, to, code: result.code }, retargetImports(files, file, to))
  })
  if (!(await applyAndSave(edit))) return vscode.window.showErrorMessage(`Couldn't convert ${file}`)
  await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, to))
}

/** Effect binds, styled with the themable `effectscript.effectAwait` color (ADR-0039). */
const bindDecorations = (context: vscode.ExtensionContext) => {
  const decoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor("effectscript.effectAwait"),
    fontStyle: "italic"
  })
  const update = (editor: vscode.TextEditor) => {
    const { binds } = toTypeScript(editor.document.getText(), { recover: true })
    editor.setDecorations(
      decoration,
      binds.map((b) => new vscode.Range(editor.document.positionAt(b.start), editor.document.positionAt(b.end)))
    )
  }
  const updateAll = (edited?: vscode.TextDocument) => {
    for (const editor of editorsToDecorate(vscode.window.visibleTextEditors, edited, isEffectScript)) update(editor)
  }
  // edits are coalesced per document; the editors are looked up when the timer fires
  const timers = new Map<vscode.TextDocument, ReturnType<typeof setTimeout>>()
  const later = (document: vscode.TextDocument) => {
    clearTimeout(timers.get(document))
    timers.set(
      document,
      setTimeout(() => {
        timers.delete(document)
        updateAll(document)
      }, 150)
    )
  }
  updateAll()
  context.subscriptions.push(
    decoration,
    { dispose: () => timers.forEach((timer) => clearTimeout(timer)) },
    vscode.window.onDidChangeVisibleTextEditors(() => updateAll()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isEffectScript(e.document)) later(e.document)
    })
  )
}

/**
 * @since 4.0.0
 * @category extension
 */
export const activate = (context: vscode.ExtensionContext): void => {
  const changed = new vscode.EventEmitter<vscode.Uri>()
  const output = vscode.window.createOutputChannel("EffectScript")
  context.subscriptions.push(
    changed,
    output,
    vscode.workspace.registerTextDocumentContentProvider(scheme, {
      onDidChange: changed.event,
      provideTextDocumentContent: async (uri) =>
        compiledText(await vscode.workspace.openTextDocument(vscode.Uri.parse(uri.query)))
    }),
    // Show Compiled TypeScript follows every edit of its source
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isEffectScript(e.document)) changed.fire(compiledUri(e.document.uri))
    }),
    vscode.commands.registerCommand("effectscript.showCompiledTypeScript", async (uri: unknown) => {
      const document = await targetDocument(uri)
      if (document === undefined || !isEffectScript(document)) {
        return vscode.window.showWarningMessage("Show Compiled TypeScript works on a .efx file")
      }
      // the `.efx.ts` path makes it a TypeScript document
      const compiled = await vscode.workspace.openTextDocument(compiledUri(document.uri))
      await vscode.window.showTextDocument(compiled, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: true,
        preserveFocus: true
      })
    }),
    vscode.commands.registerCommand(
      "effectscript.convertToEffectScript",
      (uri: unknown) => convertToEffectScript(output, uri)
    ),
    vscode.commands.registerCommand("effectscript.convertToTypeScript", (uri: unknown) => convertToTypeScript(uri))
  )
  bindDecorations(context)
}

/**
 * @since 4.0.0
 * @category extension
 */
export const deactivate = (): void => {}
