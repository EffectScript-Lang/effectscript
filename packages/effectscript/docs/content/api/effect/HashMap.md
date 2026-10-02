# effect/HashMap

The examples in the JSDoc of `packages/effect/src/HashMap.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## HashMap

**Using basic HashMap operations**

```efx
import { HashMap, Option } from "effect"

// Create a HashMap
const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])

// Access values
HashMap.get(map, "a") // => Option.some(1)
HashMap.get(map, "d") // => Option.none()

// Check if key exists
HashMap.has(map, "b") // => true

// Add/update values (returns new HashMap)
HashMap.set(map, "d", 4) // => HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
```

**Extracting HashMap types**

```efx
import { HashMap } from "effect"

// Create a concrete HashMap for type extraction
const inventory = HashMap.make(
  ["laptop", { quantity: 5, price: 999 }],
  ["mouse", { quantity: 20, price: 29 }]
)

// Extract types for reuse
type ProductId = HashMap.HashMap.Key<typeof inventory> // string
type Product = HashMap.HashMap.Value<typeof inventory> // { quantity: number, price: number }
type InventoryEntry = HashMap.HashMap.Entry<typeof inventory> // [string, Product]

// Use extracted types in functions
const updateInventory = (id: ProductId, product: Product) =>
  HashMap.set(inventory, id, product)

const processEntry = ([id, product]: InventoryEntry) =>
  `${id}: ${product.quantity} @ $${product.price}`

// Example of extracted types in action
const newProduct: Product = { quantity: 10, price: 199 }
const updatedInventory = updateInventory("tablet", newProduct)
processEntry(["tablet", newProduct]) // => "tablet: 10 @ $199"
updatedInventory // => HashMap.make(["laptop", { quantity: 5, price: 999 }], ["mouse", { quantity: 20, price: 29 }], ["tablet", newProduct])
```

## HashMap.UpdateFn

**Updating values from Options**

```efx
import { HashMap, Option } from "effect"

const map = HashMap.make(["a", 1], ["b", 2])

// Increment existing value or set to 1 if not present
const updateFn = (option: Option.Option<number>) =>
  Option.isSome(option) ? Option.some(option.value + 1) : Option.some(1)

const updated = HashMap.modifyAt(map, "a", updateFn)
HashMap.get(updated, "a") // => Option.some(2)
```

## HashMap.Key

**Extracting key types**

```efx
import { HashMap, Option } from "effect"

// Create a HashMap to extract key type from
const userMap = HashMap.make(
  ["alice", { name: "Alice", age: 30 }],
  ["bob", { name: "Bob", age: 25 }]
)

// Extract the key type (string)
type UserKey = HashMap.HashMap.Key<typeof userMap>

// Use the extracted type in functions
const getUserById = (id: UserKey) => HashMap.get(userMap, id)
getUserById("alice") // => Option.some({ name: "Alice", age: 30 })
```

## HashMap.Value

**Extracting value types**

```efx
import { HashMap, Option } from "effect"

// Create a HashMap with user data
const userMap = HashMap.make(
  ["alice", { name: "Alice", age: 30, active: true }],
  ["bob", { name: "Bob", age: 25, active: false }]
)

// Extract the value type (User object)
type User = HashMap.HashMap.Value<typeof userMap>

// Use the extracted type for type-safe operations
const processUser = (user: User) => {
  return user.active ? `${user.name} (active)` : `${user.name} (inactive)`
}

// The lookup has type Option<User> thanks to type extraction
HashMap.get(userMap, "alice") // => Option.some({ name: "Alice", age: 30, active: true })
processUser({ name: "Alice", age: 30, active: true }) // => "Alice (active)"
```

## HashMap.Entry

**Extracting entry types**

```efx
import { HashMap } from "effect"

// Create a product catalog HashMap
const catalog = HashMap.make(
  ["laptop", { price: 999, category: "electronics" }],
  ["book", { price: 29, category: "education" }]
)

// Extract the entry type [string, Product]
type CatalogEntry = HashMap.HashMap.Entry<typeof catalog>

// Use the extracted type for processing entries
const processEntry = ([productId, product]: CatalogEntry) => {
  return `${productId}: $${product.price} (${product.category})`
}

// Convert to entries, process, and sort for deterministic output
const descriptions = HashMap.toEntries(catalog).map(processEntry).sort()
descriptions // => ["book: $29 (education)", "laptop: $999 (electronics)"]
```

## isHashMap

**Checking HashMap values**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2])
const notMap = { a: 1 }

HashMap.isHashMap(map) // => true
HashMap.isHashMap(notMap) // => false
HashMap.isHashMap(null) // => false
```

