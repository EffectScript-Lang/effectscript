/**
 * @since 0.1.0
 */
import type { Handler } from "../context.ts"
import { ambientHandlers } from "./ambient.ts"
import { atomHandlers } from "./atom.ts"
import { awaitHandlers } from "./await.ts"
import { commandHandlers } from "./command.ts"
import { configHandlers } from "./config.ts"
import { effectHandlers } from "./effect.ts"
import { httpApiHandlers } from "./httpApi.ts"
import { importRewriteHandlers } from "./imports.ts"
import { layerHandlers } from "./layer.ts"
import { libraryHandlers } from "./library.ts"
import { mainHandlers } from "./main.ts"
import { matchHandlers } from "./match.ts"
import { pipelineHandlers } from "./pipeline.ts"
import { preludeHandlers } from "./prelude.ts"
import { proposalHandlers } from "./proposals.ts"
import { resourceHandlers } from "./resources.ts"
import { returnTypeHandlers } from "./returnType.ts"
import { schemaHandlers } from "./schema.ts"
import { serviceHandlers } from "./service.ts"
import { strictHandlers } from "./strict.ts"
import { testHandlers } from "./test.ts"
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
export const handlers = registry(
  strictHandlers,
  importRewriteHandlers,
  schemaHandlers,
  configHandlers,
  layerHandlers,
  atomHandlers,
  httpApiHandlers,
  libraryHandlers,
  commandHandlers,
  serviceHandlers,
  effectHandlers,
  mainHandlers,
  testHandlers,
  tryHandlers,
  resourceHandlers,
  proposalHandlers,
  pipelineHandlers,
  matchHandlers,
  ambientHandlers,
  awaitHandlers,
  returnTypeHandlers,
  preludeHandlers
)
