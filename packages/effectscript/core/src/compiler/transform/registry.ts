/**
 * @since 0.1.0
 */
import type { Handler } from "../context.ts"
import { awaitHandlers } from "./await.ts"
import { effectHandlers } from "./effect.ts"
import { returnTypeHandlers } from "./returnType.ts"
import { tryHandlers } from "./try.ts"

/**
 * @since 0.1.0
 * @category models
 */
export type HandlerGroup = Readonly<Record<string, Handler>>

/**
 * Merges handler groups. Earlier groups run first for the same node type.
 *
 * @since 0.1.0
 * @category constructors
 */
export const registry = (...groups: ReadonlyArray<HandlerGroup>): ReadonlyMap<string, ReadonlyArray<Handler>> => {
  const map = new Map<string, Array<Handler>>()
  for (const group of groups) {
    for (const [type, handler] of Object.entries(group)) {
      const list = map.get(type) ?? []
      list.push(handler)
      map.set(type, list)
    }
  }
  return map
}

/**
 * @since 0.1.0
 * @category handlers
 */
export const handlers = registry(effectHandlers, tryHandlers, awaitHandlers, returnTypeHandlers)
