# effect/TxHashMap

The examples in the JSDoc of `packages/effect/src/TxHashMap.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## TxHashMap

**Using transactional hash maps**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a transactional hash map
  const txMap = await TxHashMap.make(["user1", "Alice"], ["user2", "Bob"])

  // Single operations are automatically transactional
  await TxHashMap.set(txMap, "user3", "Charlie")
  await TxHashMap.get(txMap, "user1") // => Option.some("Alice")

  // Multi-step atomic operations
  await tx(
    effect {
      const currentUser = await TxHashMap.get(txMap, "user1")
      if (currentUser._tag === "Some") {
        await TxHashMap.set(txMap, "user1", currentUser.value + "_updated")
        await TxHashMap.remove(txMap, "user2")
      }
    }
  )

  return await TxHashMap.size(txMap)
}

await runPromise(program) // => 2
```

**Reusing extracted TxHashMap types**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a transactional inventory map
  const inventory = await TxHashMap.make(
    ["laptop", { stock: 5, price: 999 }],
    ["mouse", { stock: 20, price: 29 }]
  )

  // Extract types for reuse
  type ProductId = TxHashMap.TxHashMap.Key<typeof inventory> // string
  type Product = TxHashMap.TxHashMap.Value<typeof inventory> // { stock: number, price: number }
  type InventoryEntry = TxHashMap.TxHashMap.Entry<typeof inventory> // [string, Product]

  // Use extracted types in functions
  const updateStock = (id: ProductId, newStock: number) =>
    TxHashMap.modify(
      inventory,
      id,
      (product) => ({ ...product, stock: newStock })
    )

  await updateStock("laptop", 3)
  return await TxHashMap.get(inventory, "laptop")
}

await runPromise(program) // => Option.some({ stock: 3, price: 999 })
```

## TxHashMap.Key

**Extracting key types**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a user map to extract key type from
  const userMap = await TxHashMap.make(
    ["alice", { name: "Alice", age: 30 }],
    ["bob", { name: "Bob", age: 25 }]
  )

  // Extract the key type (string)
  type UserKey = TxHashMap.TxHashMap.Key<typeof userMap>

  // Use the extracted type in functions
  const getUserById = (id: UserKey) => TxHashMap.get(userMap, id)
  return await getUserById("alice")
}

await runPromise(program) // => Option.some({ name: "Alice", age: 30 })
```

## TxHashMap.Value

**Extracting value types**

```efx
const program = effect {
  // Create a product catalog TxHashMap
  const catalog = await TxHashMap.make(
    ["laptop", { price: 999, category: "electronics" }],
    ["book", { price: 29, category: "education" }]
  )

  // Extract the value type (Product)
  type Product = TxHashMap.TxHashMap.Value<typeof catalog>

  // Use the extracted type for type-safe operations
  const processProduct = (product: Product) => {
    return `${product.category}: $${product.price}`
  }

  return Option.map(await TxHashMap.get(catalog, "laptop"), processProduct)
}

await runPromise(program) // => Option.some("electronics: $999")
```

## TxHashMap.Entry

**Extracting entry types**

```efx
const program = effect {
  // Create a configuration TxHashMap
  const config = await TxHashMap.make(
    ["api_url", "https://api.example.com"],
    ["timeout", "5000"],
    ["retries", "3"]
  )

  // Extract the entry type [string, string]
  type ConfigEntry = TxHashMap.TxHashMap.Entry<typeof config>

  // Use the extracted type for processing entries
  const processEntry = ([key, value]: ConfigEntry) => {
    return `${key}=${value}`
  }

  // Get all entries and process them
  return (await TxHashMap.entries(config)).map(processEntry).sort()
}

await runPromise(program) // => ["api_url=https://api.example.com", "retries=3", "timeout=5000"]
```

## empty

**Creating an empty map**

```efx
const program = effect {
  // Create an empty transactional hash map
  const emptyMap = await TxHashMap.empty<string, number>()

  // Verify it's empty
  await TxHashMap.isEmpty(emptyMap) // => true
  await TxHashMap.size(emptyMap) // => 0

  // Start adding elements
  await TxHashMap.set(emptyMap, "first", 1)
  return await TxHashMap.size(emptyMap)
}

await runPromise(program) // => 1
```

