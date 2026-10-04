/**
 * Starting points for the playground: the language, then extensions (ADR-0083), then every gallery
 * scenario. A proposed preset shows syntax an ADR has decided but the compiler doesn't accept yet,
 * next to the lowering that ADR specifies; it compiles for real once it is edited.
 */
import { scenarios } from "../samples/scenarios.ts"

const samples = import.meta.glob<string>("../samples/*/app.efx", { query: "?raw", import: "default", eager: true })

export interface Preset {
  readonly id: string
  readonly group: string
  readonly title: string
  readonly code: string
  /** Syntax that isn't built yet: the ADR that decides it, and the TypeScript it specifies. */
  readonly proposal?: { readonly adr: string; readonly status: string; readonly lowering: string }
}

const language: ReadonlyArray<Omit<Preset, "group">> = [
  {
    id: "hello",
    title: "Effect functions",
    code: `error UserNotFound { id: string }

schema User {
  id: string
  name: string
}

service Users {
  effect find(id: string): User throws UserNotFound
}

export effect greet(id: string): string throws UserNotFound needs Users {
  const user = await Users.find(id)
  console.log(\`greeting \${user.name}\`)
  return \`Hello, \${user.name}\`
} |> retry({ times: 3 })
`
  },
  {
    id: "errors",
    title: "Typed errors and try",
    code: `export error NotFound { id: string }
export error Timeout { ms: number }

declare const load: (id: string) => Effect<string, NotFound | Timeout>

export effect withFallback(id: string) {
  try {
    return await load(id)
  } catch (e: NotFound) {
    return "missing"
  } catch (e: Timeout) {
    return \`slow: \${e.ms}ms\`
  }
}
`
  },
  {
    id: "concurrency",
    title: "Concurrency",
    code: `declare const loadUser: (id: string) => Effect<string>
declare const loadPosts: (id: string) => Effect<ReadonlyArray<string>>

export effect profile(id: string) {
  const [user, posts] = await [loadUser(id), loadPosts(id)]
  return { user, posts }
}
`
  },
  {
    id: "brands",
    title: "Brands and checks",
    code: `// A brand is a type the checker tells apart: an Email is not just any string.
// Checks run whenever data is decoded, so a Signup is valid wherever it appears.
export schema Email = string & Brand<"Email">
export schema UserId = string & Brand<"UserId">

export schema Signup {
  id: UserId
  email: Email
  name = Trimmed.check(isMinLength(1), isMaxLength(64))
  age = Int.check(isBetween({ minimum: 13, maximum: 130 }))
}

export error InvalidSignup { reason: string }

// decoding runs every check, then hands back typed data or a typed error
export effect register(input: unknown): Signup throws InvalidSignup {
  const signup = await Schema.decodeUnknownEffect(Signup)(input)
    |> mapError((e) => new InvalidSignup({ reason: e.message }))
  console.log(\`welcome, \${signup.name}\`)
  return signup
}
`
  },
  {
    id: "brands-where",
    title: "Brands with where (next)",
    code: `// \`brand\` takes its key from its name, and \`where\` adds checks to a type or a field.
// Accepted in ADR-0077 and not built yet: the TypeScript is the lowering the ADR specifies.
export brand Email = string where isPattern(/^[^@\\s]+@[^@\\s]+$/)
export brand UserId = string where isUUID()
export brand Cents = Int where isGreaterThanOrEqualTo(0)

export schema Order {
  customer: UserId
  email: Email
  total: Cents
  quantity: Int where isBetween({ minimum: 1, maximum: 99 })
  note?: string where isTrimmed(), isMaxLength(280)
}
`,
    proposal: {
      adr: "ADR-0077",
      status: "accepted, not built yet",
      lowering: `import { Schema } from "effect"
// \`brand\` takes its key from its name, and \`where\` adds checks to a type or a field.
// Accepted in ADR-0077 and not built yet: the TypeScript is the lowering the ADR specifies.
export const Email = Schema.String.check(Schema.isPattern(/^[^@\\s]+@[^@\\s]+$/)).pipe(Schema.brand("Email"))
export type Email = typeof Email.Type
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type
export const Cents = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand("Cents"))
export type Cents = typeof Cents.Type

export class Order extends Schema.Class<Order>("Order")({
  customer: UserId,
  email: Email,
  total: Cents,
  quantity: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
  note: Schema.optionalKey(Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(280)))
}) {}
`
    }
  },
  {
    id: "observability",
    title: "Observability: spans and OTLP",
    code: `// @efx observability otlp
error PaymentDeclined { reason: string }

service Payments {
  effect charge(cartId: string, cents: number): string throws PaymentDeclined
  layer = { charge: effect (cartId: string, cents: number) => \`receipt-\${cartId}-\${cents}\` }
}

// every effect function is a span named after it, and its logs land inside that span
export effect checkout(cartId: string, cents: number): string throws PaymentDeclined needs Payments {
  console.log(\`charging \${cents} for \${cartId}\`)
  const receipt = await Payments.charge(cartId, cents)
  console.log(\`charged: \${receipt}\`)
  return receipt
} |> retry({ times: 2 })

// OTEL_EXPORTER_OTLP_ENDPOINT points the exporter at a collector: nothing else to wire
main {
  await checkout("cart-1", 4200)
} |> provide(Payments.layer)
`
  }
]

