/**
 * Shared state and comment-preserving edit helpers for the reverse compiler (ADR-0030: a rewrite
 * never drops a comment).
 *
 * @since 4.0.0
 */
import type { MagicString } from "magic-string"
import type { ScopeAnalysis } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { ResolvedOptions, Runtime } from "../options.ts"
import type { Comment } from "../parser/parse.ts"

/**
 * The compile options that change compiler output, so the reverse direction decides with the same
 * inputs as the forward one (ADR-0030).
 *
 * @since 4.0.0
 * @category models
 */
export interface ConvertOptions {
  readonly filename?: string | undefined
  readonly packageName?: string | undefined
  readonly packageRoot?: string | undefined
  readonly runtime?: Runtime | undefined
  readonly prelude?: boolean | undefined
  readonly ambient?: boolean | undefined
  readonly strict?: boolean | undefined
  readonly observability?: "otlp" | undefined
}

/**
 * @since 4.0.0
 * @category models
 */
export interface ConvertNote {
  readonly start: number
  readonly end: number
  /** Why a near match stayed TypeScript. */
  readonly message: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface ReverseCtx {
  readonly source: string
  readonly s: MagicString
  readonly analysis: ScopeAnalysis
  readonly options: ResolvedOptions
  readonly comments: ReadonlyArray<Comment>
  /** Local names of `Effect` / `Schema` imported from `effect` (ADR-0009). */
  readonly effect: string | undefined
  readonly schema: string | undefined
  readonly layer: string | undefined
  /** Classes this conversion turns into `error` declarations (the forward `localErrors`). */
  readonly errors: Set<string>
  /** Module consts that may become pipe-less `effect` declarations (for the strict blockers). */
  readonly effectCandidates: Set<string>
  /** Module consts that become pipe-less `effect` declarations (the forward `localEffects`). */
  readonly effects: Set<string>
  readonly notes: Array<ConvertNote>
  /** Whether `($) => …` pipe steps become `%` steps (see `topicsRoundTrip`). */
  topics: boolean
  /** Whether the generator frame being visited gets its scope back from the forward compiler. */
  deferAllowed: boolean
  /**
   * Generated binders (`defect`, `error`) of converted `try` lowerings. The forward compiler names
   * them with `unused(…)`, so no other identifier may use those names (checked in `toEffectScript`).
   */
  readonly binders: Set<Node>
  /** Sugar turned off for a rerun, when a file-wide check fails after converting. */
  readonly disabled: ReadonlySet<"try" | "main">
  /** `main` telemetry depends on a directive that only becomes leading once imports are removed. */
  telemetryDirective: boolean
  /** The namespace the forward compiler resolves bare builtins in at the visited position. */
  namespace: "Effect" | "Layer" | "Atom" | "Command"
  /** The service whose layer is being visited: its `effect` members are named `Svc.member`. */
  service: string | undefined
  /** Inside `describe … with`: the `it` parameter tests are called through. */
  testIt: string | undefined
  /** Top-level statement indexes to convert (all when `undefined`); see `toEffectScript`. */
  readonly only: ReadonlySet<number> | undefined
}

/**
 * @since 4.0.0
 * @category utils
 */
export const note = (ctx: ReverseCtx, node: Node, message: string): void => {
  ctx.notes.push({ start: node.start, end: node.end, message })
}

/**
 * @since 4.0.0
 * @category utils
 */
export const slice = (ctx: ReverseCtx, node: Node): string => ctx.source.slice(node.start, node.end)

/**
 * Comments fully inside `[start, end)`.
 *
 * @since 4.0.0
 * @category comments
 */
export const commentsIn = (ctx: ReverseCtx, start: number, end: number): Array<Comment> =>
  ctx.comments.filter((c) => c.start >= start && c.end <= end)

/** Comment texts joined so that code may follow (a line comment ends its line). */
const commentBlock = (ctx: ReverseCtx, comments: ReadonlyArray<Comment>, separator: string): string =>
  comments.map((c) => `${ctx.source.slice(c.start, c.end)}${c.line ? "\n" : separator}`).join("")

const indentAt = (source: string, offset: number): string => {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1
  return /^[ \t]*/.exec(source.slice(lineStart, offset))![0]
}

/**
 * Replaces `[start, end)` with `text`. Comments inside the range move to their own lines before
 * `hoistTo` (a statement start), so code tokens change and comments survive in order.
 *
 * @since 4.0.0
 * @category comments
 */
export const replaceHoistingComments = (
  ctx: ReverseCtx,
  start: number,
  end: number,
  text: string,
  hoistTo: number
): void => {
  const comments = commentsIn(ctx, start, end)
  if (start === end) ctx.s.appendLeft(start, text)
  else ctx.s.update(start, end, text)
  if (comments.length === 0) return
  const indent = indentAt(ctx.source, hoistTo)
  ctx.s.appendLeft(hoistTo, comments.map((c) => `${ctx.source.slice(c.start, c.end)}\n${indent}`).join(""))
}

/**
 * Replaces `[start, end)` with `text`, keeping the range's comments just before it.
 *
 * @since 4.0.0
 * @category comments
 */
export const replaceKeepingComments = (ctx: ReverseCtx, start: number, end: number, text: string): void => {
  const comments = commentsIn(ctx, start, end)
  const replacement = `${commentBlock(ctx, comments, " ")}${text}`
  if (start < end) ctx.s.update(start, end, replacement)
  else if (replacement !== "") ctx.s.appendLeft(start, replacement)
}

/**
 * Removes `[start, end)` except for its comments, which stay in place.
 *
 * @since 4.0.0
 * @category comments
 */
export const removeKeepingComments = (ctx: ReverseCtx, start: number, end: number): void => {
  if (start >= end) return
  const comments = commentsIn(ctx, start, end)
  if (comments.length === 0) {
    ctx.s.remove(start, end)
    return
  }
  ctx.s.update(start, end, ` ${commentBlock(ctx, comments, " ").trimEnd()}${comments.at(-1)!.line ? "\n" : ""}`)
}

/**
 * Turns the separator between two call arguments (`,<gap>`) into a pipe (`<gap>|> `): the exact
 * inverse of the forward `removePipeOp`, which keeps the gap and swaps `|> ` for a comma.
 *
 * @since 4.0.0
 * @category pipes
 */
export const commaToPipe = (ctx: ReverseCtx, comma: number, next: Node): boolean => {
  if (comma === -1) return false
  ctx.s.remove(comma, comma + 1)
  ctx.s.appendLeft(next.start, "|> ")
  return true
}

/**
 * The first `,` in `[from, to)` outside comments, or -1.
 *
 * @since 4.0.0
 * @category utils
 */
export const separatorComma = (ctx: ReverseCtx, from: number, to: number): number => {
  for (let i = from; i < to; i++) {
    const comment = ctx.comments.find((c) => c.start === i)
    if (comment !== undefined) i = comment.end - 1
    else if (ctx.source[i] === ",") return i
  }
  return -1
}

/**
 * Runs `f` with the forward namespace (and optionally the service) set for the visited code.
 *
 * @since 4.0.0
 * @category utils
 */
export const within = (
  ctx: ReverseCtx,
  namespace: ReverseCtx["namespace"],
  f: () => void,
  service: string | undefined = ctx.service
): void => {
  const previous = [ctx.namespace, ctx.service] as const
  ctx.namespace = namespace
  ctx.service = service
  f()
  ctx.namespace = previous[0]
  ctx.service = previous[1]
}
