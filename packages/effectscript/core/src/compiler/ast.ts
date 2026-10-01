/**
 * @since 0.1.0
 */

/**
 * A loosely typed ESTree/TS-ESTree node as produced by acorn + acorn-typescript + efxPlugin.
 *
 * @since 0.1.0
 * @category models
 */
export interface Node {
  type: string
  start: number
  end: number
  [key: string]: any
}

/**
 * @since 0.1.0
 * @category guards
 */
export const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string" &&
  typeof (value as Node).start === "number"

const skipKeys = new Set(["type", "start", "end", "loc", "range", "raw", "efx"])

/**
 * Child nodes in source order.
 *
 * @since 0.1.0
 * @category utils
 */
export const children = (node: Node): Array<Node> => {
  const result: Array<Node> = []
  for (const key in node) {
    if (skipKeys.has(key)) continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) result.push(item)
    } else if (isNode(value)) {
      result.push(value)
    }
  }
  return result.sort((a, b) => a.start - b.start)
}

const functionBoundaries = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "ClassDeclaration",
  "ClassExpression"
])

/**
 * Whether `this` appears in `node`, looking through arrow functions but not through
 * `function`s or classes (which rebind `this`).
 *
 * @since 0.1.0
 * @category utils
 */
export const containsThis = (node: Node): boolean => {
  if (node.type === "ThisExpression") return true
  if (functionBoundaries.has(node.type)) return false
  return children(node).some(containsThis)
}