## make

**Creating a map from entries**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a user directory
  const userMap = await TxHashMap.make(
    ["alice", { name: "Alice Smith", role: "admin" }],
    ["bob", { name: "Bob Johnson", role: "user" }],
    ["charlie", { name: "Charlie Brown", role: "user" }]
  )

  // Check the initial size
  await TxHashMap.size(userMap) // => 3

  // Access users
  await TxHashMap.get(userMap, "alice") // => Option.some({ name: "Alice Smith", role: "admin" })
  return await TxHashMap.get(userMap, "david")
}

await runPromise(program) // => Option.none()
```

## fromIterable

**Creating a map from an iterable**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create from various iterable sources
  const configEntries = [
    ["database.host", "localhost"],
    ["database.port", "5432"],
    ["cache.enabled", "true"],
    ["logging.level", "info"]
  ] as const

  const configMap = await TxHashMap.fromIterable(configEntries)

  // Verify the configuration was loaded
  await TxHashMap.size(configMap) // => 4
  await TxHashMap.get(configMap, "database.host") // => Option.some("localhost")

  // Can also create from Map, Set of tuples, etc.
  const jsMap = new Map([["key1", "value1"], ["key2", "value2"]])
  return await TxHashMap.fromIterable(jsMap)
}

await runPromise(program)
```

## get

**Looking up values safely**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const userMap = await TxHashMap.make(
    ["alice", { name: "Alice", role: "admin" }],
    ["bob", { name: "Bob", role: "user" }]
  )

  // Safe lookup - returns Option
  await TxHashMap.get(userMap, "alice") // => Option.some({ name: "Alice", role: "admin" })
  await TxHashMap.get(userMap, "charlie") // => Option.none()

  // Use with pipe syntax for type-safe access
  return await TxHashMap.get(userMap, "bob")
}

await runPromise(program) // => Option.some({ name: "Bob", role: "user" })
```

## set

**Setting values**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const inventory = await TxHashMap.make(
    ["laptop", 5],
    ["mouse", 20]
  )

  // Update existing item
  await TxHashMap.set(inventory, "laptop", 3)
  await TxHashMap.get(inventory, "laptop") // => Option.some(3)

  // Add new item
  await TxHashMap.set(inventory, "keyboard", 15)
  await TxHashMap.get(inventory, "keyboard") // => Option.some(15)

  // Use with pipe syntax
  await TxHashMap.set("tablet", 8)(inventory)
  return await TxHashMap.get(inventory, "tablet")
}

await runPromise(program) // => Option.some(8)
```

## has

**Checking for keys**

```efx
const program = effect {
  const permissions = await TxHashMap.make(
    ["alice", ["read", "write"]],
    ["bob", ["read"]],
    ["charlie", ["admin"]]
  )

  // Check if users exist
  await TxHashMap.has(permissions, "alice") // => true
  await TxHashMap.has(permissions, "david") // => false

  // Use direct method call for type-safe access
  return await TxHashMap.has(permissions, "bob")
}

await runPromise(program) // => true
```

## remove

**Removing keys**

```efx
const program = effect {
  const cache = await TxHashMap.make(
    ["user:1", { name: "Alice", lastSeen: "2024-01-01" }],
    ["user:2", { name: "Bob", lastSeen: "2024-01-02" }],
    ["user:3", { name: "Charlie", lastSeen: "2023-12-30" }]
  )

  // Remove expired user
  await TxHashMap.remove(cache, "user:3") // => true

  // Try to remove non-existent key
  await TxHashMap.remove(cache, "user:999") // => false

  // Verify removal
  await TxHashMap.has(cache, "user:3") // => false
  return await TxHashMap.size(cache)
}

await runPromise(program) // => 2
```

## clear

**Clearing all entries**

