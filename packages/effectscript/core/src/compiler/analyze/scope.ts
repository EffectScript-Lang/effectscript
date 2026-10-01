/**
 * Lexical scope analysis: which names are bound where, so builtins/prelude/bare types only
 * apply to *free* identifiers.
 *
 * @since 0.1.0
 */
import { children, type Node } from "../ast.ts"

/**
 * @since 0.1.0
 * @category models
 */
export interface Scope {
  readonly parent: Scope | undefined
  readonly kind: "module" | "function" | "block"
  readonly values: Set<string>
  readonly types: Set<string>
}

/**
 * @since 0.1.0
 * @category models
 */
export interface ScopeAnalysis {
  readonly program: Node
  readonly module: Scope
  readonly scopeOf: Map<Node, Scope>
  readonly constInits: Map<string, Node>
  readonly localErrors: Set<string>
  readonly localEffects: Set<string>
  readonly bindings: Set<Node>
}

const makeScope = (parent: Scope | undefined, kind: Scope["kind"]): Scope => ({
  parent,
  kind,
  values: new Set(),
  types: new Set()
})

/**
 * @since 0.1.0
 * @category queries
 */
export const isValueFree = (scope: Scope, name: string): boolean => {
  for (let s: Scope | undefined = scope; s !== undefined; s = s.parent) if (s.values.has(name)) return false
  return true
}

/**
 * @since 0.1.0
 * @category queries
 */
export const isTypeFree = (scope: Scope, name: string): boolean => {
  for (let s: Scope | undefined = scope; s !== undefined; s = s.parent) if (s.types.has(name)) return false
  return true
}

/**
 * Binding names introduced by a destructuring pattern.
 *
 * @since 0.1.0
 * @category queries
 */
export const patternNames = (
  pattern: Node | null | undefined,
  out: Array<string> = [],
  nodes?: Set<Node>
): Array<string> => {
  if (pattern === null || pattern === undefined) return out
  switch (pattern.type) {
    case "Identifier":
      out.push(pattern.name)
      nodes?.add(pattern)
      break
    case "ObjectPattern":
      for (const p of pattern.properties) patternNames(p.type === "RestElement" ? p.argument : p.value, out, nodes)
      break
    case "ArrayPattern":
      for (const element of pattern.elements) patternNames(element, out, nodes)
      break
    case "RestElement":
      patternNames(pattern.argument, out, nodes)
      break
    case "AssignmentPattern":
      patternNames(pattern.left, out, nodes)
      break
    case "TSParameterProperty":
      patternNames(pattern.parameter, out, nodes)
      break
  }
  return out
}

const typeParameterNames = (node: Node): Array<string> => {
  const declaration = node.typeParameters
  if (declaration?.type !== "TSTypeParameterDeclaration") return []
  return declaration.params.map((p: Node) => (typeof p.name === "string" ? p.name : p.name.name) as string)
}

// Type variables introduced by `infer X` inside a conditional type's `extends` clause.
const inferNames = (node: Node, out: Array<string> = []): Array<string> => {
  if (node.type === "TSInferType") {
    const parameter: Node = node.typeParameter
    out.push(typeof parameter.name === "string" ? parameter.name : parameter.name.name)
  }
  for (const child of children(node)) inferNames(child, out)
  return out
}

const nearestFunction = (scope: Scope): Scope => {
  let s = scope
  while (s.kind === "block" && s.parent !== undefined) s = s.parent
  return s
}

const functionTypes = new Set([
  "FunctionDeclaration",
  "TSDeclareFunction",
  "FunctionExpression",
  "ArrowFunctionExpression"
])
const blockTypes = new Set([
  "BlockStatement",
  "StaticBlock",
  "SwitchStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "DoExpression"
])

/**
 * @since 0.1.0
 * @category analysis
 */
