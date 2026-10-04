/**
 * Starting points for the playground: the language, then extensions (ADR-0083), then every gallery
 * scenario. Each follows the docs (ADR-0086): the syntax reference, the spec and the ADRs. A
 * proposed preset shows syntax an ADR has decided or sketched but the compiler doesn't accept yet,
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
    title: "Brands and where checks (next)",
    code: `// \`brand\` takes its key from its name; \`where\` adds checks to a type or a field.
// Accepted in ADR-0077, not built yet: the TypeScript is the lowering it specifies.
// Checks run on decode and in \`make\`, reach JSON Schema, shape generated tests.
export brand Email = string where isPattern(/^[^@\\s]+@[^@\\s]+$/)
export brand UserId = string where isUUID()

export schema Signup {
  id: UserId
  email: Email
  name: string where isTrimmed(), isNonEmpty(), isMaxLength(64)
  nickname?: string where isMaxLength(20)
}

export error InvalidSignup { reason: string }

// decoding runs every check, then hands back typed data or a typed error
export effect register(input: unknown): Signup throws InvalidSignup {
  const signup = await Schema.decodeUnknownEffect(Signup)(input)
    |> mapError((e) => new InvalidSignup({ reason: e.message }))
  console.log(\`welcome, \${signup.name}\`)
  return signup
}
`,
    proposal: {
      adr: "ADR-0077",
      status: "accepted, not built yet",
      lowering: `import { Effect, Schema, pipe } from "effect"
// \`brand\` takes its key from its name; \`where\` adds checks to a type or a field.
// Accepted in ADR-0077, not built yet: the TypeScript is the lowering it specifies.
// Checks run on decode and in \`make\`, reach JSON Schema, shape generated tests.
export const Email = Schema.String.check(Schema.isPattern(/^[^@\\s]+@[^@\\s]+$/)).pipe(Schema.brand("Email"))
export type Email = typeof Email.Type
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export class Signup extends Schema.Class<Signup>("Signup")({
  id: UserId,
  email: Email,
  name: Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty(), Schema.isMaxLength(64)),
  nickname: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(20)))
}) {}

export class InvalidSignup extends Schema.TaggedError<InvalidSignup>()("InvalidSignup", { reason: Schema.String }) {}

// decoding runs every check, then hands back typed data or a typed error
export const register = Effect.fn("register")(function*(input: unknown): Effect.fn.Return<Signup, InvalidSignup> {
  const signup = yield* pipe(Schema.decodeUnknownEffect(Signup)(input),
    Effect.mapError((e) => new InvalidSignup({ reason: e.message })))
  yield* Effect.log(\`welcome, \${signup.name}\`)
  return signup
})
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

// every effect function is a span named after it ("checkout", "Payments.charge"),
// and its logs land inside that span
export effect checkout(cartId: string, cents: number): string throws PaymentDeclined needs Payments {
  console.log(\`charging \${cents} for \${cartId}\`)
  const receipt = await Payments.charge(cartId, cents)
  console.log(\`charged: \${receipt}\`)
  return receipt
} |> retry({ times: 2 })

// the exporter reads the standard OTEL_* variables, and does nothing without an endpoint
main {
  await checkout("cart-1", 4200)
} |> provide(Payments.layer)
`
  }
]

const extensions: ReadonlyArray<Omit<Preset, "group">> = [
  {
    id: "law",
    title: "Proofs: laws for Bend2 (proposed)",
    code: `// A \`law\` is a rule the program must keep. It runs as a property test today,
// and it is what a Bend2 proof proves (ADR-0074). Proposed in ADR-0075, not built:
// the TypeScript is the lowering it specifies. Tests run them: \`laws "./bank.efx"\`.

/** An amount of money in whole cents. */
export schema Money = Int & Brand<"Money">

/** An account has less money than a withdrawal needs. */
export error InsufficientFunds { needed: Money; available: Money }

/** Takes money out of a balance. */
export effect withdraw(balance: Money, amount: Money): Money throws InsufficientFunds {
  if (amount > balance) throw new InsufficientFunds({ needed: amount, available: balance })
  return Money.make(balance - amount)
}

