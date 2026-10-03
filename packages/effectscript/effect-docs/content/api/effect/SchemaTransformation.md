# effect/SchemaTransformation

The examples in the JSDoc of `packages/effect/src/SchemaTransformation.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Middleware

**Creating a middleware that falls back on decode failure**

```efx
const fallback = new SchemaTransformation.Middleware<string, string, never, never, never, never>(
  (effect) => Effect.catch(effect, () => succeed(Option.some("fallback"))),
  (effect) => effect
)
const issue = new SchemaIssue.InvalidValue({ message: "Missing value" })
await runPromise(fallback.decode(fail(issue), {})) // => Option.some("fallback")
```

## Transformation

**Composing two transformations**

```efx
import { SchemaTransformation } from "effect"

const trimAndLower = SchemaTransformation.composeTransformation(
  SchemaTransformation.trim(),
  SchemaTransformation.toLowerCase()
)
trimAndLower._tag // => "Transformation"
```

## composeTransformation

**Trimming and lowercasing a string**

```efx
import { Schema, SchemaTransformation } from "effect"

const transformation = SchemaTransformation.composeTransformation(
  SchemaTransformation.trim(),
  SchemaTransformation.toLowerCase()
)
const schema = Schema.String.pipe(Schema.decode(transformation))

Schema.decodeUnknownSync(schema)("  HELLO  ") // => "hello"
```

## isTransformation

**Checking a value**

```efx
import { SchemaTransformation } from "effect"

SchemaTransformation.isTransformation(SchemaTransformation.trim()) // => true
SchemaTransformation.isTransformation({ decode: null, encode: null }) // => false
```

## makeTransformation

**Wrapping existing getters**

```efx
import { SchemaGetter, SchemaTransformation } from "effect"

const t = SchemaTransformation.makeTransformation({
  decode: SchemaGetter.transform<number, string>((s) => Number(s)),
  encode: SchemaGetter.transform<string, number>((n) => String(n))
})
t._tag // => "Transformation"
```

## transformEffect

**Parsing a date string that can fail**

```efx
import { Effect, Option } from "effect"

const DateFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Date,
    SchemaTransformation.transformEffect({
      decode: (s, options) => {
        const d = new Date(s)
        return isNaN(d.getTime())
          ? fail(new SchemaIssue.InvalidValue({ message: "Invalid date" }, s, options))
          : succeed(d)
      },
      encode: (d) => succeed(d.toISOString())
    })
  )
)
Schema.decodeSync(DateFromString)("2024-01-01").toISOString() // => "2024-01-01T00:00:00.000Z"
```

## transform

**Converting between cents and dollars**

```efx
import { Schema, SchemaTransformation } from "effect"

const CentsFromDollars = Schema.Number.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (dollars) => dollars * 100,
      encode: (cents) => cents / 100
    })
  )
)
Schema.decodeSync(CentsFromDollars)(2.5) // => 250
```

## transformOptional

**Converting an optional key to Option**

```efx
import { Option, Schema, SchemaTransformation } from "effect"

const schema = Schema.Struct({
  a: Schema.optionalKey(Schema.Number).pipe(
    Schema.decodeTo(
      Schema.Option(Schema.Number),
      SchemaTransformation.transformOptional({
        decode: Option.some,
        encode: Option.flatten
      })
    )
  )
})
Schema.decodeSync(schema)({}).a // => Option.none()
```

## trim

**Trimming on decode**

```efx
import { Schema, SchemaTransformation } from "effect"

const Trimmed = Schema.String.pipe(
  Schema.decode(SchemaTransformation.trim())
)
Schema.decodeSync(Trimmed)("  hello  ") // => "hello"
```

## snakeToCamel

**Converting snake case to camel case**

```efx
import { Schema, SchemaTransformation } from "effect"

const SnakeToCamel = Schema.String.pipe(
  Schema.decode(SchemaTransformation.snakeToCamel())
)
Schema.decodeSync(SnakeToCamel)("user_name") // => "userName"
```

## toLowerCase

**Lowercasing on decode**

```efx
import { Schema, SchemaTransformation } from "effect"

const Lowered = Schema.String.pipe(
  Schema.decode(SchemaTransformation.toLowerCase())
)
Schema.decodeSync(Lowered)("HELLO") // => "hello"
```

## toUpperCase

**Uppercasing on decode**

```efx
import { Schema, SchemaTransformation } from "effect"

const Uppered = Schema.String.pipe(
  Schema.decode(SchemaTransformation.toUpperCase())
)
Schema.decodeSync(Uppered)("hello") // => "HELLO"
```

## capitalize

**Capitalizing on decode**

```efx
import { Schema, SchemaTransformation } from "effect"

const Capitalized = Schema.String.pipe(
  Schema.decode(SchemaTransformation.capitalize())
)
Schema.decodeSync(Capitalized)("hello") // => "Hello"
```

## uncapitalize

**Uncapitalizing on decode**

```efx
import { Schema, SchemaTransformation } from "effect"

const Uncapitalized = Schema.String.pipe(
  Schema.decode(SchemaTransformation.uncapitalize())
)
Schema.decodeSync(Uncapitalized)("Hello") // => "hello"
```

## splitKeyValue

**Parsing key-value pairs**

```efx
import { Schema, SchemaTransformation } from "effect"

const Config = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Record(Schema.String, Schema.String),
    SchemaTransformation.splitKeyValue({ separator: ";", keyValueSeparator: ":" })
  )
)
Schema.decodeSync(Config)("host:localhost;port:3000") // => { host: "localhost", port: "3000" }
```

## passthrough

**Chaining schemas with no conversion**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.Trim.pipe(
  Schema.decodeTo(Schema.FiniteFromString, SchemaTransformation.passthrough())
)
Schema.decodeSync(schema)("1") // => 1
```