## empty

**Creating an empty HashMap**

```efx
import { HashMap } from "effect"

HashMap.empty<string, number>() // => HashMap.empty()
```

## make

**Creating a HashMap from entries**

```efx
import { HashMap } from "effect"

HashMap.make(["a", 1], ["b", 2], ["c", 3]) // => HashMap.make(["a", 1], ["b", 2], ["c", 3])
```

## fromIterable

**Creating a HashMap from an iterable**

```efx
import { HashMap } from "effect"

const entries = [["a", 1], ["b", 2], ["c", 3]] as const
HashMap.fromIterable(entries) // => HashMap.make(["a", 1], ["b", 2], ["c", 3])
```

## isEmpty

**Checking for empty HashMaps**

```efx
import { HashMap } from "effect"

const emptyMap = HashMap.empty<string, number>()
const nonEmptyMap = HashMap.make(["a", 1])

HashMap.isEmpty(emptyMap) // => true
HashMap.isEmpty(nonEmptyMap) // => false
```

## get

**Looking up values**

```efx
import { HashMap, Option } from "effect"

const map = HashMap.make(["a", 1], ["b", 2])

HashMap.get(map, "a") // => Option.some(1)
HashMap.get(map, "c") // => Option.none()

// Using pipe syntax
HashMap.get("b")(map) // => Option.some(2)
```

## getHash

**Looking up values with a hash**

```efx
import { Hash, HashMap, Option } from "effect"

// Useful when implementing custom equality for complex keys
const userMap = HashMap.make(
  ["user123", { name: "Alice", role: "admin" }],
  ["user456", { name: "Bob", role: "user" }]
)

// Use precomputed hash for performance in hot paths
const userId = "user123"
const precomputedHash = Hash.string(userId)

// Lookup with custom hash (e.g., cached hash value)
HashMap.getHash(userMap, userId, precomputedHash) // => Option.some({ name: "Alice", role: "admin" })

// This avoids recomputing the hash when you already have it
HashMap.getHash(userMap, "user999", Hash.string("user999")) // => Option.none()
```

## getUnsafe

**Unsafely looking up values**

```efx
import { HashMap, Option } from "effect"

const config = HashMap.make(
  ["api_url", "https://api.example.com"],
  ["timeout", "5000"],
  ["retries", "3"]
)

// Safe: use when you're certain the key exists
HashMap.getUnsafe(config, "api_url") // => "https://api.example.com"

// Preferred: use get() for uncertain keys
HashMap.get(config, "db_url") // => Option.none()

// This would throw: HashMap.getUnsafe(config, "db_url")
// Error: "HashMap.getUnsafe: key not found"
```

## has

**Checking for keys**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2])

HashMap.has(map, "a") // => true
HashMap.has(map, "c") // => false

// Using pipe syntax
HashMap.has("b")(map) // => true
```

## hasHash

**Checking keys with a hash**

```efx
import { Hash, HashMap } from "effect"

// Create a map with case-sensitive keys
const userMap = HashMap.make(
  ["Admin", { role: "administrator" }],
  ["User", { role: "standard" }]
)

// Check with exact hash
const exactHash = Hash.string("Admin")
HashMap.hasHash(userMap, "Admin", exactHash) // => true

// A matching hash does not override key equality
HashMap.hasHash(userMap, "admin", exactHash) // => false

// A different hash also cannot find the existing key
const lowercaseHash = Hash.string("admin")
HashMap.hasHash(userMap, "Admin", lowercaseHash) // => false
```

## hasBy

**Checking entries by predicate**

```efx
import { HashMap } from "effect"

const hm = HashMap.make([1, "a"])
HashMap.hasBy(hm, (value, key) => value === "a" && key === 1) // => true
HashMap.hasBy(hm, (value) => value === "b") // => false
```

## set

**Setting a value**

```efx
import { HashMap } from "effect"

const map1 = HashMap.make(["a", 1])
HashMap.set(map1, "b", 2) // => HashMap.make(["a", 1], ["b", 2])

// Original map is unchanged
map1 // => HashMap.make(["a", 1])
```

## keys

**Iterating keys**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
Array.from(HashMap.keys(map)).sort() // => ["a", "b", "c"]
```

## values

**Iterating values**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
Array.from(HashMap.values(map)).sort() // => [1, 2, 3]
```

## toValues

**Converting values to an array**

```efx
import { HashMap } from "effect"

