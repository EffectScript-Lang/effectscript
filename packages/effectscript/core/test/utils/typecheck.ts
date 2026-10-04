import * as fs from "node:fs"
import * as path from "node:path"
import * as ts from "typescript"

const root = path.resolve(import.meta.dirname, "../../../../..")
const virtualDir = path.join(root, "packages/effectscript/core/test/.virtual")
const src = (p: string) => path.join(root, "packages", p)

const effectPaths = (): Record<string, Array<string>> => {
  const manifest = JSON.parse(fs.readFileSync(src("effect/package.json"), "utf8")) as {
    readonly exports: Record<string, unknown>
  }
  const paths: Record<string, Array<string>> = {}
  for (const [key, value] of Object.entries(manifest.exports)) {
    if (typeof value === "string" && value.endsWith(".ts")) {
      paths[key === "." ? "effect" : `effect/${key.slice(2)}`] = [src(`effect/${value.slice(2)}`)]
    }
  }
  return paths
}

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  moduleDetection: ts.ModuleDetectionKind.Force,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.ReactJSX,
  types: ["node"],
  paths: {
    // mirrors effect's export map: exact entries for the subpath indexes, then `./*` (ADR-0089)
    ...effectPaths(),
    "@effect/platform-node": [src("platform/node/src/index.ts")],
    "@effect/platform-bun": [src("platform/bun/src/index.ts")],
    "@effect/vitest": [src("vitest/src/index.ts")]
  }
}

/** Type-checks virtual files (name → code); returns diagnostics located in those files. */
export const typecheck = (files: ReadonlyMap<string, string>): Array<string> => {
  const virtual = new Map([...files].map(([name, code]) => [path.join(virtualDir, name), code]))
  const host = ts.createCompilerHost(compilerOptions, true)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const code = virtual.get(fileName)
    return code !== undefined
      ? ts.createSourceFile(fileName, code, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate)
  }
  const fileExists = host.fileExists.bind(host)
  host.fileExists = (fileName) => virtual.has(fileName) || fileExists(fileName)
  const readFile = host.readFile.bind(host)
  host.readFile = (fileName) => virtual.get(fileName) ?? readFile(fileName)
  const program = ts.createProgram([...virtual.keys()], compilerOptions, host)
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => d.file !== undefined && virtual.has(d.file.fileName))
    .map((d) => {
      const { character, line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0)
      const name = path.relative(virtualDir, d.file!.fileName)
      return `${name}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`
    })
}
