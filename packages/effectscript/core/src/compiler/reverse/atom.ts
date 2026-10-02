/**
 * `const x = Atom.make(e)[.pipe(…)]` → `atom x = e [|> …]` (spec §4.14): the inverse of
 * `transform/atom.ts`. The value and the pipes resolve in the `Atom` namespace.
 *
 * @since 4.0.0
 */
import type { Node } from "../ast.ts"
import type { Visit } from "./body.ts"
import { commentsIn, type ReverseCtx, within } from "./context.ts"
import { importedLocal, isMember } from "./origin.ts"
import { isPlainStep } from "./pipes.ts"
import { layerPipes } from "./service.ts"

/**
 * Rewrites a top-level `Atom.make` declaration. Returns false when it isn't one.
 *
 * @since 4.0.0
 * @category reverse
 */
export const convertAtom = (ctx: ReverseCtx, statement: Node, visit: Visit): boolean => {
  const Atom = importedLocal(ctx.analysis, "effect/reactivity", "Atom")
  if (Atom === undefined || statement.type !== "VariableDeclaration" || statement.kind !== "const") return false
  if (statement.declarations.length !== 1) return false
  const declarator: Node = statement.declarations[0]
  if (declarator.id.type !== "Identifier" || declarator.id.typeAnnotation || declarator.init === null) return false
  let head: Node = declarator.init
  const pipe = head.type === "CallExpression" && head.callee.type === "MemberExpression" && !head.callee.computed &&
      head.callee.property.name === "pipe"
    ? head
    : undefined
  if (pipe !== undefined) {
    if (pipe.arguments.length === 0 || !(pipe.arguments as Array<Node>).every((a) => isPlainStep(a))) return false
    head = pipe.callee.object
  }
  if (head.type !== "CallExpression" || !isMember(head.callee, Atom, "make") || head.arguments.length !== 1) {
    return false
  }
  const value: Node = head.arguments[0]
  if (value.type === "SpreadElement" || statement.end !== declarator.init.end) return false
  if (ctx.source.slice(head.callee.end, value.start) !== "(" || ctx.source.slice(value.end, head.end) !== ")") {
    return false
  }
  if (commentsIn(ctx, statement.start, value.start).length > 0) return false
  ctx.s.update(statement.start, statement.start + "const".length, "atom")
  ctx.s.remove(head.start, value.start)
  ctx.s.remove(value.end, head.end)
  within(ctx, "Atom", () => visit(value, head, false))
  if (pipe !== undefined) layerPipes(ctx, pipe, head, visit, "Atom")
  return true
}
