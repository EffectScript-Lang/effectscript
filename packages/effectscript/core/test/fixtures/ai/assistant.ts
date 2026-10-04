import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
export class Forecast extends Schema.Class<Forecast>("Forecast")({
  city: Schema.String,
  high: Schema.Number
}) {}

export class UnknownCity extends Schema.TaggedError<UnknownCity>()("UnknownCity", { city: Schema.String }) {}

/** Looks up the forecast for a city. */
export const GetForecast = Tool.make("GetForecast", { description: "Looks up the forecast for a city.", parameters: Schema.Struct({ city: Schema.String, days: Schema.optionalKey(Schema.Number) }), success: Forecast, failure: UnknownCity })

/**
 * The current time, as an ISO string.
 */
export const GetTime = Tool.make("GetTime", { description: "The current time, as an ISO string.", success: Schema.String })

const Ping = Tool.make("Ping")

export const Assistant = Toolkit.make(GetForecast, GetTime, Ping)

export const AssistantLive = Assistant.toLayer(Effect.gen(function*() {
  return Assistant.of({
    GetForecast: Effect.fnUntraced(function*({ city }) { return city === "Tokyo" ? new Forecast({ city, high: 21 }) : (yield* new UnknownCity({ city })) }),
    GetTime: Effect.fnUntraced(function*() { return "2026-10-04T00:00:00Z" }),
    Ping: Effect.fnUntraced(function*() {})
  })
}))