const extensions: ReadonlyArray<Omit<Preset, "group">> = [
  {
    id: "law",
    title: "Proofs: a law for Bend2 (proposed)",
    code: `// A \`law\` is a rule the program must keep. It runs as a property test today, and it is
// the statement a Bend2 proof proves (ADR-0074). Proposed in ADR-0075 and not built yet:
// the TypeScript is the lowering the ADR specifies.
export schema Money = Int & Brand<"Money">

export error InsufficientFunds { balance: Money; amount: Money }

export effect withdraw(balance: Money, amount: Money): Money throws InsufficientFunds {
  if (amount > balance) throw new InsufficientFunds({ balance, amount })
  return Money.make(balance - amount)
}

/** Withdrawing never leaves a negative balance. */
law withdrawNeverNegative(balance: Money, amount: Money)
  requires balance >= 0 && amount >= 0
{
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isFailure(exit) || exit.value >= 0
}

/** A withdrawal is refused only when it asks for more than the balance. */
law refusesOnlyOverdrafts(balance: Money, amount: Money) {
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isSuccess(exit) || amount > balance
}
`,
    proposal: {
      adr: "ADR-0075",
      status: "proposed, not built yet",
      lowering: `import { Effect, Exit, Schema } from "effect"
// A \`law\` is a rule the program must keep. It runs as a property test today, and it is
// the statement a Bend2 proof proves (ADR-0074). Proposed in ADR-0075 and not built yet:
// the TypeScript is the lowering the ADR specifies.
export const Money = Schema.Int.pipe(Schema.brand("Money"))
export type Money = typeof Money.Type

export class InsufficientFunds extends Schema.TaggedError<InsufficientFunds>()("InsufficientFunds", { balance: Money, amount: Money }) {}

export const withdraw = Effect.fn("withdraw")(function*(balance: Money, amount: Money): Effect.fn.Return<Money, InsufficientFunds> {
  if (amount > balance) return yield* new InsufficientFunds({ balance, amount })
  return Money.make(balance - amount)
})

/** Withdrawing never leaves a negative balance. */
const withdrawNeverNegative = /*#__PURE__*/ Object.assign(
  Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
    const exit = yield* Effect.exit(withdraw(balance, amount))
    return Exit.isFailure(exit) || exit.value >= 0
  }),
  {
    law: "withdrawNeverNegative",
    inputs: { balance: Money, amount: Money },
    requires: ({ balance, amount }: { readonly balance: Money; readonly amount: Money }) => balance >= 0 && amount >= 0
  }
)
void withdrawNeverNegative

/** A withdrawal is refused only when it asks for more than the balance. */
const refusesOnlyOverdrafts = /*#__PURE__*/ Object.assign(
  Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
    const exit = yield* Effect.exit(withdraw(balance, amount))
    return Exit.isSuccess(exit) || amount > balance
  }),
  { law: "refusesOnlyOverdrafts", inputs: { balance: Money, amount: Money } }
)
void refusesOnlyOverdrafts
`
    }
  },
  {
    id: "foldkit",
    title: "App: Foldkit's model, today",
    code: `// Foldkit's counter (foldkit.dev) in today's EffectScript: the model and the messages are
// schemas, the update is a match, and a command is an effect that ends in a message.
// An \`app\` extension on Foldkit's model is on the roadmap (ADR-0083).
import { Command, Update } from "foldkit"

export schema Model = { count: number; isResetting: boolean; resetDuration: number }

export schema Message =
  | ClickedIncrement {}
  | ChangedResetDuration { seconds: number }
  | ClickedResetAfterDelay {}
  | CompletedDelayReset {}

export const DelayReset = Command.define("DelayReset", {
  args: { seconds: Schema.Number },
  messages: [CompletedDelayReset],
  execute: ({ seconds }) => effect {
    await sleep(\`\${seconds} seconds\`)
    return new CompletedDelayReset()
  }
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  match (message) {
    when ClickedIncrement: ({ model: { ...model, count: model.count + 1 } })
    when ChangedResetDuration({ seconds }): ({ model: { ...model, resetDuration: seconds } })
    when ClickedResetAfterDelay: ({
      model: { ...model, isResetting: true },
      commands: [DelayReset({ seconds: model.resetDuration })]
    })
    when CompletedDelayReset: ({ model: { ...model, count: 0, isResetting: false } })
  }
`
  },
  {
    id: "alchemy",
    title: "Infra: an Alchemy v2 stack, today",
    code: `// An Alchemy v2 stack (alchemy.run) in today's EffectScript: resources and workers are effects.
// An \`infra\` extension that declares them directly is on the roadmap (ADR-0083).
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as HttpServerResponse from "effect/http/HttpServerResponse"

export const Uploads = Cloudflare.R2.Bucket("Uploads")

export const Api = Cloudflare.Worker("Api", { main: import.meta.url }, effect {
  const bucket = await Cloudflare.R2.ReadWriteBucket(Uploads)
  return {
    fetch: effect {
      const object = await bucket.get("hello.txt")
      return object
        ? HttpServerResponse.text(await object.text())
        : HttpServerResponse.text("Not found", { status: 404 })
    }
  }
} |> provide(Cloudflare.R2.ReadWriteBucketBinding))

export default Alchemy.Stack("MyApp", { providers: Cloudflare.providers(), state: Cloudflare.state() }, effect {
  const api = await Api
  return { url: api.url }
})
`
  }
]

export const presets: ReadonlyArray<Preset> = [
  ...language.map((preset) => ({ ...preset, group: "The language" })),
  ...extensions.map((preset) => ({ ...preset, group: "Extensions (roadmap)" })),
  ...scenarios.map(({ id, title }) => ({
    id: `gallery-${id}`,
    group: "Gallery",
    title,
    code: samples[`../samples/${id}/app.efx`]!
  }))
]
