import { Effect as Fx, Schema as Schema$ } from "effect"

const Schema = { note: "user value named Schema" }

export class Point extends Schema$.Class<Point>("Point")({ x: Schema$.Number, y: Schema$.Number }) {}

export const area = Fx.fn("area")(function*(Effect: number) {
  const inner = Fx.gen(function*() { return Effect * 2 })
  return yield* inner
})

export const run = Fx.runSync(area(2))
export const note = Schema.note