const employees = HashMap.make(
  ["alice", { department: "engineering", salary: 90000 }],
  ["bob", { department: "marketing", salary: 75000 }],
  ["charlie", { department: "engineering", salary: 95000 }]
)

// Extract all employee records
const allEmployees = HashMap.toValues(employees)
allEmployees.length // => 3

// Calculate total salary
allEmployees.reduce((sum, emp) => sum + emp.salary, 0) // => 260000

// Filter by department
allEmployees.filter((emp) => emp.department === "engineering").length // => 2
```

## entries

**Iterating entries**

```efx
import { HashMap } from "effect"

// Create a configuration map
const config = HashMap.make(
  ["database.host", "localhost"],
  ["database.port", "5432"],
  ["cache.enabled", "true"]
)

// Sort the derived array for deterministic output
const settings = Array.from(HashMap.entries(config))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `Setting ${key} = ${value}`)

settings // => ["Setting cache.enabled = true", "Setting database.host = localhost", "Setting database.port = 5432"]

// Convert to array when you need all entries at once
Array.from(HashMap.entries(config)).length // => 3
```

## toEntries

**Converting entries to an array**

```efx
import { HashMap } from "effect"

const gameScores = HashMap.make(
  ["alice", 1250],
  ["bob", 980],
  ["charlie", 1100]
)

// Convert to entries for processing
const scoreEntries = HashMap.toEntries(gameScores)

// Sort by score (descending)
const leaderboard = scoreEntries
  .sort(([, a], [, b]) => b - a)
  .map(([player, score], rank) => `${rank + 1}. ${player}: ${score}`)

leaderboard // => ["1. alice: 1250", "2. charlie: 1100", "3. bob: 980"]

// Convert back to HashMap if needed
HashMap.fromIterable(scoreEntries) // => HashMap.make(["alice", 1250], ["charlie", 1100], ["bob", 980])
```

## size

**Getting the size**

```efx
import { HashMap } from "effect"

const emptyMap = HashMap.empty<string, number>()
const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])

HashMap.size(emptyMap) // => 0
HashMap.size(map) // => 3
```

## beginMutation

**Beginning batch mutation**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1])

// Begin mutation for efficient batch operations
const mutable = HashMap.beginMutation(map)

// Multiple operations are now more efficient
HashMap.set(mutable, "b", 2)
HashMap.set(mutable, "c", 3)
HashMap.remove(mutable, "a")

// End mutation to get final immutable result
HashMap.endMutation(mutable) // => HashMap.make(["b", 2], ["c", 3])
```

## endMutation

**Ending batch mutation**

```efx
import { HashMap } from "effect"

// Start with an existing map
const original = HashMap.make(["x", 10], ["y", 20])

// Begin mutation for batch operations
const mutable = HashMap.beginMutation(original)

// Perform multiple efficient operations
HashMap.set(mutable, "z", 30)
HashMap.remove(mutable, "x")
HashMap.set(mutable, "w", 40)

// End mutation to get final immutable result
HashMap.endMutation(mutable) // => HashMap.make(["y", 20], ["z", 30], ["w", 40])
```

## mutate

**Applying batched mutations**

```efx
import { HashMap } from "effect"

const map1 = HashMap.make(["a", 1])
const map2 = HashMap.mutate(map1, (mutable) => {
  HashMap.set(mutable, "b", 2)
  HashMap.set(mutable, "c", 3)
})
map2 // => HashMap.make(["a", 1], ["b", 2], ["c", 3])
```

## modifyAt

**Updating values with Options**

```efx
import { HashMap, Option } from "effect"

const map = HashMap.make(["a", 1], ["b", 2])

// Increment existing value or set to 1 if not present
const updateFn = (option: Option.Option<number>) =>
  Option.isSome(option) ? Option.some(option.value + 1) : Option.some(1)

const updated = HashMap.modifyAt(map, "a", updateFn)
HashMap.get(updated, "a") // => Option.some(2)
```

## modifyHash

**Updating values with a hash**

```efx
import { Hash, HashMap, Option } from "effect"

// Useful when working with precomputed hashes for performance
const counters = HashMap.make(["downloads", 100], ["views", 250])

// Cache hash computation for frequently accessed keys
const metricKey = "downloads"
const cachedHash = Hash.string(metricKey)

// Update function that increments counter or initializes to 1
const incrementCounter = (current: Option.Option<number>) =>
  Option.isSome(current) ? Option.some(current.value + 1) : Option.some(1)

// Use cached hash for efficient updates in loops
const updated = HashMap.modifyHash(
  counters,
  metricKey,
  cachedHash,
  incrementCounter
)
HashMap.get(updated, "downloads") // => Option.some(101)

// Add new metric with precomputed hash
const newMetric = "clicks"
const clicksHash = Hash.string(newMetric)
const withClicks = HashMap.modifyHash(
  updated,
  newMetric,
  clicksHash,
  incrementCounter
)
HashMap.get(withClicks, "clicks") // => Option.some(1)
```