## passthroughSupertype

**Passing through supertypes**

```efx
import { SchemaTransformation } from "effect"

const t: SchemaTransformation.Transformation<"a" | "b", string> =
  SchemaTransformation.passthroughSupertype<"a" | "b", string>()
```

## passthroughSubtype

**Passing through subtypes**

```efx
import { SchemaTransformation } from "effect"

const t: SchemaTransformation.Transformation<string, "a" | "b"> =
  SchemaTransformation.passthroughSubtype<string, "a" | "b">()
```

## numberFromString

**Converting a string to a number**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.Number, SchemaTransformation.numberFromString)
)
Schema.decodeSync(schema)("42") // => 42
```

## bigintFromString

**Converting a string to a BigInt**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.BigInt, SchemaTransformation.bigintFromString)
)
Schema.decodeSync(schema)("42") // => 42n
```

## dateFromString

**Converting a string to a Date**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromString)
)
Schema.decodeSync(schema)("2024-01-01").toISOString() // => "2024-01-01T00:00:00.000Z"
```

## dateFromMillis

**Converting milliseconds to a Date**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.Number.pipe(
  Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromMillis)
)
Schema.decodeSync(schema)(0).toISOString() // => "1970-01-01T00:00:00.000Z"
```

## durationFromString

**Converting a string to a Duration**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromString)
)
String(Schema.decodeSync(schema)("5 seconds")) // => "5000 millis"
```

## durationFromNanos

**Converting nanoseconds to a Duration**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.BigInt.pipe(
  Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromNanos)
)
String(Schema.decodeSync(schema)(5n)) // => "5 nanos"
```

## durationFromMillis

**Converting milliseconds to a Duration**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.Number.pipe(
  Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromMillis)
)
String(Schema.decodeSync(schema)(5000)) // => "5000 millis"
```

## optionFromNullOr

**Converting nullable values to an Option**

```efx
import { Option, Schema, SchemaTransformation } from "effect"

const schema = Schema.NullOr(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Option(Schema.String),
    SchemaTransformation.optionFromNullOr()
  )
)
Schema.decodeSync(schema)(null) // => Option.none()
```

## optionFromUndefinedOr

**Converting undefined-or values to an Option**

```efx
import { Option, Schema, SchemaTransformation } from "effect"

const schema = Schema.UndefinedOr(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Option(Schema.String),
    SchemaTransformation.optionFromUndefinedOr()
  )
)
Schema.decodeSync(schema)(undefined) // => Option.none()
```

## optionFromNullishOr

**Converting nullish values to an Option and encoding None as null**

```efx
import { Option, Schema, SchemaTransformation } from "effect"

const schema = Schema.NullishOr(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Option(Schema.String),
    SchemaTransformation.optionFromNullishOr({ onNoneEncoding: null })
  )
)
Schema.encodeSync(schema)(Option.none()) // => null
```

## optionFromOptionalKey

**Converting an optional key to an Option**

```efx
import { Option, Schema, SchemaTransformation } from "effect"

const schema = Schema.Struct({
  name: Schema.optionalKey(Schema.String).pipe(
    Schema.decodeTo(
      Schema.Option(Schema.String),
      SchemaTransformation.optionFromOptionalKey()
    )
  )
})
Schema.decodeSync(schema)({}).name // => Option.none()
```

## optionFromOptional

**Converting an optional value to an Option**

```efx
import { Option, Schema, SchemaTransformation } from "effect"

const schema = Schema.Struct({
  age: Schema.optional(Schema.Number).pipe(
    Schema.decodeTo(
      Schema.Option(Schema.Number),
      SchemaTransformation.optionFromOptional()
    )
  )
})
Schema.decodeSync(schema)({ age: undefined }).age // => Option.none()
```

## urlFromString

**Converting a string to a URL**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.URL, SchemaTransformation.urlFromString)
)
Schema.decodeSync(schema)("https://example.com/path").href // => "https://example.com/path"
```

## uint8ArrayFromBase64String

**Converting Base64 to a Uint8Array**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.Uint8Array, SchemaTransformation.uint8ArrayFromBase64String)
)
Array.from(Schema.decodeSync(schema)("AQID")) // => [1, 2, 3]
```

## stringFromBase64String

**Converting Base64 to a string**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.stringFromBase64String)
)
Schema.decodeSync(schema)("aGVsbG8=") // => "hello"
```

## stringFromBase64UrlString

**Converting Base64Url to a string**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.stringFromBase64UrlString)
)
Schema.decodeSync(schema)("aGVsbG8") // => "hello"
```

## stringFromHexString

**Converting hex to a string**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.stringFromHexString)
)
Schema.decodeSync(schema)("68656c6c6f") // => "hello"
```

## stringFromUriComponent

**Defining a URI component schema**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.stringFromUriComponent)
)
Schema.decodeSync(schema)("hello%20world") // => "hello world"
```

## fromJsonString

**Parsing JSON**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString())
)
Schema.decodeSync(schema)("{\"ok\":true}") // => { ok: true }
```

## fromFormData

**Decoding FormData**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.instanceOf(FormData).pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromFormData)
)
const formData = new FormData()
formData.append("user[name]", "Alice")
Schema.decodeSync(schema)(formData) // => { user: { name: "Alice" } }
```

## fromURLSearchParams

**Decoding URLSearchParams**

```efx
import { Schema, SchemaTransformation } from "effect"

const schema = Schema.instanceOf(URLSearchParams).pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromURLSearchParams)
)
Schema.decodeSync(schema)(new URLSearchParams("user[name]=Alice")) // => { user: { name: "Alice" } }
```
