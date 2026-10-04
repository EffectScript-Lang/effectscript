import { Effect, Schema } from "effect"
import { Activity, Workflow } from "effect/workflow"
export class EmailFailed extends Schema.TaggedError<EmailFailed>()("EmailFailed", { to: Schema.String }) {}

const SendWelcomeWorkflow = Workflow.make("SendWelcome", { payload: { email: Schema.String, name: Schema.optionalKey(Schema.String) }, success: Schema.String, error: EmailFailed, idempotencyKey: ({ email }) => email })
export const SendWelcome = Object.assign(SendWelcomeWorkflow, {
  layer: SendWelcomeWorkflow.toLayer(Effect.fn("SendWelcome")(function*({ email, name }) {
    const body = yield* Activity.make({ name: "render", success: Schema.String, execute: Effect.gen(function*() {
      return `Welcome, ${name ?? email}`
    }) })
    yield* Activity.make({ name: "send", success: Schema.Void, error: EmailFailed, execute: Effect.gen(function*() {
      if (email.endsWith("@invalid")) return yield* new EmailFailed({ to: email })
    }) })
    return body
  }))
})
