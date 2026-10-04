import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
export const PagesRpc = RpcGroup.make(
  Rpc.make("page", { payload: { id: Schema.String.check(Schema.isUUID()), size: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)), after: Schema.optionalKey(Schema.String) }, success: Schema.Array(Schema.String) })
)
