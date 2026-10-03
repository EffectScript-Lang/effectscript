import { Effect, Schema } from "effect"
class Banned extends Schema.TaggedError<Banned>()("Banned", { name: Schema.String }) {}

export class User extends Schema.Class<User>("User")({
  name: Schema.String,
  banned: Schema.Boolean

}) {
  greet(greeting: string): Effect.Effect<string, Banned> {
    return Effect.gen({ self: this }, function*() {
      if (this.banned) return yield* new Banned({ name: this.name })
      yield* Effect.sleep("1 millis")
      return `${greeting}, ${this.name}`
    }).pipe(Effect.withSpan("User.greet"))
  }

  shout() { return Effect.gen({ self: this }, function*() { return (yield* this.greet("hey")).toUpperCase() }).pipe(Effect.withSpan("User.shout")) }
}
