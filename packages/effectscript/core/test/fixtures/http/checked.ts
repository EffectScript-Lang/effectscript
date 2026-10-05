import * as Schema from "effect/Schema"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
export class SearchApi extends HttpApiGroup.make("search").add(
  HttpApiEndpoint.get("find", "/", { query: { q: Schema.String.check(Schema.isNonEmpty()), page: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4))) }, success: Schema.Array(Schema.String) })
) {}
