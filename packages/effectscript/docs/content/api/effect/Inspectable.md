# effect/Inspectable

The examples in the JSDoc of `packages/effect/src/Inspectable.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks are Effect's own examples, converted by the
> EffectScript reverse compiler; each one compiles back to the original TypeScript. The prose is
> Effect's and names the TypeScript forms: `Effect.gen(function*() { … })` is `effect { … }`,
> `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is `await`,
> `return yield* Effect.fail(e)` is `throw e`, `x.pipe(f, g)` is `x |> f |> g`, and
> `Effect.log(…)` is `console.log(…)` inside `effect` code.

## NodeInspectSymbol

**Defining custom Node inspection**

```efx
import { Inspectable } from "effect"

class CustomObject {
  constructor(private value: string) {}

  [Inspectable.NodeInspectSymbol]() {
    return `CustomObject(${this.value})`
  }
}

const obj = new CustomObject("hello")
obj[Inspectable.NodeInspectSymbol]() // => "CustomObject(hello)"
```

**Typing custom Node inspection**

```efx
import { Inspectable } from "effect"

class CustomObject {
  constructor(private value: string) {}

  [Inspectable.NodeInspectSymbol]() {
    return `CustomObject(${this.value})`
  }
}

const obj = new CustomObject("test")
obj[Inspectable.NodeInspectSymbol]() // => "CustomObject(test)"
```

## Inspectable

**Implementing inspectable objects**

```efx
import { Formatter, Inspectable } from "effect"

class Result implements Inspectable.Inspectable {
  constructor(
    private readonly tag: "Success" | "Failure",
    private readonly value: unknown
  ) {}

  toString(): string {
    return Formatter.format(this.toJSON())
  }

  toJSON() {
    return { _tag: this.tag, value: this.value }
  }

  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON()
  }
}

const success = new Result("Success", 42)
success.toString() // => "{\"_tag\":\"Success\",\"value\":42}"
```

## BaseProto

**Using the base inspectable prototype**

```efx
import { Inspectable } from "effect"

// Use as prototype
const myObject = Object.create(Inspectable.BaseProto)
myObject.name = "example"
myObject.value = 42

myObject.toString() // => "\"[toJSON threw]\""

// Or extend in a constructor
function MyClass(this: any, name: string) {
  this.name = name
}
MyClass.prototype = Object.create(Inspectable.BaseProto)
MyClass.prototype.constructor = MyClass
```

## Class

**Extending the inspectable base class**

```efx
import { Inspectable } from "effect"

class User extends Inspectable.Class {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly email: string
  ) {
    super()
  }

  toJSON() {
    return {
      _tag: "User",
      id: this.id,
      name: this.name,
      email: this.email
    }
  }
}

const user = new User(1, "Alice", "alice@example.com")
user.toString() // => "{\"_tag\":\"User\",\"id\":1,\"name\":\"Alice\",\"email\":\"alice@example.com\"}"
user[Inspectable.NodeInspectSymbol]() // => { _tag: "User", id: 1, name: "Alice", email: "alice@example.com" }
```
