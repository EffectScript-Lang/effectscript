/**
 * Generates src/compiler/prelude/tables.ts from the workspace `effect` package and the TypeScript
 * standard library. Run with `pnpm codegen` from packages/effectscript/core.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import ts from "typescript"

const packageDir = path.resolve(import.meta.dirname, "..")
const effectDir = path.resolve(packageDir, "../../effect")
const read = (file: string): string => fs.readFileSync(file, "utf8")

const namespaceReexports = (indexFile: string): Array<string> =>
  [...read(indexFile).matchAll(/^export \* as (\w+) from "\.\/\w+\.ts"/gm)].map((m) => m[1]!)

/** The specifiers of each `export { … }` block, without the comments documenting them. */
const exportBlocks = (text: string): Array<string> => {
  const blocks: Array<string> = []
  for (const m of text.matchAll(/^export \{/gm)) {
    let i = m.index + m[0].length
    let block = ""
    while (i < text.length && text[i] !== "}") {
      if (text.startsWith("/*", i)) i = text.indexOf("*/", i) + 2
      else if (text.startsWith("//", i)) i = text.indexOf("\n", i)
      else block += text[i++]
    }
    blocks.push(block)
  }
  return blocks
}

const valueExports = (file: string): Set<string> => {
  const text = read(file)
  const names = new Set<string>()
  for (const m of text.matchAll(/^export (?:declare )?(?:const|let|function\*?|class|abstract class) (\w+)/gm)) {
    names.add(m[1]!)
  }
  for (const block of exportBlocks(text)) {
    for (const raw of block.split(",")) {
      const spec = raw.trim()
      if (spec === "" || spec.startsWith("type ")) continue
      const parts = spec.split(/\s+as\s+/)
      names.add((parts[1] ?? parts[0]!).trim())
    }
  }
  return names
}

const typeExports = (file: string): Set<string> =>
  new Set(
    [...read(file).matchAll(/^export (?:declare )?(?:interface|type|class|abstract class) (\w+)/gm)].map((m) => m[1]!)
  )

// --- modules -----------------------------------------------------------------------------------

const moduleSpecifiers = new Map<string, string>()
const moduleFiles = new Map<string, string>()
for (const name of namespaceReexports(path.join(effectDir, "src/index.ts"))) {
  moduleSpecifiers.set(name, "effect")
  moduleFiles.set(name, path.join(effectDir, "src", `${name}.ts`))
}
const manifest = JSON.parse(read(path.join(effectDir, "package.json"))) as { readonly exports: Record<string, unknown> }
for (const [key, value] of Object.entries(manifest.exports)) {
  if (!/^\.\/[a-z][a-z-]*$/.test(key) || typeof value !== "string" || !value.endsWith("/index.ts")) continue
  const dir = path.dirname(path.join(effectDir, value))
  for (const name of namespaceReexports(path.join(effectDir, value))) {
    if (moduleSpecifiers.has(name)) continue
    moduleSpecifiers.set(name, `effect/${key.slice(2)}`)
    moduleFiles.set(name, path.join(dir, `${name}.ts`))
  }
}

// --- globals that must keep their JavaScript meaning ---------------------------------------------

const reserved = [
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "Infinity",
  "instanceof",
  "interface",
  "let",
  "NaN",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield"
]
const web = [
  "AbortController",
  "AbortSignal",
  "alert",
  "Blob",
  "blur",
  "close",
  "closed",
  "confirm",
  "crypto",
  "document",
  "event",
  "Event",
  "EventSource",
  "EventTarget",
  "fetch",
  "File",
  "find",
  "focus",
  "FormData",
  "frames",
  "Headers",
  "history",
  "length",
  "localStorage",
  "location",
  "name",
  "navigator",
  "open",
  "origin",
  "parent",
  "performance",
  "print",
  "prompt",
  "requestAnimationFrame",
  "Request",
  "Response",
  "screen",
  "scroll",
  "self",
  "sessionStorage",
  "status",
  "stop",
  "TextDecoder",
  "TextEncoder",
  "top",
  "URL",
  "URLSearchParams",
  "WebSocket",
  "window",
  "Worker",
  "clearImmediate",
  "clearInterval",
  "clearTimeout",
  "console",
  "queueMicrotask",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "structuredClone"
]
const globals = new Set<string>([...reserved, ...web])
const tsLib = path.join(packageDir, "node_modules/typescript/lib")
for (const file of fs.readdirSync(tsLib)) {
  if (!/^lib\.(es|decorators).*\.d\.ts$/.test(file)) continue
  const text = read(path.join(tsLib, file))
  for (const m of text.matchAll(/^declare (?:var|let|const|function|class|namespace) (\w+)/gm)) globals.add(m[1]!)
  for (const m of text.matchAll(/^(?:interface|type) (\w+)/gm)) globals.add(m[1]!)
}
// `global { … }` / `declare global { … }` bodies, including ones nested in `declare module "…"`.
const globalBlocks = (text: string): Array<string> => {
  const blocks: Array<string> = []
  for (const match of text.matchAll(/(?:declare\s+)?global\s*\{/g)) {
    const start = match.index! + match[0].length
    let depth = 1
    let i = start
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++
      else if (text[i] === "}") depth--
      i++
    }
    blocks.push(text.slice(start, i - 1))
  }
  return blocks
}

const nodeTypes = path.join(packageDir, "node_modules/@types/node")
for (const file of fs.readdirSync(nodeTypes)) {
  if (!file.endsWith(".d.ts")) continue
  for (const block of globalBlocks(read(path.join(nodeTypes, file)))) {
    for (const m of block.matchAll(/^\s*(?:var|let|const|function|class|namespace) (\w+)/gm)) globals.add(m[1]!)
  }
}
for (const name of ["Buffer", "exports", "global", "module", "process", "require", "__dirname", "__filename"]) {
  globals.add(name)
}

// --- tables ------------------------------------------------------------------------------------

const modules = [...moduleSpecifiers].filter(([name]) => !globals.has(name)).sort(([a], [b]) => a.localeCompare(b))
const namespaces: Record<string, string> = {
  Effect: path.join(effectDir, "src/Effect.ts"),
  Layer: path.join(effectDir, "src/Layer.ts"),
  Schema: path.join(effectDir, "src/Schema.ts"),
  Atom: path.join(effectDir, "src/reactivity/Atom.ts"),
  Command: path.join(effectDir, "src/cli/Command.ts")
}
// Global *types* from DOM/worker/node (e.g. `Crypto`, `Console`) keep their meaning as bare type names.
const globalTypes = new Set<string>()
for (const file of fs.readdirSync(tsLib)) {
  if (!/^lib\.(dom|webworker).*\.d\.ts$/.test(file)) continue
  for (const m of read(path.join(tsLib, file)).matchAll(/^(?:interface|type) (\w+)/gm)) {
    globalTypes.add(m[1]!)
  }
}
for (const file of fs.readdirSync(nodeTypes)) {
  if (!file.endsWith(".d.ts")) continue
  for (const block of globalBlocks(read(path.join(nodeTypes, file)))) {
    for (const m of block.matchAll(/^\s*(?:interface|type) (\w+)/gm)) globalTypes.add(m[1]!)
  }
}
const bareTypes = modules.map(([name]) => name).filter((name) =>
  typeExports(moduleFiles.get(name)!).has(name) && !globalTypes.has(name)
)
const serviceTags = modules.map(([name]) => name).filter((name) => {
  const text = read(moduleFiles.get(name)!)
  const index = text.search(new RegExp(`^export const ${name}\\b`, "m"))
  return index !== -1 && /Context\.|Service</.test(text.slice(index, index + 400))
})

// --- pipeable exports (ADR-0300 A1) ---------------------------------------------------------------

/**
 * Which exports produce a `Pipeable`, from `effect`'s types: `v` when the value is one, and each
 * argument count (0–9, 9 standing for 9 or more) at which every signature that accepts that many
 * arguments returns one. `|>` compiles to `.pipe(…)` on exactly these heads.
 */
const pipeable = (() => {
  const files = new Map(modules.map(([name]) => [name, moduleFiles.get(name)!]))
  const program = ts.createProgram([...files.values()], {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    types: []
  })
  const checker = program.getTypeChecker()
  const isPipeable = (type: ts.Type): boolean => {
    const apparent = checker.getApparentType(type)
    if (apparent.isUnion()) return apparent.types.every(isPipeable)
    const pipe = checker.getPropertyOfType(apparent, "pipe")
    return pipe !== undefined && checker.getTypeOfSymbol(pipe).getCallSignatures().length > 0
  }
  const accepts = (signature: ts.Signature, n: number): boolean => {
    const declaration = signature.getDeclaration() as ts.SignatureDeclaration | undefined
    const rest = declaration?.parameters.some((p) => p.dotDotDotToken !== undefined) ?? false
    return signature.minArgumentCount <= n && (rest || n <= signature.getParameters().length)
  }
  /** A call that returns a function taking a `Pipeable`: a data-last step (`Effect.map(f)`). */
  const isStep = (type: ts.Type): boolean => {
    const signatures = type.getCallSignatures()
    return signatures.length > 0 && signatures.every((s) => {
      const first = s.getParameters()[0]
      return first !== undefined && isPipeable(checker.getTypeOfSymbol(first))
    })
  }
  const table = new Map<string, string>()
  const steps = new Map<string, string>()
  for (const [name, file] of files) {
    const source = program.getSourceFile(file)
    const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)
    if (symbol === undefined) continue
    const entries: Array<string> = []
    const stepEntries: Array<string> = []
    for (const exported of checker.getExportsOfModule(symbol)) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      if (!(target.flags & ts.SymbolFlags.Value)) continue
      const type = checker.getTypeOfSymbolAtLocation(target, source!)
      let spec = isPipeable(type) ? "v" : ""
      const signatures = type.getCallSignatures()
      for (let n = 0; n <= 9; n++) {
        const applicable = signatures.filter((s) => accepts(s, n))
        if (applicable.length > 0 && applicable.every((s) => isPipeable(s.getReturnType()))) spec += String(n)
      }
      if (spec !== "") entries.push(`${exported.name}:${spec}`)
      // `v`: the value itself is a step (`Effect.orDie`, `Effect.asVoid`)
      let step = isStep(type) ? "v" : ""
      for (let n = 0; n <= 9; n++) {
        const applicable = signatures.filter((s) => accepts(s, n))
        if (applicable.length > 0 && applicable.every((s) => isStep(s.getReturnType()))) step += String(n)
      }
      if (step !== "") stepEntries.push(`${exported.name}:${step}`)
    }
    if (entries.length > 0) table.set(name, entries.sort().join(" "))
    if (stepEntries.length > 0) steps.set(name, stepEntries.sort().join(" "))
  }
  return { table, steps }
})()

