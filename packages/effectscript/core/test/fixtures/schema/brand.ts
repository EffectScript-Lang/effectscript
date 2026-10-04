import { Schema } from "effect"
/** A user's id. */
export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

/** A TCP port. */
export const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).pipe(Schema.brand("Port"))
export type Port = typeof Port.Type

/** An administrator's id: a user id, branded again. */
export const AdminId = UserId.pipe(Schema.brand("AdminId"))
export type AdminId = typeof AdminId.Type

const Plan = Schema.Literals(["free", "pro"]).pipe(Schema.brand("Plan"))
type Plan = typeof Plan.Type
