# effect/MutableRef

The examples in the JSDoc of `packages/effect/src/MutableRef.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## MutableRef

**Creating and updating refs**

```efx
import { MutableRef } from "effect"

// Create a mutable reference
const ref: MutableRef.MutableRef<number> = MutableRef.make(42)

// Read the current value
ref.current // => 42
MutableRef.get(ref) // => 42

// Update the value
ref.current = 100

MutableRef.get(ref) // => 100

// Use with complex types
interface Config {
  timeout: number
  retries: number
}

const config: MutableRef.MutableRef<Config> = MutableRef.make({
  timeout: 5000,
  retries: 3
})

// Update through the interface
config.current = { timeout: 10000, retries: 5 }

config.current // => { timeout: 10000, retries: 5 }
```

## make

**Creating mutable refs**

```efx
import { MutableRef } from "effect"

// Create a counter reference
const counter = MutableRef.make(0)

MutableRef.get(counter) // => 0

// Create a configuration reference
const config = MutableRef.make({ debug: false, timeout: 5000 })

MutableRef.get(config) // => { debug: false, timeout: 5000 }

// Create a string reference
const status = MutableRef.make("idle")
MutableRef.set(status, "running")

MutableRef.get(status) // => "running"
```

## compareAndSet

**Comparing and setting values**

```efx
import { MutableRef } from "effect"

const ref = MutableRef.make("initial")

// Successful compare and set
const updated = MutableRef.compareAndSet(ref, "initial", "updated")

updated // => true
MutableRef.get(ref) // => "updated"

// Failed compare and set (value doesn't match)
const failed = MutableRef.compareAndSet(ref, "initial", "failed")

failed // => false
MutableRef.get(ref) // => "updated"

// Thread-safe counter increment
const counter = MutableRef.make(5)
let current: number
do {
  current = MutableRef.get(counter)
} while (!MutableRef.compareAndSet(counter, current, current + 1))

MutableRef.get(counter) // => 6

// Pipe-able version
const casUpdate = MutableRef.compareAndSet("updated", "final")

casUpdate(ref) // => true
MutableRef.get(ref) // => "final"
```

## decrement

**Decrementing numeric refs**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Decrement the counter
MutableRef.decrement(counter)

MutableRef.get(counter) // => 4

// Chain operations
MutableRef.decrement(counter)
MutableRef.decrement(counter)

MutableRef.get(counter) // => 2

// Useful for countdown scenarios
const countdown = MutableRef.make(10)
while (MutableRef.get(countdown) > 0) {
  MutableRef.decrement(countdown)
}

MutableRef.get(countdown) // => 0
```

## decrementAndGet

**Decrementing and reading refs**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Decrement and get the new value
const newValue = MutableRef.decrementAndGet(counter)

newValue // => 4
MutableRef.get(counter) // => 4

// Use in expressions
const lives = MutableRef.make(3)
const message = `Lives remaining: ${MutableRef.decrementAndGet(lives)}`

message // => "Lives remaining: 2"

// Conditional logic based on decremented value
const attempts = MutableRef.make(3)
let retries = 0
while (MutableRef.decrementAndGet(attempts) >= 0) {
  retries += 1
}

retries // => 3
MutableRef.get(attempts) // => -1
```

## get

**Reading current values**

```efx
import { MutableRef } from "effect"

const ref = MutableRef.make("hello")

MutableRef.get(ref) // => "hello"

MutableRef.set(ref, "world")

MutableRef.get(ref) // => "world"

// Reading complex objects
const config = MutableRef.make({ port: 3000, host: "localhost" })
const currentConfig = MutableRef.get(config)

currentConfig // => { port: 3000, host: "localhost" }

// Multiple reads return the same value
const value1 = MutableRef.get(ref)
const value2 = MutableRef.get(ref)

value1 === value2 // => true
```

## getAndDecrement

**Reading before decrementing**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Get current value and then decrement
const previousValue = MutableRef.getAndDecrement(counter)

previousValue // => 5
MutableRef.get(counter) // => 4

// Useful for processing where you need the original value
const itemsLeft = MutableRef.make(10)
const processedItems: Array<number> = []
while (MutableRef.get(itemsLeft) > 0) {
  const currentItem = MutableRef.getAndDecrement(itemsLeft)
  processedItems.push(currentItem)
}

processedItems // => [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
MutableRef.get(itemsLeft) // => 0

// Post-decrement semantics (like i-- in other languages)
const index = MutableRef.make(3)
const currentIndex = MutableRef.getAndDecrement(index)
const nextIndex = MutableRef.get(index)

currentIndex // => 3
nextIndex // => 2
```

## getAndIncrement

