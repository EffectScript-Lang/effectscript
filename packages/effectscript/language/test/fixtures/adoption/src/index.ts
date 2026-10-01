import { Effect } from "effect"
import { describeUser, findUser, User, UserNotFound } from "./users.efx"

export { describeUser, findUser, User, UserNotFound }

export const runDemo = (): string =>
  [Effect.runSync(describeUser("1")), Effect.runSync(describeUser("2"))].join(", ")
