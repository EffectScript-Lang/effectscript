# EffectScript

TypeScript with Effect as native syntax. `.efx` files are a superset of `.ts`/`.tsx` and
compile to idiomatic Effect v4 TypeScript.

```ts
export effect getUser(id: UserId): User throws UserNotFound {
  const users = await Users
  return await users.find(id)
} |> retry({ times: 3 })
```

compiles to

```ts
import { Effect } from "effect"
export const getUser = Effect.fn("getUser")(function*(id: UserId): Effect.fn.Return<User, UserNotFound> {
  const users = yield* Users
  return yield* users.find(id)
}, Effect.retry({ times: 3 }))
```

## Compiler API

```ts
import { toTypeScript } from "effectscript/compiler"

const { code, map, mappings, diagnostics, mode } = toTypeScript(source, {
  filename: "src/users.efx",
  packageName: "my-app",
  runtime: "node"
})
```

The compiler has no Node dependencies, so it runs in the browser. See the design spec in
`docs/superpowers/specs/2026-10-02-effectscript-design.md` for the full language.
