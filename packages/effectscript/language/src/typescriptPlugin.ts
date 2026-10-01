/**
 * The TypeScript server plugin: VS Code's built-in TS server (and any tsserver host) loads it to
 * serve `.efx` files and `.ts` files that import them (ADR-0019).
 *
 * @since 4.0.0
 */
import { createLanguageServicePlugin } from "@volar/typescript/lib/quickstart/createLanguageServicePlugin.js"
import { createLanguagePlugin } from "./languagePlugin.ts"

/**
 * The tsserver plugin factory.
 *
 * @since 4.0.0
 * @category plugins
 */
export const typescriptPlugin = createLanguageServicePlugin((ts) => ({
  languagePlugins: [createLanguagePlugin(ts)]
}))

export default typescriptPlugin
