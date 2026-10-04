import { Schema } from "effect"
import { Tool } from "effect/ai"
/** Searches the catalog. */
export const Search = Tool.make("Search", { description: "Searches the catalog.", parameters: Schema.Struct({ query: Schema.String.check(Schema.isNonEmpty()), limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))) }), success: Schema.Array(Schema.String) })
