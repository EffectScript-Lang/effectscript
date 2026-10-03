/**
 * @file EffectScript for tree-sitter: TypeScript's grammar, plus Effect as syntax (ADR-0058).
 * @license MIT
 */
import TypeScript from "tree-sitter-typescript/typescript/grammar.js"

export default grammar(TypeScript, {
  name: "effectscript",

  rules: {}
})
