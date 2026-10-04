/**
 * Tags from names (ADR-0010, ADR-0087): what `catch (e: T)` and `is T` compare `_tag` with.
 *
 * @since 4.0.0
 */
import type { Scope } from "../analyze/scope.ts"
import type { Node } from "../ast.ts"
import type { Ctx } from "../context.ts"

/** `A` → `A`; `A.B`, as an expression or a type name, → `B`. */
const lastSegment = (name: Node): string =>
  name.type === "TSQualifiedName" ? name.right.name : name.type === "MemberExpression" ? name.property.name : name.name

/** Whether the nearest binding of type name `name` is the module scope. */
const boundAtModule = (ctx: Ctx, name: string): boolean => {
  for (let scope: Scope | undefined = ctx.scope; scope !== undefined; scope = scope.parent) {
    if (scope.types.has(name)) return scope === ctx.analysis.module
  }
  return false
}

/**
 * The `_tag` a name stands for: a module-level `error`'s or tagged `schema`'s declared tag,
 * otherwise the name's last segment.
 *
 * @since 4.0.0
 * @category tags
 */
export const tagOf = (ctx: Ctx, name: Node): string => {
  if (name.type === "Identifier" && boundAtModule(ctx, name.name)) {
    const tag = ctx.analysis.localTags.get(name.name)
    if (tag !== undefined) return tag
  }
  return lastSegment(name)
}

/**
 * A name, `this`, or property reads without calls: safe to read once per tag (EFX7002).
 *
 * @since 4.0.0
 * @category tags
 */
export const isPlainReference = (node: Node): boolean =>
  node.type === "Identifier" || node.type === "ThisExpression" ||
  (node.type === "MemberExpression" && node.optional !== true &&
    (!node.computed || node.property.type === "Literal") && isPlainReference(node.object))