const out: Array<string> = []
const doc = (text: string) => out.push("/**", ` * ${text}`, " *", " * @since 0.1.0", " */")
const list = (values: ReadonlyArray<string>) => values.map((v) => `  ${v}`).join(",\n")
out.push(
  "/**",
  " * GENERATED by scripts/generate-prelude.ts from packages/effect. Do not edit by hand.",
  " *",
  " * @since 0.1.0",
  " */",
  ""
)
doc("Prelude modules (name → module specifier).")
out.push(
  `export const preludeModules: ReadonlyMap<string, string> = new Map([\n${
    list(modules.map(([n, m]) => `[${JSON.stringify(n)}, ${JSON.stringify(m)}]`))
  }\n])`,
  ""
)
doc("Prelude modules (name → the module's own file, ADR-0089).")
out.push(
  `export const preludeModuleFiles: ReadonlyMap<string, string> = new Map([\n${
    list(modules.map(([n]) => {
      const file = path.relative(path.join(effectDir, "src"), moduleFiles.get(n)!).replace(/\.ts$/, "")
      return `[${JSON.stringify(n)}, ${JSON.stringify(`effect/${file.split(path.sep).join("/")}`)}]`
    }))
  }\n])`,
  ""
)
doc("Prelude functions (name → module specifier).")
out.push(
  `export const preludeFunctions: ReadonlyMap<string, string> = new Map([\n${
    list(["flow", "identity", "pipe"].map((n) => `[${JSON.stringify(n)}, "effect"]`))
  }\n])`,
  ""
)
for (const [namespace, file] of Object.entries(namespaces)) {
  const names = [...valueExports(file)].filter((n) => !globals.has(n)).sort()
  doc(`Value exports of \`${namespace}\` usable as bare builtins.`)
  out.push(
    `export const ${namespace.toLowerCase()}Exports: ReadonlySet<string> = new Set([\n${
      list(names.map((n) => JSON.stringify(n)))
    }\n])`,
    ""
  )
}
{
  const names = [...valueExports(namespaces.Schema!)].filter((n) => globals.has(n) && /^is[A-Z]/.test(n)).sort()
  doc("Schema checks named like a JavaScript global (`isFinite`): in a `where` list they mean the check (ADR-0077).")
  out.push(
    `export const schemaGlobalChecks: ReadonlySet<string> = new Set([\n${
      list(names.map((n) => JSON.stringify(n)))
    }\n])`,
    ""
  )
}
doc("Namespace → builtin names.")
out.push(
  `export const namespaceExports: ReadonlyMap<string, ReadonlySet<string>> = new Map([\n${
    list(Object.keys(namespaces).map((n) => `[${JSON.stringify(n)}, ${n.toLowerCase()}Exports]`))
  }\n])`,
  ""
)
doc("Modules whose same-named type exists (`Effect<A>` → `Effect.Effect<A>`).")
out.push(
  `export const bareTypes: ReadonlySet<string> = new Set([\n${list(bareTypes.map((n) => JSON.stringify(n)))}\n])`,
  ""
)
doc("Modules whose same-named export is a service tag (`await FileSystem` → `yield* FileSystem.FileSystem`).")
out.push(
  `export const serviceTags: ReadonlySet<string> = new Set([\n${list(serviceTags.map((n) => JSON.stringify(n)))}\n])`,
  ""
)
doc(
  "Exports that produce a `Pipeable` (ADR-0300 A1): `name:spec`, where `v` is the value and digits are argument counts."
)
out.push(
  `export const pipeableExports: ReadonlyMap<string, string> = new Map([\n${
    list([...pipeable.table].map(([n, spec]) => `[${JSON.stringify(n)}, ${JSON.stringify(spec)}]`))
  }\n])`,
  ""
)
doc(
  "Steps over a `Pipeable` (ADR-0300 A7): `name:spec`, where `v` is the value itself and digits are argument counts whose call returns a function taking one."
)
out.push(
  `export const pipeableSteps: ReadonlyMap<string, string> = new Map([\n${
    list([...pipeable.steps].map(([n, spec]) => `[${JSON.stringify(n)}, ${JSON.stringify(spec)}]`))
  }\n])`,
  ""
)
doc("Names that always keep their JavaScript meaning.")
out.push(
  `export const excludedNames: ReadonlySet<string> = new Set([\n${
    list([...globals].sort().map((n) => JSON.stringify(n)))
  }\n])`,
  ""
)

fs.writeFileSync(path.join(packageDir, "src/compiler/prelude/tables.ts"), out.join("\n"))
