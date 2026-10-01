/**
 * Free identifiers → prelude imports and Effect builtins; bare data types; bare service tags.
 *
 * @since 0.1.0
 */
import type { Node } from "../ast.ts"
import type { Ctx, Handler } from "../context.ts"
import { isTypeFree, isValueFree } from "../analyze/scope.ts"
import { ref } from "../names.ts"
import { isBareType, isServiceTag, resolveType, resolveValue } from "../prelude/resolve.ts"
import type { HandlerGroup } from "./registry.ts"

const keyParents = new Set([
  "Property",
  "PropertyDefinition",
  "MethodDefinition",
  "TSDeclareMethod",
  "TSAbstractMethodDefinition",
  "TSAbstractPropertyDefinition",
  "TSPropertySignature",
  "TSMethodSignature",
  "AccessorProperty"
])
const nonReferenceParents = new Set([
  "LabeledStatement",
  "BreakStatement",
  "ContinueStatement",
  "ImportSpecifier",
  "ImportDefaultSpecifier",
  "ImportNamespaceSpecifier",
  "ExportSpecifier",
  "ExportAllDeclaration",
  "MetaProperty"
])
const tsExpressionParents = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSTypeQuery",
  "TSExportAssignment",
  "TSInstantiationExpression"
])

/**
 * @since 0.1.0
 * @category utils
 */
export const isValueReference = (ctx: Ctx, node: Node, parent: Node | undefined): boolean => {
  if (parent === undefined || ctx.analysis.bindings.has(node)) return false
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return false
  if (keyParents.has(parent.type) && parent.key === node && !parent.computed) return false
  if (nonReferenceParents.has(parent.type)) return false
  if (parent.type.startsWith("TS") && !tsExpressionParents.has(parent.type)) return false
  return true
}

const testGlobals = new Set(["assert", "expect", "vi"])

const identifier: Handler = (node, parent, ctx) => {
  if (!isValueReference(ctx, node, parent)) return
  if (
    ctx.analysis.hasTests && testGlobals.has(node.name) && isValueFree(ctx.scope, node.name) &&
    isTypeFree(ctx.scope, node.name)
  ) {
    ctx.imports.need("@effect/vitest", node.name)
    return
  }
  const resolution = resolveValue(ctx, node.name)
  if (resolution === undefined) return
  if (resolution.prefix !== "") {
    // a builtin's qualifier (`retry` → `Effect.retry`) is compiler-owned (ADR-0009)
    const prefix = `${ref(ctx, resolution.module, resolution.importName)}.`
    const shorthand = parent?.type === "Property" && parent.shorthand === true && parent.value === node
    ctx.s.appendRight(node.start, shorthand ? `${node.name}: ${prefix}` : prefix)
    return
  }
  ctx.imports.need(resolution.module, resolution.importName)
  if (
    ctx.effect !== undefined && parent?.type === "AwaitExpression" && parent.argument === node &&
    isServiceTag(node.name)
  ) {
    ctx.s.prependLeft(node.end, `.${node.name}`)
  }
}

const typeReference: Handler = (node, _parent, ctx) => {
  const typeName: Node = node.typeName
  if (typeName.type !== "Identifier" || !isBareType(typeName.name)) return
  const resolution = resolveType(ctx, typeName.name)
  if (resolution === undefined) return
  ctx.imports.need(resolution.module, resolution.importName)
  ctx.s.appendRight(typeName.start, `${typeName.name}.`)
}

const qualifiedName: Handler = (node, _parent, ctx) => {
  let left: Node = node.left
  while (left.type === "TSQualifiedName") left = left.left
  if (left.type === "Identifier") {
    const resolution = resolveType(ctx, left.name)
    if (resolution !== undefined) ctx.imports.need(resolution.module, resolution.importName)
  }
  return true
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const preludeHandlers: HandlerGroup = {
  Identifier: identifier,
  TSTypeReference: typeReference,
  TSQualifiedName: qualifiedName
}