**Reading before incrementing**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Get current value and then increment
const previousValue = MutableRef.getAndIncrement(counter)

previousValue // => 5
MutableRef.get(counter) // => 6

// Useful for ID generation
const idGenerator = MutableRef.make(0)
const getId = () => MutableRef.getAndIncrement(idGenerator)
const ids = [getId(), getId(), getId()]

ids // => [0, 1, 2]

// Post-increment semantics (like i++ in other languages)
const position = MutableRef.make(0)
const currentPos = MutableRef.getAndIncrement(position)
const nextPos = MutableRef.get(position)

currentPos // => 0
nextPos // => 1

// Useful for iteration counters
const iterations = MutableRef.make(0)
const visited: Array<number> = []
while (MutableRef.get(iterations) < 5) {
  const iteration = MutableRef.getAndIncrement(iterations)
  visited.push(iteration)
}

visited // => [0, 1, 2, 3, 4]
MutableRef.get(iterations) // => 5
```

## getAndSet

**Reading before setting**

```efx
import { MutableRef } from "effect"

const ref = MutableRef.make("old")

// Set new value and get the previous one
const previous = MutableRef.getAndSet(ref, "new")

previous // => "old"
MutableRef.get(ref) // => "new"

// Swapping values
const counter = MutableRef.make(5)
const oldValue = MutableRef.getAndSet(counter, 10)
const newValue = MutableRef.get(counter)

oldValue // => 5
newValue // => 10

// Pipe-able version
const setValue = MutableRef.getAndSet("final")
const previousValue = setValue(ref)

previousValue // => "new"
MutableRef.get(ref) // => "final"

// Useful for atomic swaps in algorithms
const buffer = MutableRef.make<Array<string>>(["a", "b", "c"])
const oldBuffer = MutableRef.getAndSet(buffer, [])

oldBuffer // => ["a", "b", "c"]
MutableRef.get(buffer) // => []
```

## getAndUpdate

**Reading before updating**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Increment and get the old value
const oldValue = MutableRef.getAndUpdate(counter, (n) => n + 1)

oldValue // => 5
MutableRef.get(counter) // => 6

// Double the value and get the previous one
const previous = MutableRef.getAndUpdate(counter, (n) => n * 2)

previous // => 6
MutableRef.get(counter) // => 12

// Transform string and get old value
const message = MutableRef.make("hello")
const oldMessage = MutableRef.getAndUpdate(message, (s) => s.toUpperCase())

oldMessage // => "hello"
MutableRef.get(message) // => "HELLO"

// Pipe-able version
const addOne = MutableRef.getAndUpdate((n: number) => n + 1)
const result = addOne(counter)

result // => 12
MutableRef.get(counter) // => 13

// Useful for implementing atomic operations
const list = MutableRef.make<Array<number>>([1, 2, 3])
const oldList = MutableRef.getAndUpdate(list, (arr) => [...arr, 4])

oldList // => [1, 2, 3]
MutableRef.get(list) // => [1, 2, 3, 4]
```

## increment

**Incrementing numeric refs**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Increment the counter
MutableRef.increment(counter)

MutableRef.get(counter) // => 6

// Chain operations
MutableRef.increment(counter)
MutableRef.increment(counter)

MutableRef.get(counter) // => 8

// Useful for simple counting
const visits = MutableRef.make(0)
MutableRef.increment(visits) // User visited
MutableRef.increment(visits) // Another visit

MutableRef.get(visits) // => 2

// Returns the reference for chaining
const result = MutableRef.increment(counter)

result === counter // => true
MutableRef.get(counter) // => 9
```

## incrementAndGet

**Incrementing and reading refs**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Increment and get the new value
const newValue = MutableRef.incrementAndGet(counter)

newValue // => 6
MutableRef.get(counter) // => 6

// Use in expressions
const score = MutableRef.make(100)
const message = `New score: ${MutableRef.incrementAndGet(score)}`

message // => "New score: 101"

// Pre-increment semantics (like ++i in other languages)
const level = MutableRef.make(0)
const nextLevel = MutableRef.incrementAndGet(level)

nextLevel // => 1

// Conditional logic based on incremented value
const attempts = MutableRef.make(0)
const tooManyAttempts = MutableRef.incrementAndGet(attempts) > 3

tooManyAttempts // => false
MutableRef.get(attempts) // => 1
```

## set

**Setting values**

