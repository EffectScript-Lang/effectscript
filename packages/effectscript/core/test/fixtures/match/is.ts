import { Cause, Effect, Schema } from "effect"
class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", { retryAfter: Schema.Number }) {}

declare const fetchUser: (id: string) => Effect.Effect<string, RateLimited>
declare const failure: RateLimited | Cause.TimeoutError | Cause.NoSuchElementError
declare const failures: Array<RateLimited | Cause.TimeoutError>

export const user = (id: string) =>
  fetchUser(id).pipe(Effect.timeout("2 seconds"), Effect.retry({ times: 2, while: (e) => e._tag === "TimeoutError" || e._tag === "RateLimited" }))

export const transient = failure._tag === "TimeoutError" || failure._tag === "RateLimited"
export const permanent = failure._tag !== "TimeoutError" && failure._tag !== "RateLimited"
export const limited: Array<RateLimited> = failures.filter((e) => e._tag === "RateLimited")
export const waitFor = failure._tag === "RateLimited" ? failure.retryAfter : 0
