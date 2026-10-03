import { Match } from "effect"
declare const res: { status: number; body: string }
type Event = { type: "click"; x: number; y: number } | { type: "key"; key: string }
declare const event: Event

export const message = Match.value(res).pipe(
  Match.when({ status: 404 }, () => "not found"),
  Match.when((_): _ is Match.Types.WhenMatch<typeof _, { readonly status: 500 }> & { readonly "~effectscript/guard": true } => _.status === 500 && (({ body }) => body !== "")(_ as Match.Types.WhenMatch<typeof _, { readonly status: 500 }>), ({ body }) => `server: ${body}`),
  Match.orElse(() => "ok")
)

export const describeEvent = Match.value(event).pipe(
  Match.when({ type: "click" }, ({ x, y }) => `click at ${x},${y}`),
  Match.when({ type: "key" }, ({ key }) => `key ${key}`),
  Match.exhaustive
)