```efx
const program = effect {
  const sessionMap = await TxHashMap.make(
    ["session1", { userId: "alice", expires: "2024-01-01T12:00:00Z" }],
    ["session2", { userId: "bob", expires: "2024-01-01T13:00:00Z" }],
    ["session3", { userId: "charlie", expires: "2024-01-01T14:00:00Z" }]
  )

  // Check initial state
  await TxHashMap.size(sessionMap) // => 3

  // Clear all sessions (e.g., during maintenance)
  await TxHashMap.clear(sessionMap)

  // Verify cleared
  await TxHashMap.size(sessionMap) // => 0
  return await TxHashMap.isEmpty(sessionMap)
}

await runPromise(program) // => true
```

## size

**Counting entries**

```efx
const program = effect {
  const metrics = await TxHashMap.make(
    ["requests", 1000],
    ["errors", 5],
    ["users", 50]
  )

  await TxHashMap.size(metrics) // => 3

  // Add more metrics
  await TxHashMap.set(metrics, "response_time", 250)
  await TxHashMap.size(metrics) // => 4

  // Remove a metric
  await TxHashMap.remove(metrics, "errors")
  return await TxHashMap.size(metrics)
}

await runPromise(program) // => 3
```

## isEmpty

**Checking for an empty map**

```efx
const program = effect {
  // Start with empty map
  const cache = await TxHashMap.empty<string, any>()
  await TxHashMap.isEmpty(cache) // => true

  // Add an item
  await TxHashMap.set(cache, "key1", "value1")
  await TxHashMap.isEmpty(cache) // => false

  // Clear and check again
  await TxHashMap.clear(cache)
  return await TxHashMap.isEmpty(cache)
}

await runPromise(program) // => true
```

## isNonEmpty

**Checking for a non-empty map**

```efx
const program = effect {
  const inventory = await TxHashMap.make(["laptop", 5])

  await TxHashMap.isNonEmpty(inventory) // => true

  // Clear inventory
  await TxHashMap.clear(inventory)
  return await TxHashMap.isNonEmpty(inventory)
}

await runPromise(program) // => false
```

## modify

**Updating existing values**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const counters = await TxHashMap.make(
    ["downloads", 100],
    ["views", 250]
  )

  // Increment existing counter
  const oldDownloads = await TxHashMap.modify(
    counters,
    "downloads",
    (count) => count + 1
  )
  oldDownloads // => Option.some(100)

  await TxHashMap.get(counters, "downloads") // => Option.some(101)

  // Try to modify non-existent key
  const nonExistent = await TxHashMap.modify(
    counters,
    "clicks",
    (count) => count + 1
  )
  nonExistent // => Option.none()

  // Update views counter with direct method call
  await TxHashMap.modify(counters, "views", (views) => views * 2)
  return await TxHashMap.get(counters, "views")
}

await runPromise(program) // => Option.some(500)
```

## modifyAt

**Updating values with Option**

```efx
const program = effect {
  const storage = await TxHashMap.make<string, string | number>([
    "file1.txt",
    "content1"
  ], ["access_count", 0])
  const increment = Option.map((value: string | number) => typeof value === "number" ? value + 1 : value)

  // Increment existing counter
  await TxHashMap.modifyAt(storage, "access_count", increment)
  await TxHashMap.get(storage, "access_count") // => Option.some(1)

  // Increment existing counter again
  await TxHashMap.modifyAt(storage, "access_count", increment)
  await TxHashMap.get(storage, "access_count") // => Option.some(2)

  // Update an existing string entry
  await TxHashMap.modifyAt(
    storage,
    "file1.txt",
    Option.map((value) => typeof value === "string" ? `${value}.bak` : value)
  )
  return await TxHashMap.get(storage, "file1.txt")
}

await runPromise(program) // => Option.some("content1.bak")
```

## keys

**Reading keys**

```efx
import { Effect, Option } from "effect"

const program = effect {
  const userRoles = await TxHashMap.make(
    ["alice", "admin"],
    ["bob", "user"],
    ["charlie", "moderator"]
  )

  const usernames = (await TxHashMap.keys(userRoles)).sort()
  usernames // => ["alice", "bob", "charlie"]

  // Useful for iteration
  const assignments: Array<string> = []
  for (const username of usernames) {
    const role = await TxHashMap.get(userRoles, username)
    if (role._tag === "Some") {
      assignments.push(`${username}: ${role.value}`)
    }
  }
  return assignments
}

