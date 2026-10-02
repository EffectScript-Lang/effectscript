/**
 * The `await` guardrails of ADR-0006 in the editor (ADR-0039): a hover that explains an effect
 * bind, and a plain-English error for awaiting a Promise inside `effect` code. Both hosts use
 * them: the TS server plugin (VS Code) and the standalone language server.
 *
 * @since 4.0.0
 */
import type { SourceRange } from "effectscript/compiler"
import type * as ts from "typescript"

/**
 * @since 4.0.0
 * @category guardrails
 */
export const bindHover = "Effect bind (`yield*`): runs this effect here and short-circuits on failure"

/**
 * @since 4.0.0
 * @category guardrails
 */
export const promiseAwaitMessage = "Cannot `await` a Promise inside `effect`: use `await tryPromise(() => …)`"

/**
 * The bind whose `await` keyword covers `offset`.
 *
 * @since 4.0.0
 * @category guardrails
 */
export const bindAt = (binds: ReadonlyArray<SourceRange>, offset: number): SourceRange | undefined =>
  binds.find((b) => b.start <= offset && offset < b.end)

/**
 * Whether `start` (a diagnostic's) directly follows a bind: only whitespace between them.
 *
 * @since 4.0.0
 * @category guardrails
 */
export const followsBind = (source: string, binds: ReadonlyArray<SourceRange>, start: number | undefined): boolean =>
  start !== undefined && binds.some((b) => b.end <= start && source.slice(b.end, start).trim() === "")

/**
 * Whether the expression that starts at `offset` in the compiled file has a thenable type: a
 * Promise by any name (an alias, an interface extending `Promise`, a library's own promise). The
 * checker decides, so it holds in every locale (review I2).
 *
 * @since 4.0.0
 * @category guardrails
 */
export const isThenableAt = (typescript: Checks, program: ts.Program, fileName: string, offset: number): boolean => {
  const file = program.getSourceFile(fileName)
  if (file === undefined) return false
  // the outermost node that starts at `offset` is the operand of the `yield*`
  let operand: ts.Node | undefined
  const visit = (node: ts.Node): void => {
    if (operand !== undefined || offset < node.pos || offset >= node.end) return
    if (node !== file && node.getStart(file) === offset) {
      operand = node
      return
    }
    typescript.forEachChild(node, visit)
  }
  visit(file)
  if (operand === undefined) return false
  const checker = program.getTypeChecker()
  const type = checker.getTypeAtLocation(operand)
  const awaited = checker.getAwaitedType(type)
  return awaited !== undefined && awaited !== type
}

/**
 * The parts of the TypeScript module the guardrails use.
 *
 * @since 4.0.0
 * @category models
 */
export type Checks = Pick<typeof ts, "forEachChild" | "flattenDiagnosticMessageText">

/** TS2488: "Type '…' must have a '[Symbol.iterator]()' method", what `yield*` over a Promise gives. */
const notIterable = 2488

/**
 * @since 4.0.0
 * @category models
 */
export interface Compiled {
  readonly source: string
  readonly binds: ReadonlyArray<SourceRange>
}

/**
 * Adds the guardrails to a TypeScript language service whose `.efx` positions are source
 * positions (a Volar proxy). `compiled` returns the latest compile of a file.
 *
 * @since 4.0.0
 * @category guardrails
 */
export const decorateGuardrails = (
  service: ts.LanguageService,
  compiled: (fileName: string) => Compiled | undefined,
  typescript: Checks
): ts.LanguageService => {
  const getQuickInfoAtPosition = service.getQuickInfoAtPosition.bind(service)
  const getSemanticDiagnostics = service.getSemanticDiagnostics.bind(service)
  return new Proxy(service, {
    get(target, key, receiver) {
      if (key === "getQuickInfoAtPosition") {
        return (fileName: string, position: number, ...rest: Array<never>) => {
          if (!fileName.endsWith(".efx")) return getQuickInfoAtPosition(fileName, position, ...rest)
          // the first request for a file compiles it
          if (compiled(fileName) === undefined) target.getProgram()?.getSourceFile(fileName)
          const bind = bindAt(compiled(fileName)?.binds ?? [], position)
          if (bind === undefined) return getQuickInfoAtPosition(fileName, position, ...rest)
          return {
            kind: "keyword" as ts.ScriptElementKind,
            kindModifiers: "",
            textSpan: { start: bind.start, length: bind.end - bind.start },
            displayParts: [{ text: "await", kind: "keyword" }, { text: " (effect bind)", kind: "text" }],
            documentation: [{ text: bindHover, kind: "text" }]
          } satisfies ts.QuickInfo
        }
      }
      if (key === "getSemanticDiagnostics") {
        return (fileName: string) => {
          const diagnostics = getSemanticDiagnostics(fileName)
          const file = fileName.endsWith(".efx") ? compiled(fileName) : undefined
          if (file === undefined || !diagnostics.some((d) => d.code === notIterable)) return diagnostics
          // the program holds the compiled file: find which TS2488 messages are about thenables there
          const program = target.getProgram()
          const thenables = new Set<string>()
          for (const d of program?.getSemanticDiagnostics(program.getSourceFile(fileName)) ?? []) {
            if (
              d.code === notIterable && d.start !== undefined && isThenableAt(typescript, program!, fileName, d.start)
            ) {
              thenables.add(typescript.flattenDiagnosticMessageText(d.messageText, "\n"))
            }
          }
          return diagnostics.map((d) =>
            d.code === notIterable && followsBind(file.source, file.binds, d.start) &&
              thenables.has(typescript.flattenDiagnosticMessageText(d.messageText, "\n"))
              ? { ...d, messageText: promiseAwaitMessage }
              : d
          )
        }
      }
      return Reflect.get(target, key, receiver)
    }
  })
}
