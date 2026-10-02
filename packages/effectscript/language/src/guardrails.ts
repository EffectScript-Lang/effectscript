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
 * Whether a TypeScript error is "this Promise isn't iterable" (TS2488) right after a bind: the
 * `yield*` the bind became can't iterate a Promise.
 *
 * @since 4.0.0
 * @category guardrails
 */
export const isPromiseAwait = (
  source: string,
  binds: ReadonlyArray<SourceRange>,
  code: number,
  message: string,
  start: number | undefined
): boolean =>
  code === 2488 && /^Type '(Promise|PromiseLike)</.test(message) && start !== undefined &&
  binds.some((b) => b.end <= start && source.slice(b.end, start).trim() === "")

/** The first line of a TypeScript message (a chain's head carries the type). */
const headline = (text: string | ts.DiagnosticMessageChain): string =>
  typeof text === "string" ? text : text.messageText

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
  compiled: (fileName: string) => Compiled | undefined
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
          if (file === undefined) return diagnostics
          return diagnostics.map((d) =>
            isPromiseAwait(file.source, file.binds, d.code, headline(d.messageText), d.start)
              ? { ...d, messageText: promiseAwaitMessage }
              : d
          )
        }
      }
      return Reflect.get(target, key, receiver)
    }
  })
}
