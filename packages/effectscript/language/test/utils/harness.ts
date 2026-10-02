import { createLanguagePlugin } from "@effectscript/language"
import { type Compiled, decorateGuardrails } from "@effectscript/language/guardrails"
import { createLanguage, FileMap } from "@volar/language-core"
import { createProxyLanguageService, decorateLanguageServiceHost, resolveFileLanguageId } from "@volar/typescript"
import * as path from "node:path"
import ts from "typescript"

const packages = path.resolve(import.meta.dirname, "../../../..")
let counter = 0

/**
 * An in-process TypeScript language service decorated the way tsserver decorates it with the
 * EffectScript plugin (see `@volar/typescript` `createLanguageServicePlugin`).
 */
export const createHarness = (files: Record<string, string>, options_: { readonly guardrails?: boolean } = {}) => {
  const dir = path.join(packages, "effectscript/language/test/.virtual", `project-${counter++}`)
  const contents = new Map(Object.entries(files).map(([name, text]) => [path.join(dir, name), text]))
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.esnext.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
    allowImportingTsExtensions: true,
    allowArbitraryExtensions: true,
    allowNonTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    paths: {
      "effect": [path.join(packages, "effect/src/index.ts")],
      "effect/*": [path.join(packages, "effect/src/*/index.ts"), path.join(packages, "effect/src/*.ts")]
    }
  }
  const snapshot = (text: string) => ts.ScriptSnapshot.fromString(text)
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...contents.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const text = contents.get(fileName) ?? (ts.sys.fileExists(fileName) ? ts.sys.readFile(fileName) : undefined)
      return text === undefined ? undefined : snapshot(text)
    },
    getCurrentDirectory: () => dir,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (fileName) => contents.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => contents.get(fileName) ?? ts.sys.readFile(fileName),
    directoryExists: (d) => d.startsWith(dir) || ts.sys.directoryExists(d),
    getDirectories: ts.sys.getDirectories,
    readDirectory: ts.sys.readDirectory,
    resolveModuleNameLiterals: (literals, containingFile, _redirected, compilerOptions) =>
      literals.map((literal) => ts.resolveModuleName(literal.text, containingFile, compilerOptions, host))
  }
  const service = ts.createLanguageService(host)
  const originalSnapshot = host.getScriptSnapshot.bind(host)
  const compiles = new Map<string, Compiled>()
  const language = createLanguage<string>(
    [
      createLanguagePlugin(ts, {
        onCompile: (fileName, source, _, binds) => compiles.set(fileName, { source, binds })
      }),
      { getLanguageId: resolveFileLanguageId }
    ],
    new FileMap(ts.sys.useCaseSensitiveFileNames),
    (fileName) => {
      const s = originalSnapshot(fileName)
      if (s) language.scripts.set(fileName, s)
      else language.scripts.delete(fileName)
    }
  )
  const { initialize, proxy } = createProxyLanguageService(service)
  initialize(language)
  decorateLanguageServiceHost(ts, language, host)
  // the guardrails the TS server plugin adds (ADR-0039)
  return { dir, service: options_.guardrails ? decorateGuardrails(proxy, (f) => compiles.get(f), ts) : proxy }
}
