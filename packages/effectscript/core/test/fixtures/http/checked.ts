import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
export class SearchApi extends HttpApiGroup.make("search").add(
  HttpApiEndpoint.get("find", "/", { query: { q: Schema.String.check(Schema.isNonEmpty()), page: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4))) }, success: Schema.Array(Schema.String) })
) {}