await runPromise(program) // => ["alice: admin", "bob: user", "charlie: moderator"]
```

## values

**Reading values**

```efx
const program = effect {
  const scores = await TxHashMap.make(
    ["alice", 95],
    ["bob", 87],
    ["charlie", 92]
  )

  const allScores = (await TxHashMap.values(scores)).sort((a, b) => a - b)
  allScores // => [87, 92, 95]

  // Calculate average
  const average = allScores.reduce((sum, score) => sum + score, 0) /
    allScores.length
  average.toFixed(2) // => "91.33"

  // Find maximum
  return Math.max(...allScores)
}

await runPromise(program) // => 95
```

## entries

**Reading entries**

```efx
const program = effect {
  const config = await TxHashMap.make(
    ["host", "localhost"],
    ["port", "3000"],
    ["ssl", "false"]
  )

  return (await TxHashMap.entries(config)).toSorted(([left], [right]) => left.localeCompare(right))
}

await runPromise(program) // => [["host", "localhost"], ["port", "3000"], ["ssl", "false"]]
```

## snapshot

**Taking immutable snapshots**

```efx
import { Effect, HashMap, Option } from "effect"

const program = effect {
  const liveData = await TxHashMap.make(
    ["temperature", 22.5],
    ["humidity", 45.2],
    ["pressure", 1013.25]
  )

  // Take snapshot for reporting
  const snapshot = await TxHashMap.snapshot(liveData)

  // Continue modifying live data
  await TxHashMap.set(liveData, "temperature", 23.1)
  await TxHashMap.set(liveData, "wind_speed", 5.3)

  // Snapshot remains unchanged
  HashMap.size(snapshot) // => 3
  HashMap.get(snapshot, "temperature") // => Option.some(22.5)

  // Can use regular HashMap operations on snapshot
  return HashMap.get(snapshot, "humidity")
}

await runPromise(program) // => Option.some(45.2)
```

## union

**Merging HashMaps**

```efx
import { Effect, HashMap, Option } from "effect"

const program = effect {
  // Create initial user preferences
  const userPrefs = await TxHashMap.make(
    ["theme", "light"],
    ["language", "en"],
    ["notifications", "enabled"]
  )

  // New preferences to merge in
  const newSettings = HashMap.make(
    ["theme", "dark"], // will override existing
    ["timezone", "UTC"], // new setting
    ["sound", "enabled"] // new setting
  )

  // Merge the new settings
  await TxHashMap.union(userPrefs, newSettings)

  // Check the merged result
  await TxHashMap.get(userPrefs, "theme") // => Option.some("dark")
  await TxHashMap.get(userPrefs, "language") // => Option.some("en")
  await TxHashMap.get(userPrefs, "timezone") // => Option.some("UTC")
  return await TxHashMap.size(userPrefs)
}

await runPromise(program) // => 5
```

## removeMany

**Removing multiple keys**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a cache with temporary data
  const cache = await TxHashMap.make(
    ["session_1", { user: "alice", expires: "2024-01-01" }],
    ["session_2", { user: "bob", expires: "2024-01-01" }],
    ["session_3", { user: "charlie", expires: "2024-12-31" }],
    ["temp_data_1", { value: "temporary" }],
    ["temp_data_2", { value: "also_temporary" }]
  )

  await TxHashMap.size(cache) // => 5

  // Remove expired sessions and temporary data
  const keysToRemove = ["session_1", "session_2", "temp_data_1", "temp_data_2"]
  await TxHashMap.removeMany(cache, keysToRemove)

  await TxHashMap.size(cache) // => 1

  // Verify only the valid session remains
  await TxHashMap.get(cache, "session_3") // => Option.some({ user: "charlie", expires: "2024-12-31" })

  // Can also remove from Set, Array, or any iterable
  const moreKeysToRemove = new Set(["session_3"])
  await TxHashMap.removeMany(cache, moreKeysToRemove)
  return await TxHashMap.isEmpty(cache)
}

await runPromise(program) // => true
```

