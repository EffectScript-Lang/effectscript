/** Starting points for the playground: a few small ones, then every gallery scenario. */
import { scenarios } from "../samples/scenarios.ts"

const samples = import.meta.glob<string>("../samples/*/app.efx", { query: "?raw", import: "default", eager: true })
export interface Preset {
  readonly id: string
  readonly title: string
  readonly code: string
}

const base: ReadonlyArray<Preset> = [
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
  }
]

export const presets: ReadonlyArray<Preset> = [
  ...base,
  ...scenarios.map(({ id, title }) => ({
    id: `gallery-${id}`,
    title: `Gallery: ${title}`,
    code: samples[`../samples/${id}/app.efx`]!
  }))
]
