/**
 * Rewrites relative `.efx` module specifiers (for `efx build` output).
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Handler } from "../context.ts"
import type { HandlerGroup } from "./registry.ts"

const rewrite: Handler = (node, _parent, ctx) => {
  const extension = ctx.options.rewriteImportExtensions
  if (extension === false) return
  const source: Node | null | undefined = node.type === "ImportExpression" ? node.source : node.source
  if (source?.type !== "Literal" || typeof source.value !== "string") return
  const value: string = source.value
  if (!value.startsWith(".") || !value.endsWith(".efx")) return
  const end = source.end - 1 // before the closing quote
  ctx.s.update(end - 4, end, `.${extension}`)
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const importRewriteHandlers: HandlerGroup = {
  ImportDeclaration: rewrite,
  ExportAllDeclaration: rewrite,
  ExportNamedDeclaration: rewrite,
  ImportExpression: rewrite
}