## setMany

**Setting multiple entries**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create an empty product catalog
  const catalog = await TxHashMap.empty<
    string,
    { price: number; stock: number }
  >()

  // Bulk load initial products
  const initialProducts: Array<
    readonly [string, { price: number; stock: number }]
  > = [
    ["laptop", { price: 999, stock: 5 }],
    ["mouse", { price: 29, stock: 50 }],
    ["keyboard", { price: 79, stock: 20 }],
    ["monitor", { price: 299, stock: 8 }]
  ]

  await TxHashMap.setMany(catalog, initialProducts)

  await TxHashMap.size(catalog) // => 4

  // Update prices with a new batch
  const priceUpdates: Array<
    readonly [string, { price: number; stock: number }]
  > = [
    ["laptop", { price: 899, stock: 5 }], // sale price
    ["mouse", { price: 25, stock: 50 }], // sale price
    ["webcam", { price: 89, stock: 12 }] // new product
  ]

  await TxHashMap.setMany(catalog, priceUpdates)

  await TxHashMap.size(catalog) // => 5

  // Verify the updates
  await TxHashMap.get(catalog, "laptop") // => Option.some({ price: 899, stock: 5 })

  // Can also use Map, Set of tuples, or any iterable of entries
  const jsMap = new Map([["tablet", { price: 399, stock: 3 }]])
  await TxHashMap.setMany(catalog, jsMap)
  return await TxHashMap.get(catalog, "tablet")
}

await runPromise(program) // => Option.some({ price: 399, stock: 3 })
```

## isTxHashMap

**Checking TxHashMap values**

```efx
import { Effect, Exit } from "effect"

const program = effect {
  const txMap = await TxHashMap.make(["key", "value"])

  TxHashMap.isTxHashMap(txMap) // => true
  TxHashMap.isTxHashMap({}) // => false
  TxHashMap.isTxHashMap(null) // => false
  TxHashMap.isTxHashMap("not a map") // => false

  // Useful for type guards in runtime checks
  const validateInput = (value: unknown) => {
    if (TxHashMap.isTxHashMap(value)) {
      // TypeScript now knows this is a TxHashMap
      return succeed("Valid TxHashMap")
    }
    return fail("Invalid input")
  }

  await exit(validateInput(null)) // => Exit.fail("Invalid input")
  return await exit(validateInput(txMap))
}

await runPromise(program) // => Exit.succeed("Valid TxHashMap")
```

## getHash

**Looking up values with precomputed hashes**

```efx
import { Effect, Hash, Option } from "effect"

const program = effect {
  // Create a cache with user sessions
  const cache = await TxHashMap.make(
    ["session_abc123", { userId: "user1", lastActive: 1_700_000_000_000 }],
    ["session_def456", { userId: "user2", lastActive: 1_700_000_060_000 }]
  )

  // When you have precomputed hash (e.g., from another lookup)
  const sessionId = "session_abc123"
  const precomputedHash = Hash.string(sessionId)

  // Use hash-optimized lookup for performance in hot paths
  const session = await TxHashMap.getHash(cache, sessionId, precomputedHash)
  session // => Option.some({ userId: "user1", lastActive: 1_700_000_000_000 })

  // This avoids recomputing the hash when you already have it
  return await TxHashMap.getHash(
    cache,
    "invalid",
    Hash.string("invalid")
  )
}

await runPromise(program) // => Option.none()
```

## hasHash

**Checking keys with precomputed hashes**

```efx
const program = effect {
  // Create an access control map
  const permissions = await TxHashMap.make(
    ["admin", { read: true, write: true, delete: true }],
    ["user", { read: true, write: false, delete: false }]
  )

  // When checking permissions frequently with same roles
  const role = "admin"
  const roleHash = Hash.string(role)

  // Use hash-optimized existence check
  await TxHashMap.hasHash(permissions, role, roleHash) // => true

  // Check non-existent role
  await TxHashMap.hasHash(
    permissions,
    "guest",
    Hash.string("guest")
  ) // => false

  // Useful in hot paths where hash is computed once and reused
  const roles = ["admin", "user", "moderator"]
  const roleHashes = roles.map((role) => [role, Hash.string(role)] as const)
  const results: Array<string> = []
  for (const [role, hash] of roleHashes) {
    const exists = await TxHashMap.hasHash(permissions, role, hash)
    results.push(`Role ${role}: ${exists}`)
  }
  return results
}

