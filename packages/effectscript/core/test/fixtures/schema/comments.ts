import * as Schema from "effect/Schema"
/** A product. */
export class Product extends Schema.Class<Product>("Product")({
  // the sku
  sku: Schema.String,
  /** price in cents */
  price: Schema.Int
}) {}
