/**
 * `atom name = expr |> …` → `const name = Atom.make(expr).pipe(Atom.…)` (§4.14): pipes apply to
 * the atom and resolve in the `Atom` namespace.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import { type Handler, withNamespace } from "../context.ts"
import { ref } from "../names.ts"
import { walk } from "../walk.ts"
import type { HandlerGroup } from "./registry.ts"

const pipelineHead = (node: Node): Node => (node.type === "PipelineExpression" ? pipelineHead(node.left) : node)

const atomDeclaration: Handler = (node, _parent, ctx) => {
  ctx.s.update(node.keyword.start, node.keyword.end, "const")
  const head = pipelineHead(node.init)
  ctx.s.appendRight(head.start, `${ref(ctx, "effect/reactivity", "Atom")}.make(`)
  ctx.s.prependLeft(head.end, ")")
  head.efxPipeable = true
  withNamespace(ctx, "Atom", () => walk(node.init, node, ctx))
  return true
}

/**
 * @since 4.0.0
 * @category handlers
 */
export const atomHandlers: HandlerGroup = {
  AtomDeclaration: atomDeclaration
}