/** Withdrawing never leaves a negative balance. */
law withdrawNeverNegative(balance: Money, amount: Money) {
  const exit = await Effect.exit(withdraw(balance, amount))
  return Exit.isFailure(exit) || exit.value >= 0
}

/** A withdrawal fails exactly when it asks for more than the balance. */
law withdrawFailsExactlyWhenShort(balance: Money, amount: Money) {
  return Exit.isFailure(await Effect.exit(withdraw(balance, amount))) === amount > balance
}
`,
    proposal: {
      adr: "ADR-0075",
      status: "proposed, not built yet",
      lowering: `import { Effect, Exit, Schema } from "effect"
// A \`law\` is a rule the program must keep. It runs as a property test today,
// and it is what a Bend2 proof proves (ADR-0074). Proposed in ADR-0075, not built:
// the TypeScript is the lowering it specifies. Tests run them: \`laws "./bank.efx"\`.

/** An amount of money in whole cents. */
export const Money = Schema.Int.pipe(Schema.brand("Money"))
export type Money = typeof Money.Type

/** An account has less money than a withdrawal needs. */
export class InsufficientFunds extends Schema.TaggedError<InsufficientFunds>()("InsufficientFunds", { needed: Money, available: Money }) {}

/** Takes money out of a balance. */
export const withdraw = Effect.fn("withdraw")(function*(balance: Money, amount: Money): Effect.fn.Return<Money, InsufficientFunds> {
  if (amount > balance) return yield* new InsufficientFunds({ needed: amount, available: balance })
  return Money.make(balance - amount)
})

/** Withdrawing never leaves a negative balance. */
const withdrawNeverNegative = /*#__PURE__*/ Object.assign(
  Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
    const exit = yield* Effect.exit(withdraw(balance, amount))
    return Exit.isFailure(exit) || exit.value >= 0
  }),
  { law: "withdrawNeverNegative", inputs: { balance: Money, amount: Money } }
)
void withdrawNeverNegative

/** A withdrawal fails exactly when it asks for more than the balance. */
const withdrawFailsExactlyWhenShort = /*#__PURE__*/ Object.assign(
  Effect.fnUntraced(function*({ balance, amount }: { readonly balance: Money; readonly amount: Money }) {
    return Exit.isFailure(yield* Effect.exit(withdraw(balance, amount))) === amount > balance
  }),
  { law: "withdrawFailsExactlyWhenShort", inputs: { balance: Money, amount: Money } }
)
void withdrawFailsExactlyWhenShort
`
    }
  },
  {
    id: "elm",
    title: "Apps: The Elm Architecture, today",
    code: `// The Elm Architecture, as Foldkit applies it to Effect, in today's EffectScript.
// Messages are a union, the update is a match, a command is an effect that ends in
// a message, the state is an atom, the view is JSX. An \`app\` extension is planned.
import { useAtomSet, useAtomValue } from "@effect/atom-react"

export schema Message =
  | Increment {}
  | Decrement {}
  | ResetLater { seconds: number }
  | Reset {}

export atom count = 0

// the update is pure: the next state for each message
export const update = (count: number, message: Message): number =>
  match (message) {
    when Increment: count + 1
    when Decrement: count - 1
    when ResetLater: count
    when Reset: 0
  }