```efx
import { MutableRef } from "effect"

const ref = MutableRef.make("initial")

// Set a new value
MutableRef.set(ref, "updated")

MutableRef.get(ref) // => "updated"

// Chain set operations (since it returns the ref)
const result = MutableRef.set(ref, "final")

result === ref // => true
MutableRef.get(ref) // => "final"

// Set complex objects
const config = MutableRef.make({ debug: false, verbose: false })
MutableRef.set(config, { debug: true, verbose: true })

MutableRef.get(config) // => { debug: true, verbose: true }

// Pipe-able version
const setValue = MutableRef.set("new value")
setValue(ref)

MutableRef.get(ref) // => "new value"

// Useful for state management
const state = MutableRef.make<"idle" | "loading" | "success" | "error">("idle")
MutableRef.set(state, "loading")
// ... perform async operation
MutableRef.set(state, "success")

MutableRef.get(state) // => "success"
```

## setAndGet

**Setting and reading values**

```efx
import { MutableRef } from "effect"

const ref = MutableRef.make("old")

// Set and get the new value
const newValue = MutableRef.setAndGet(ref, "new")

newValue // => "new"
MutableRef.get(ref) // => "new"

// Useful for assignments that need the value
const counter = MutableRef.make(0)
const currentValue = MutableRef.setAndGet(counter, 42)

currentValue // => 42

// Pipe-able version
const setValue = MutableRef.setAndGet("final")
const result = setValue(ref)

result // => "final"

// Difference from set: returns value instead of reference
const ref1 = MutableRef.make(1)
const returnedRef = MutableRef.set(ref1, 2) // Returns MutableRef
const returnedValue = MutableRef.setAndGet(ref1, 3) // Returns value

returnedRef === ref1 // => true
returnedValue // => 3
MutableRef.get(ref1) // => 3
```

## update

**Updating values**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Increment the counter
MutableRef.update(counter, (n) => n + 1)

MutableRef.get(counter) // => 6

// Chain updates (since it returns the ref)
const result = MutableRef.update(counter, (n) => n * 2)

result === counter // => true
MutableRef.get(counter) // => 12

// Transform string
const message = MutableRef.make("hello")
MutableRef.update(message, (s) => s.toUpperCase())

MutableRef.get(message) // => "HELLO"

// Update complex objects
const user = MutableRef.make({ name: "Alice", age: 30 })
MutableRef.update(user, (u) => ({ ...u, age: u.age + 1 }))

MutableRef.get(user) // => { name: "Alice", age: 31 }

// Pipe-able version
const double = MutableRef.update((n: number) => n * 2)
double(counter)

MutableRef.get(counter) // => 24

// Array operations
const list = MutableRef.make<Array<number>>([1, 2, 3])
MutableRef.update(list, (arr) => [...arr, 4])

MutableRef.get(list) // => [1, 2, 3, 4]
```

## updateAndGet

**Updating and reading values**

```efx
import { MutableRef } from "effect"

const counter = MutableRef.make(5)

// Increment and get the new value
const newValue = MutableRef.updateAndGet(counter, (n) => n + 1)

newValue // => 6
MutableRef.get(counter) // => 6

// Double the value and get the result
const doubled = MutableRef.updateAndGet(counter, (n) => n * 2)

doubled // => 12

// Transform string and get result
const message = MutableRef.make("hello")
const upperCase = MutableRef.updateAndGet(message, (s) => s.toUpperCase())

upperCase // => "HELLO"

// Pipe-able version
const increment = MutableRef.updateAndGet((n: number) => n + 1)
const result = increment(counter)

result // => 13

// Useful for calculations that need the result
const score = MutableRef.make(100)
const bonus = 50
const newScore = MutableRef.updateAndGet(score, (s) => s + bonus)

newScore // => 150

// Array transformations
const list = MutableRef.make<Array<number>>([1, 2, 3])
const newList = MutableRef.updateAndGet(list, (arr) => arr.map((x) => x * 2))

newList // => [2, 4, 6]
MutableRef.get(list) // => [2, 4, 6]
```

## toggle

**Toggling boolean refs**

```efx
import { MutableRef } from "effect"

const flag = MutableRef.make(false)

// Toggle the flag
MutableRef.toggle(flag)

MutableRef.get(flag) // => true

// Toggle again
MutableRef.toggle(flag)

MutableRef.get(flag) // => false

// Useful for state switches
const isVisible = MutableRef.make(true)
MutableRef.toggle(isVisible) // Hide

MutableRef.get(isVisible) // => false

// Toggle button implementation
const darkMode = MutableRef.make(false)
const toggleDarkMode = () => {
  MutableRef.toggle(darkMode)
  return MutableRef.get(darkMode) ? "ON" : "OFF"
}

toggleDarkMode() // => "ON"
toggleDarkMode() // => "OFF"

// Returns the reference for chaining
const result = MutableRef.toggle(flag)

result === flag // => true
MutableRef.get(flag) // => true
```