await runPromise(program) // => ["Role admin: true", "Role user: true", "Role moderator: false"]
```

## map

**Mapping values**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a user profile map
  const profiles = await TxHashMap.make(
    ["alice", { name: "Alice", age: 30, active: true }],
    ["bob", { name: "Bob", age: 25, active: false }],
    ["charlie", { name: "Charlie", age: 35, active: true }]
  )

  // Transform to extract just names with greeting
  const greetings = await TxHashMap.map(
    profiles,
    (profile, userId) => `Hello, ${profile.name}! (User: ${userId})`
  )

  // Check the transformed values
  await TxHashMap.get(greetings, "alice") // => Option.some("Hello, Alice! (User: alice)")

  // Data-last usage with pipe
  const ages = await profiles.pipe(
    TxHashMap.map((profile) => profile.age)
  )

  await TxHashMap.get(ages, "alice") // => Option.some(30)

  // Original map is unchanged
  return await TxHashMap.get(profiles, "alice")
}

await runPromise(program) // => Option.some({ name: "Alice", age: 30, active: true })
```

## filter

**Filtering entries**

```efx
const program = effect {
  // Create a product inventory
  const inventory = await TxHashMap.make(
    ["laptop", { price: 999, stock: 5, category: "electronics" }],
    ["mouse", { price: 29, stock: 50, category: "electronics" }],
    ["book", { price: 15, stock: 100, category: "books" }],
    ["phone", { price: 699, stock: 0, category: "electronics" }]
  )

  // Filter to get only electronics in stock
  const electronicsInStock = await TxHashMap.filter(
    inventory,
    (product) => product.category === "electronics" && product.stock > 0
  )

  await TxHashMap.size(electronicsInStock) // => 2

  // Data-last usage with pipe
  const expensiveItems = await inventory.pipe(
    TxHashMap.filter((product) => product.price > 500)
  )

  await TxHashMap.size(expensiveItems) // => 2

  // Type guard usage
  return await TxHashMap.filter(
    inventory,
    (product): product is typeof product & { price: number } =>
      product.price > 50
  )
}

await runPromise(program)
```

## reduce

**Reducing entries**

```efx
const program = effect {
  // Create a sales data map
  const sales = await TxHashMap.make(
    ["Q1", 15000],
    ["Q2", 18000],
    ["Q3", 22000],
    ["Q4", 25000]
  )

  // Calculate total sales
  const totalSales = await TxHashMap.reduce(
    sales,
    0,
    (total, amount) => total + amount
  )
  totalSales // => 80000

  // Data-last usage with pipe
  const quarterlyReport = await sales.pipe(
    TxHashMap.reduce(
      { quarters: 0, total: 0, max: 0 },
      (report, amount, quarter) => ({
        quarters: report.quarters + 1,
        total: report.total + amount,
        max: Math.max(report.max, amount)
      })
    )
  )
  return quarterlyReport
}

await runPromise(program) // => { quarters: 4, total: 80000, max: 25000 }
```

## filterMap

**Filtering and mapping entries**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a mixed data map
  const userData = await TxHashMap.make(
    ["alice", { age: "30", role: "admin", active: true }],
    ["bob", { age: "invalid", role: "user", active: true }],
    ["charlie", { age: "25", role: "admin", active: false }],
    ["diana", { age: "28", role: "user", active: true }]
  )

  // Extract valid ages for active admin users only
  const activeAdminAges = await TxHashMap.filterMap(
    userData,
    (user, username) => {
      if (!user.active || user.role !== "admin") return Result.failVoid
      const age = parseInt(user.age)
      if (isNaN(age)) return Result.failVoid
      return Result.succeed({
        username,
        age,
        seniority: age > 27 ? "senior" : "junior"
      })
    }
  )

  const aliceData = await TxHashMap.get(activeAdminAges, "alice")
  aliceData // => Option.some({ username: "alice", age: 30, seniority: "senior" })
  await TxHashMap.get(activeAdminAges, "charlie") // => Option.none()

  // Data-last usage with pipe
  const validAges = await userData.pipe(
    TxHashMap.filterMap((user) => {
      const age = parseInt(user.age)
      return isNaN(age) ? Result.failVoid : Result.succeed(age)
    })
  )

  return await TxHashMap.size(validAges)
}

