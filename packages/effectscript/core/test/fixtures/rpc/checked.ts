import * as Schema from "effect/Schema"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
export const PagesRpc = RpcGroup.make(
  Rpc.make("page", { payload: { id: Schema.String.check(Schema.isUUID()), size: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100)), after: Schema.optionalKey(Schema.String) }, success: Schema.Array(Schema.String) })
)