export const analyze = (program: Node): ScopeAnalysis => {
  const module = makeScope(undefined, "module")
  const scopeOf = new Map<Node, Scope>([[program, module]])
  const constInits = new Map<string, Node>()
  const localErrors = new Set<string>()
  const localEffects = new Set<string>()
  const bindings = new Set<Node>()

  const visitChildren = (node: Node, scope: Scope): void => {
    for (const child of children(node)) visit(child, scope)
  }

  const visitFunction = (node: Node, scope: Scope): void => {
    if (node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction") {
      if (node.id) {
        scope.values.add(node.id.name)
        bindings.add(node.id)
      }
      if (scope === module && node.efx?.kind === "declaration" && node.id) localEffects.add(node.id.name)
    }
    const fn = makeScope(scope, "function")
    scopeOf.set(node, fn)
    if (node.type === "FunctionExpression" && node.id) {
      fn.values.add(node.id.name)
      bindings.add(node.id)
    }
    for (const name of typeParameterNames(node)) fn.types.add(name)
    for (const param of node.params) for (const name of patternNames(param, [], bindings)) fn.values.add(name)
    for (const child of children(node)) {
      if (child === node.body && child.type === "BlockStatement") {
        scopeOf.set(child, fn)
        visitChildren(child, fn)
      } else {
        visit(child, fn)
      }
    }
  }

  const visit = (node: Node, scope: Scope): void => {
    if (functionTypes.has(node.type)) return visitFunction(node, scope)
    if (blockTypes.has(node.type)) {
      const block = makeScope(scope, "block")
      scopeOf.set(node, block)
      return visitChildren(node, block)
    }
    switch (node.type) {
      case "ImportDeclaration": {
        for (const specifier of node.specifiers) {
          const name: string = specifier.local.name
          bindings.add(specifier.local)
          scope.types.add(name)
          if (node.importKind !== "type" && specifier.importKind !== "type") scope.values.add(name)
        }
        return
      }
      case "VariableDeclaration": {
        const target = node.kind === "var" ? nearestFunction(scope) : scope
        for (const declarator of node.declarations) {
          for (const name of patternNames(declarator.id, [], bindings)) target.values.add(name)
          if (scope === module && node.kind === "const" && declarator.id.type === "Identifier" && declarator.init) {
            constInits.set(declarator.id.name, declarator.init)
          }
        }
        return visitChildren(node, scope)
      }
      case "ClassDeclaration":
      case "ClassExpression": {
        if (node.type === "ClassDeclaration" && node.id) {
          scope.values.add(node.id.name)
          scope.types.add(node.id.name)
        }
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        if (node.id) {
          inner.values.add(node.id.name)
          inner.types.add(node.id.name)
          bindings.add(node.id)
        }
        for (const name of typeParameterNames(node)) inner.types.add(name)
        return visitChildren(node, inner)
      }
      case "CatchClause": {
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        for (const name of patternNames(node.param, [], bindings)) inner.values.add(name)
        return visitChildren(node, inner)
      }
      case "TSTypeAliasDeclaration":
      case "TSInterfaceDeclaration": {
        scope.types.add(node.id.name)
        bindings.add(node.id)
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        for (const name of typeParameterNames(node)) inner.types.add(name)
        return visitChildren(node, inner)
      }
      case "TSEnumDeclaration":
      case "TSImportEqualsDeclaration": {
        bindings.add(node.id)
        scope.values.add(node.id.name)
        scope.types.add(node.id.name)
        return visitChildren(node, scope)
      }
      case "TSConditionalType": {
        visit(node.checkType, scope)
        visit(node.extendsType, scope)
        const inner = makeScope(scope, "block")
        for (const name of inferNames(node.extendsType)) inner.types.add(name)
        scopeOf.set(node.trueType, inner)
        visit(node.trueType, inner)
        visit(node.falseType, scope)
        return
      }
      case "TSMappedType": {
        const inner = makeScope(scope, "block")
        scopeOf.set(node, inner)
        const parameter: Node | undefined = node.typeParameter
        const key: string | undefined = parameter !== undefined
          ? (typeof parameter.name === "string" ? parameter.name : parameter.name?.name)
          : node.key?.name
        if (key !== undefined) inner.types.add(key)
        return visitChildren(node, inner)
      }
      case "TSModuleDeclaration": {
        if (node.id.type === "Identifier") {
          bindings.add(node.id)
          scope.values.add(node.id.name)
          scope.types.add(node.id.name)
        }
        const inner = makeScope(scope, "function")
        scopeOf.set(node, inner)
        return visitChildren(node, inner)
      }
    }
    if (node.typeParameters?.type === "TSTypeParameterDeclaration") {
      const inner = makeScope(scope, "block")
      scopeOf.set(node, inner)
      for (const name of typeParameterNames(node)) inner.types.add(name)
      return visitChildren(node, inner)
    }
    visitChildren(node, scope)
  }

  for (const statement of program.body) visit(statement, module)
  return { program, module, scopeOf, constInits, localErrors, localEffects, bindings }
}