await runPromise(program) // => 3
```

## hasBy

**Checking entries with a predicate**

```efx
const program = effect {
  // Create a user status map
  const currentTime = 1_700_000_000_000
  const userStatuses = await TxHashMap.make(
    ["alice", { status: "online", lastSeen: currentTime }],
    ["bob", { status: "offline", lastSeen: currentTime - 3_600_000 }],
    ["charlie", { status: "online", lastSeen: currentTime }]
  )

  // Check if any users are online
  await TxHashMap.hasBy(
    userStatuses,
    (user) => user.status === "online"
  ) // => true

  // Check if any users have specific username pattern
  await TxHashMap.hasBy(
    userStatuses,
    (user, username) => username.startsWith("admin")
  ) // => false

  // Data-last usage with pipe
  return await userStatuses.pipe(
    TxHashMap.hasBy((user) => currentTime - user.lastSeen < 1_800_000) // 30 minutes
  )
}

await runPromise(program) // => true
```

## findFirst

**Finding the first matching entry**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a task priority map
  const tasks = await TxHashMap.make(
    ["task1", { priority: 1, assignee: "alice", completed: false }],
    ["task2", { priority: 3, assignee: "bob", completed: true }],
    ["task3", { priority: 2, assignee: "alice", completed: false }]
  )

  // Find first high-priority incomplete task
  const highPriorityTask = await TxHashMap.findFirst(
    tasks,
    (task) => task.priority >= 2 && !task.completed
  )

  highPriorityTask // => Option.some(["task3", { priority: 2, assignee: "alice", completed: false }])

  // Find first task assigned to specific user
  return await tasks.pipe(
    TxHashMap.findFirst((task) => task.assignee === "alice")
  )
}

await runPromise(program) // => Option.some(["task1", { priority: 1, assignee: "alice", completed: false }])
```

## some

**Checking whether some entries match**

```efx
const program = effect {
  // Create a product inventory
  const inventory = await TxHashMap.make(
    ["laptop", { price: 999, stock: 5 }],
    ["mouse", { price: 29, stock: 50 }],
    ["keyboard", { price: 79, stock: 0 }]
  )

  // Check if any products are expensive
  await TxHashMap.some(
    inventory,
    (product) => product.price > 500
  ) // => true

  // Check if any products are out of stock
  await TxHashMap.some(
    inventory,
    (product) => product.stock === 0
  ) // => true

  // Data-last usage with pipe
  return await inventory.pipe(
    TxHashMap.some((product) => product.price < 50)
  )
}

await runPromise(program) // => true
```

## every

**Checking whether every entry matches**

```efx
const program = effect {
  // Create a user permissions map
  const permissions = await TxHashMap.make(
    ["alice", { canRead: true, canWrite: true, canDelete: false }],
    ["bob", { canRead: true, canWrite: false, canDelete: false }],
    ["charlie", { canRead: true, canWrite: true, canDelete: true }]
  )

  // Check if all users can read
  await TxHashMap.every(
    permissions,
    (perms) => perms.canRead
  ) // => true

  // Check if all users can write
  await TxHashMap.every(
    permissions,
    (perms) => perms.canWrite
  ) // => false

  // Data-last usage with pipe
  return await permissions.pipe(
    TxHashMap.every((perms, username) => perms.canRead && username.length > 2)
  )
}

await runPromise(program) // => true
```

## forEach

**Running effects for each entry**