## modify

**Modifying existing values**

```efx
import { HashMap, Option } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2])
const map2 = HashMap.modify(map1, "a", (value) => value * 3)

HashMap.get(map2, "a") // => Option.some(3)
HashMap.get(map2, "b") // => Option.some(2)
```

## union

**Combining HashMaps**

```efx
import { HashMap, Option } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2])
const map2 = HashMap.make(["b", 20], ["c", 3])
const union = HashMap.union(map1, map2)

union // => HashMap.make(["a", 1], ["b", 20], ["c", 3])
HashMap.get(union, "b") // => Option.some(20)
```

## remove

**Removing a key**

```efx
import { HashMap } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3])
const map2 = HashMap.remove(map1, "b")

map2 // => HashMap.make(["a", 1], ["c", 3])
```

## removeMany

**Removing multiple keys**

```efx
import { HashMap } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
const map2 = HashMap.removeMany(map1, ["b", "d"])

map2 // => HashMap.make(["a", 1], ["c", 3])
```

## setMany

**Setting multiple entries**

```efx
import { HashMap, Option } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2])
const newEntries = [["c", 3], ["d", 4], ["a", 10]] as const // "a" will be overwritten
const map2 = HashMap.setMany(map1, newEntries)

map2 // => HashMap.make(["a", 10], ["b", 2], ["c", 3], ["d", 4])
HashMap.get(map2, "a") // => Option.some(10)
```

## map

**Mapping values**

```efx
import { HashMap, Option } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3])
const map2 = HashMap.map(map1, (value, key) => `${key}:${value * 2}`)

HashMap.get(map2, "a") // => Option.some("a:2")
HashMap.get(map2, "b") // => Option.some("b:4")
```

## flatMap

**Flat mapping values**

```efx
import { HashMap, Option } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2])
const map2 = HashMap.flatMap(
  map1,
  (value, key) => HashMap.make([key + "1", value], [key + "2", value * 2])
)

map2 // => HashMap.make(["a1", 1], ["a2", 2], ["b1", 2], ["b2", 4])
HashMap.get(map2, "b2") // => Option.some(4)
```

## forEach

**Iterating with side effects**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2])
const collected: Array<[string, number]> = []

HashMap.forEach(map, (value, key) => {
  collected.push([key, value])
})

collected.sort() // => [["a", 1], ["b", 2]]
```

## reduce

**Reducing values**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
HashMap.reduce(map, 0, (acc, value) => acc + value) // => 6
```

## filter

**Filtering entries**

```efx
import { HashMap } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
const map2 = HashMap.filter(map1, (value) => value % 2 === 0)

map2 // => HashMap.make(["b", 2], ["d", 4])
```

## compact

**Compacting Option values**

```efx
import { HashMap, Option } from "effect"

const map1 = HashMap.make(
  ["a", Option.some(1)],
  ["b", Option.none()],
  ["c", Option.some(3)]
)
const map2 = HashMap.compact(map1)

map2 // => HashMap.make(["a", 1], ["c", 3])
HashMap.get(map2, "a") // => Option.some(1)
```

## filterMap

**Filtering and mapping Results**

```efx
import { HashMap, Option, Result } from "effect"

const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
const map2 = HashMap.filterMap(
  map1,
  (value) => value % 2 === 0 ? Result.succeed(value * 2) : Result.failVoid
)

map2 // => HashMap.make(["b", 4], ["d", 8])
HashMap.get(map2, "b") // => Option.some(4)
```

## findFirst

**Finding the first matching entry**

```efx
import { HashMap, Option } from "effect"

const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
HashMap.findFirst(map, (value, key) => key === "b" && value > 1) // => Option.some(["b", 2])
```

## some

**Checking for any matching entry**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])

HashMap.some(map, (value) => value > 2) // => true
HashMap.some(map, (value) => value > 5) // => false
```

## every

**Checking all entries**

```efx
import { HashMap } from "effect"

const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])

HashMap.every(map, (value) => value > 0) // => true
HashMap.every(map, (value) => value > 1) // => false
```
