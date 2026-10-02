/**
 * @since 0.1.0
 */
import type { MagicString } from "magic-string"
import type { Scope, ScopeAnalysis } from "./analyze/scope.ts"
import type { Node } from "./ast.ts"
import type { Diagnostic } from "./diagnostics.ts"
import type { ImportSet } from "./imports.ts"
import type { ResolvedOptions, SourceRange } from "./options.ts"

/**
 * Returning `true` means "I visited the children myself".
 *
 * @since 0.1.0
 * @category models
 */
export type Handler = (node: Node, parent: Node | undefined, ctx: Ctx) => boolean | void

/**
 * @since 0.1.0
 * @category models
 */
export interface EffectFrame {
  readonly node: Node
  readonly kind: "declaration" | "arrow" | "method" | "block" | "main"
  scoped: boolean
  readonly layerConstructor: boolean
}

/**
 * @since 0.1.0
 * @category models
 */
export interface Ctx {
  readonly source: string
  readonly s: MagicString
  readonly options: ResolvedOptions
  readonly analysis: ScopeAnalysis
  readonly diagnostics: Array<Diagnostic>
  /** Effect binds: `await` keywords lowered to `yield*` (ADR-0039). */
  readonly binds: Array<SourceRange>
  readonly imports: ImportSet
  readonly handlers: ReadonlyMap<string, ReadonlyArray<Handler>>
  /** `module\0export` → local name for compiler-owned references (ADR-0009). */
  readonly refs: Map<string, string>
  /** Names handed out by `fresh`. */
  readonly generatedNames: Set<string>
  scope: Scope
  effect: EffectFrame | undefined
  /** The effect frame around the node being walked, before a function boundary reset it. */
  outerEffect: EffectFrame | undefined
  service: string | undefined
  namespace: string
  /** Inside `describe … with layer`, the `it` that `layer(…)` passes in. */
  testIt: string | undefined
}

/**
 * @since 0.1.0
 * @category constructors
 */
export const makeFrame = (node: Node, kind: EffectFrame["kind"], layerConstructor = false): EffectFrame => ({
  node,
  kind,
  scoped: false,
  layerConstructor
})

/**
 * @since 0.1.0
 * @category combinators
 */
export const withEffect = <A>(ctx: Ctx, frame: EffectFrame | undefined, f: () => A): A => {
  const previous = ctx.effect
  ctx.effect = frame
  try {
    return f()
  } finally {
    ctx.effect = previous
  }
}

/**
 * @since 0.1.0
 * @category combinators
 */
export const withNamespace = <A>(ctx: Ctx, namespace: string, f: () => A): A => {
  const previous = ctx.namespace
  ctx.namespace = namespace
  try {
    return f()
  } finally {
    ctx.namespace = previous
  }
}