```efx
const program = effect {
  // Create a log processing map
  const logs = await TxHashMap.make(
    ["error.log", { size: 1024, level: "error" }],
    ["access.log", { size: 2048, level: "info" }],
    ["debug.log", { size: 512, level: "debug" }]
  )

  const messages: Array<string> = []
  await TxHashMap.forEach(logs, (logInfo, filename) =>
    sync(() => {
      messages.push(`${filename}: ${logInfo.size} bytes (${logInfo.level})`)
    }))

  return messages.sort()
}

const result = await runPromise(program)
result // => ["access.log: 2048 bytes (info)", "debug.log: 512 bytes (debug)", "error.log: 1024 bytes (error)"]
```

## flatMap

**Flat mapping entries**

```efx
import { Effect, Option } from "effect"

const program = effect {
  // Create a department-employee map
  const departments = await TxHashMap.make(
    ["engineering", ["alice", "bob"]],
    ["marketing", ["charlie", "diana"]]
  )

  // Expand each department into individual employee entries with metadata
  const employeeDetails = await TxHashMap.flatMap(
    departments,
    (employees, department) =>
      effect {
        const employeeMap = await TxHashMap.empty<
          string,
          { department: string; role: string }
        >()
        for (let i = 0; i < employees.length; i++) {
          const employee = employees[i]
          const role = i === 0 ? "lead" : "member"
          await TxHashMap.set(employeeMap, employee, { department, role })
        }
        return employeeMap
      }
  )

  // Check the flattened result
  await TxHashMap.get(employeeDetails, "alice") // => Option.some({ department: "engineering", role: "lead" })
  await TxHashMap.get(employeeDetails, "charlie") // => Option.some({ department: "marketing", role: "lead" })
  return await TxHashMap.size(employeeDetails)
}

await runPromise(program) // => 4
```

## compact

**Compacting optional values**

```efx
const program = effect {
  // Create a map with optional user data
  const userData = await TxHashMap.make<
    string,
    Option<{ age: number; email?: string }>
  >(
    ["alice", Option.some({ age: 30, email: "alice@example.com" })],
    ["bob", Option.none()], // incomplete data
    ["charlie", Option.some({ age: 25 })],
    ["diana", Option.none()], // missing data
    ["eve", Option.some({ age: 28, email: "eve@example.com" })]
  )

  // Remove all None values and unwrap Some values
  const validUsers = await TxHashMap.compact(userData)

  await TxHashMap.size(validUsers) // => 3

  await TxHashMap.get(validUsers, "alice") // => Option.some({ age: 30, email: "alice@example.com" })
  await TxHashMap.get(validUsers, "bob") // => Option.none()

  // Useful for cleaning up optional data processing results
  const userAges = await TxHashMap.map(validUsers, (user) => user.age)
  return (await TxHashMap.entries(userAges)).toSorted(([left], [right]) => left.localeCompare(right))
}

await runPromise(program) // => [["alice", 30], ["charlie", 25], ["eve", 28]]
```

## toEntries

**Converting to entries**

```efx
const program = effect {
  const settings = await TxHashMap.make(
    ["theme", "dark"],
    ["language", "en-US"],
    ["timezone", "UTC"]
  )

  // Get all entries as an array
  const sortedEntries = (await TxHashMap.toEntries(settings))
    .toSorted(([left], [right]) => left.localeCompare(right))
  sortedEntries // => [["language", "en-US"], ["theme", "dark"], ["timezone", "UTC"]]

  // Convert to an object
  return Object.fromEntries(sortedEntries)
}

await runPromise(program) // => { language: "en-US", theme: "dark", timezone: "UTC" }
```

## toValues

**Converting to values**

```efx
const program = effect {
  const inventory = await TxHashMap.make(
    ["laptop", { price: 999, stock: 5 }],
    ["mouse", { price: 29, stock: 50 }],
    ["keyboard", { price: 79, stock: 20 }]
  )

  // Get all product information
  const products = await TxHashMap.toValues(inventory)
  products.length // => 3

  // Calculate total inventory value
  const totalValue = products.reduce(
    (sum, product) => sum + (product.price * product.stock),
    0
  )
  totalValue // => 8025

  // Find products with low stock
  return products.filter((product) => product.stock < 10).length
}

await runPromise(program) // => 1
```
