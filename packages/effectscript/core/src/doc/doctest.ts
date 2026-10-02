/**
 * The `?doctest` virtual module (docs spec §2.3): `.efx` source with one `it.effect` per example,
 * every example line kept on its own line and column, so failures point into the doc comment.
 *
 * @since 4.0.0
 */
import * as path from "node:path"
import { type Diagnostic, diagnosticError, diagnosticWarning } from "../compiler/diagnostics.ts"
import { helpers, rewriteExample } from "./examples.ts"
import { allExamples, docModule } from "./model.ts"

const typeKinds = new Set(["type", "interface"])

/**
 * @since 4.0.0
 * @category doctest
 */
export const doctestSource = (
  file: string,
  source: string
): { readonly code: string; readonly diagnostics: ReadonlyArray<Diagnostic> } => {
  const { module, diagnostics: parseDiagnostics } = docModule(file, "", source)
  if (parseDiagnostics.length > 0) return { code: "", diagnostics: parseDiagnostics }
  const main = /(^|\n)\s*main\s*\{/.exec(source)
  if (module.hasMain) {
    const start = main === null ? 0 : main.index + main[0].indexOf("main")
    return {
      code: "",
      diagnostics: [
        diagnosticError(
          "EFX9307",
          "A doctest target can't have a `main` block: importing it would run the program",
          start,
          start + 4,
          "move the examples' code into a module without `main`"
        )
      ]
    }
  }
  const lines = source.split("\n").map(() => "")
  const specifier = `./${path.basename(file)}`
  const values = [
    ...new Set(module.declarations.filter((d) => !typeKinds.has(d.kind) && d.name !== "default").map((d) => d.name))
  ]
  // a name that is both a value and a type comes in once, through the value import
  const types = [
    ...new Set(module.declarations.filter((d) => typeKinds.has(d.kind) && !values.includes(d.name)).map((d) => d.name))
  ]
  // the module's own imports are in scope of its examples too, unchanged: the virtual module lives
  // in the same directory (ADR-0044)
  const header: Array<string> = [...module.importStatements]
  if (values.length > 0) header.push(`import { ${values.join(", ")} } from ${JSON.stringify(specifier)};`)
  if (types.length > 0) header.push(`import type { ${types.join(", ")} } from ${JSON.stringify(specifier)};`)
  header.push(`import * as ${helpers} from "effectscript/doctest";`, "export default ($efxIt) => {")
  lines[0] = header.join(" ")
  const diagnostics: Array<Diagnostic> = []
  const examples = allExamples(module)
  const lineStart = (line: number) => {
    let offset = 0
    for (let i = 1; i < line; i++) offset = source.indexOf("\n", offset) + 1
    return offset
  }
  for (const { owner, example } of examples) {
    const rewritten = rewriteExample(example)
    diagnostics.push(...rewritten.diagnostics)
    lines[example.openLine - 1] = `$efxIt.effect(${JSON.stringify(`${owner}: ${example.title}`)}, () => effect {`
    rewritten.lines.forEach((text, i) => {
      const offset = example.offsets[i]!
      const line = example.openLine + i // code lines follow the opening fence
      lines[line] = `${" ".repeat(offset - lineStart(line + 1))}${text}`
    })
    lines[example.closeLine - 1] = "})"
  }
  if (examples.length === 0) {
    diagnostics.push(
      diagnosticWarning(
        "EFX9305",
        `${path.basename(file)} has no \`efx\` examples to test`,
        0,
        Math.min(1, source.length)
      )
    )
    lines[0] += ` $efxIt.skip(${JSON.stringify(`${path.basename(file)} has no efx examples`)}, () => {});`
  }
  lines.push("}")
  return { code: lines.join("\n"), diagnostics }
}