// a message's command: an effect whose result is the next message
const command = (message: Message): Effect<Message> | undefined =>
  match (message) {
    when ResetLater({ seconds }): sleep(\`\${seconds} seconds\`) |> as(new Reset())
    default: undefined
  }

// applies a message, then runs its command and the message that comes back
effect run(message: Message, get: Atom.FnContext): void {
  get.set(count, update(get(count), message))
  const next = command(message)
  if (next !== undefined) await run(await next, get)
}

export const dispatch = Atom.fn(run)

export const Counter = () => {
  const value = useAtomValue(count)
  const send = useAtomSet(dispatch)
  return (
    <p>
      <button onClick={() => send(new Decrement())}>−</button>
      <output>{value}</output>
      <button onClick={() => send(new Increment())}>+</button>
      <button onClick={() => send(new ResetLater({ seconds: 2 }))}>Reset in 2s</button>
    </p>
  )
}
`
  },
  {
    id: "infra",
    title: "Infra: a Cloudflare Worker (proposed)",
    code: `// @efx infra
// The infra extension on Alchemy v2, sketched in ADR-0086 (proposed, not built):
// the TypeScript is the lowering it specifies, in the shape of Alchemy's guide.
// \`Cloudflare\` comes with the extension. Deploy with \`stack App { Site }\`.

// a Cloudflare resource, named after its declaration
export resource Uploads = Cloudflare.R2.Bucket()

export error FileNotFound status 404 { key: string }

export group FilesApi {
  get read "/:key" (params: { key: string }): string throws FileNotFound
  put write "/:key" (params: { key: string }, payload: string)
}

export api Api { FilesApi }

export const FilesLive = impl Api.files {
  // awaiting a resource binds it to the worker this runs in
  const bucket = await Uploads
  return {
    effect read({ params }) {
      // a storage failure is a defect (500), a missing file is FileNotFound (404)
      const file = await bucket.get(params.key) |> orDie
      if (file === null) throw new FileNotFound({ key: params.key })
      return await file.text() |> orDie
    },
    effect write({ params, payload }) {
      await bucket.put(params.key, payload) |> orDie
    }
  }
}

// a Worker that serves the API: its responses are the API's schemas and statuses
export default worker Site serves Api with FilesLive
`,
    proposal: {
      adr: "ADR-0086",
      status: "a proposed sketch, not built",
      lowering: `import * as Cloudflare from "alchemy/Cloudflare"
import { Effect, Layer, Path, Schema, pipe } from "effect"
import { Etag, HttpPlatform, HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
// @efx infra
// The infra extension on Alchemy v2, sketched in ADR-0086 (proposed, not built):
// the TypeScript is the lowering it specifies, in the shape of Alchemy's guide.
// \`Cloudflare\` comes with the extension. Deploy with \`stack App { Site }\`.

// a Cloudflare resource, named after its declaration
export const Uploads = Cloudflare.R2.Bucket("Uploads")

export class FileNotFound extends Schema.TaggedError<FileNotFound>()("FileNotFound", { key: Schema.String }, { httpApiStatus: 404 }) {}

export class FilesApi extends HttpApiGroup.make("files").add(
  HttpApiEndpoint.get("read", "/:key", { params: { key: Schema.String }, success: Schema.String, error: FileNotFound }),
  HttpApiEndpoint.put("write", "/:key", { params: { key: Schema.String }, payload: Schema.String })
) {}

export class Api extends HttpApi.make("api").add(FilesApi) {}

export const FilesLive = HttpApiBuilder.group(Api, "files", Effect.fn("Api.files")(function*(handlers) {
  // awaiting a resource binds it to the worker this runs in
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(Uploads)
  return handlers.handleAll({
    read: Effect.fn("Api.files.read")(function*({ params }) {
      // a storage failure is a defect (500), a missing file is FileNotFound (404)
      const file = yield* pipe(bucket.get(params.key), Effect.orDie)
      if (file === null) return yield* new FileNotFound({ key: params.key })
      return yield* pipe(file.text(), Effect.orDie)
    }),
    write: Effect.fn("Api.files.write")(function*({ params, payload }) {
      yield* pipe(bucket.put(params.key, payload), Effect.orDie)
    })
  })
})).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding))

// a Worker that serves the API: its responses are the API's schemas and statuses
const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () => Effect.die("HttpPlatform.fileWebResponse not supported")
})
const Site = Cloudflare.Worker(
  "Site",
  { main: import.meta.url },
  Effect.gen(function*() {
    return {
      fetch: yield* HttpRouter.toHttpEffect(
        HttpApiBuilder.layer(Api).pipe(
          Layer.provide(FilesLive),
          Layer.provide([Etag.layer, HttpPlatformStub, Path.layer])
        )
      )
    }
  })
)
export default Site
`
    }
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
