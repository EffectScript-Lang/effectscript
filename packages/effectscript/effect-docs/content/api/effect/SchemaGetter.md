# effect/SchemaGetter

The examples in the JSDoc of `packages/effect/src/SchemaGetter.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## Getter

**Creating and composing getters**

```efx
const parseNumber = SchemaGetter.transform<number, string>((s) => Number(s))
const double = SchemaGetter.transform<number, number>((n) => n * 2)
const composed = SchemaGetter.compose(parseNumber, double)
runSync(SchemaGetter.run(composed, Option.some("21"), {})) // => Option.some(42)
```

## run

**Running a getter**

```efx
const getter = SchemaGetter.transform<number, string>(Number)

const result = runSync(
  SchemaGetter.run(getter, Option.some("42"), {})
)
result // => Option.some(42)
```

## compose

**Parsing and normalizing a number**

```efx
const getter = SchemaGetter.compose(
  SchemaGetter.transform<number, string>(Number),
  SchemaGetter.transform((n) => Math.max(0, n))
)

runSync(SchemaGetter.run(getter, Option.some("-1"), {})) // => Option.some(0)
```

## map

**Mapping a getter result**

```efx
const getter = SchemaGetter.transform<number, string>(Number).pipe(
  SchemaGetter.map((n) => n * 2)
)

runSync(SchemaGetter.run(getter, Option.some("21"), {})) // => Option.some(42)
```

## succeed

**Returning a constant getter**

```efx
const alwaysZero = SchemaGetter.succeed(0)
runSync(SchemaGetter.run(alwaysZero, Option.none(), {})) // => Option.some(0)
```

## fail

**Defining an always-failing getter**

```efx
const rejectAll = SchemaGetter.fail<string, string>(
  () => new SchemaIssue.InvalidValue({ message: "not allowed" })
)
const issue = await runPromise(
  flip(SchemaGetter.run(rejectAll, Option.some("x"), {}))
)
issue._tag // => "InvalidValue"
```

## forbidden

**Forbidding a decode direction**

```efx
const noEncode = SchemaGetter.forbidden<string, number>(
  () => "encoding is not supported"
)
const issue = await runPromise(
  flip(SchemaGetter.run(noEncode, Option.some(1), {}))
)
issue._tag // => "Forbidden"
```

## forbiddenEncoding

**Rejecting encoding**

```efx
const issue = await runPromise(
  flip(SchemaGetter.run(SchemaGetter.forbiddenEncoding, Option.some("value"), {}))
)
issue._tag // => "Forbidden"
```

## passthrough

**Passing through identity transformations**

```efx
import { Schema, SchemaGetter } from "effect"

// No transformation needed — types already match
const StringToString = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.passthrough()
  })
)
Schema.decodeSync(StringToString)("hello") // => "hello"
```

## passthroughSupertype

**Passing through supertypes**

```efx
// string extends string, so this is valid
const g = SchemaGetter.passthroughSupertype<string, string>()
runSync(SchemaGetter.run(g, Option.some("hello"), {})) // => Option.some("hello")
```

## passthroughSubtype

**Passing through subtypes**

```efx
// "hello" extends string, so E extends T
const g = SchemaGetter.passthroughSubtype<string, "hello">()
runSync(SchemaGetter.run(g, Option.some("hello"), {})) // => Option.some("hello")
```

## required

**Defining a required struct field**

```efx
const mustExist = SchemaGetter.required<string>()
const issue = await runPromise(
  flip(SchemaGetter.run(mustExist, Option.none(), {}))
)
issue._tag // => "MissingKey"
```

## checkEffect

**Validating effectfully**

```efx
const nonNegative = SchemaGetter.checkEffect<number>((n) =>
  succeed(n >= 0 ? undefined : "must be non-negative")
)
await runPromise(SchemaGetter.run(nonNegative, Option.some(1), {})) // => Option.some(1)
```

## transform

**Transforming strings to numbers**

```efx
import { Schema, SchemaGetter } from "effect"

const NumberFromString = Schema.String.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform((s) => Number(s)),
    encode: SchemaGetter.transform((n) => String(n))
  })
)
Schema.decodeSync(NumberFromString)("42") // => 42
```

## transformEffect

**Parsing with failure**

```efx
const safeParseInt = SchemaGetter.transformEffect<number, string>(
  (s, options) => {
    const n = parseInt(s, 10)
    return isNaN(n)
      ? fail(new SchemaIssue.InvalidValue({ message: "not an integer" }, s, options))
      : succeed(n)
  }
)
await runPromise(SchemaGetter.run(safeParseInt, Option.some("42"), {})) // => Option.some(42)
```

## transformOptional

**Filtering out empty strings**

```efx
const skipEmpty = SchemaGetter.transformOptional<string, string>((o) =>
  Option.filter(o, (s) => s.length > 0)
)
runSync(SchemaGetter.run(skipEmpty, Option.some(""), {})) // => Option.none()
```

## omit

**Omitting a field during encoding**

```efx
const omitField = SchemaGetter.omit<string>()
runSync(SchemaGetter.run(omitField, Option.some("hidden"), {})) // => Option.none()
```

## withDefault

**Providing a default value for an optional field**

```efx
const withZero = SchemaGetter.withDefault(succeed(0))
await runPromise(SchemaGetter.run(withZero, Option.some(undefined), {})) // => Option.some(0)
```

## String

**Coercing to a string**

```efx
const toString = SchemaGetter.String<number>()
runSync(SchemaGetter.run(toString, Option.some(42), {})) // => Option.some("42")
```

## Number

**Coercing to a number**

```efx
const toNumber = SchemaGetter.Number<string>()
runSync(SchemaGetter.run(toNumber, Option.some("42"), {})) // => Option.some(42)
```

## Boolean

**Coercing to a boolean**

```efx
const toBool = SchemaGetter.Boolean<string>()
runSync(SchemaGetter.run(toBool, Option.some("true"), {})) // => Option.some(true)
```

## BigInt

**Coercing to a bigint**

```efx
const toBigInt = SchemaGetter.BigInt<string>()
runSync(SchemaGetter.run(toBigInt, Option.some("42"), {})) // => Option.some(42n)
```

## Date

**Coercing to a Date**

```efx
const toDate = SchemaGetter.Date<string>()
const result = runSync(SchemaGetter.run(toDate, Option.some("1970-01-01"), {}))
Option.map(result, (date) => date.toISOString()) // => Option.some("1970-01-01T00:00:00.000Z")
```

## trim

**Trimming whitespace**

```efx
const trimmed = SchemaGetter.trim<string>()
runSync(SchemaGetter.run(trimmed, Option.some("  hello  "), {})) // => Option.some("hello")
```

## capitalize

**Capitalizing a string**

```efx
const cap = SchemaGetter.capitalize<string>()
runSync(SchemaGetter.run(cap, Option.some("hello"), {})) // => Option.some("Hello")
```

## uncapitalize

**Uncapitalizing a string**

```efx
const uncap = SchemaGetter.uncapitalize<string>()
runSync(SchemaGetter.run(uncap, Option.some("Hello"), {})) // => Option.some("hello")
```

## snakeToCamel

**Converting snake case to camel case**

```efx
const toCamel = SchemaGetter.snakeToCamel<string>()
runSync(SchemaGetter.run(toCamel, Option.some("user_name"), {})) // => Option.some("userName")
```

## camelToSnake

**Converting camel case to snake case**

```efx
const toSnake = SchemaGetter.camelToSnake<string>()
runSync(SchemaGetter.run(toSnake, Option.some("userName"), {})) // => Option.some("user_name")
```

## toLowerCase

**Converting to lowercase**

```efx
const lower = SchemaGetter.toLowerCase<string>()
runSync(SchemaGetter.run(lower, Option.some("HELLO"), {})) // => Option.some("hello")
```

## toUpperCase

**Converting to uppercase**

```efx
const upper = SchemaGetter.toUpperCase<string>()
runSync(SchemaGetter.run(upper, Option.some("hello"), {})) // => Option.some("HELLO")
```

## parseJson

**Parsing JSON**

```efx
const parse = SchemaGetter.parseJson<string>()
const result = await runPromise(SchemaGetter.run(parse, Option.some("{\"a\":1}"), {}))
result // => Option.some({ a: 1 })
```

## stringifyJson

**Stringifying JSON**

```efx
const stringify = SchemaGetter.stringifyJson()
const result = await runPromise(SchemaGetter.run(stringify, Option.some({ a: 1 }), {}))
result // => Option.some("{\"a\":1}")
```

## splitKeyValue

**Parsing a key-value string**

```efx
const parse = SchemaGetter.splitKeyValue<string>()
const result = runSync(SchemaGetter.run(parse, Option.some("a=1,b=2"), {}))
result // => Option.some({ a: "1", b: "2" })
```

## joinKeyValue

**Joining key-value records**

```efx
const join = SchemaGetter.joinKeyValue()
const result = runSync(SchemaGetter.run(join, Option.some({ a: "1", b: "2" }), {}))
result // => Option.some("a=1,b=2")
```

## split

**Splitting a comma-separated string**

```efx
const splitComma = SchemaGetter.split<string>()
const result = runSync(SchemaGetter.run(splitComma, Option.some("a,b,c"), {}))
result // => Option.some(["a", "b", "c"])
```

## encodeBase64

**Encoding to Base64**

```efx
const encode = SchemaGetter.encodeBase64<Uint8Array>()
const result = runSync(SchemaGetter.run(encode, Option.some(new Uint8Array([1, 2, 3])), {}))
result // => Option.some("AQID")
```

## encodeBase64Url

**Encoding to Base64Url**

```efx
const encode = SchemaGetter.encodeBase64Url<Uint8Array>()
const result = runSync(SchemaGetter.run(encode, Option.some(new Uint8Array([251, 255])), {}))
result // => Option.some("-_8")
```

## encodeHex

**Encoding to hex**

```efx
const encode = SchemaGetter.encodeHex<Uint8Array>()
const result = runSync(SchemaGetter.run(encode, Option.some(new Uint8Array([1, 2, 3])), {}))
result // => Option.some("010203")
```

## decodeBase64

**Decoding Base64 to bytes**

```efx
const decode = SchemaGetter.decodeBase64<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("AQID"), {}))
Option.map(result, Array.from) // => Option.some([1, 2, 3])
```

## decodeBase64String

**Decoding Base64 to string**

```efx
const decode = SchemaGetter.decodeBase64String<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("aGVsbG8="), {}))
result // => Option.some("hello")
```

## decodeBase64Url

**Decoding Base64Url to bytes**

```efx
const decode = SchemaGetter.decodeBase64Url<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("-_8="), {}))
Option.map(result, Array.from) // => Option.some([251, 255])
```

## decodeBase64UrlString

**Decoding Base64Url to string**

```efx
const decode = SchemaGetter.decodeBase64UrlString<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("aGVsbG8"), {}))
result // => Option.some("hello")
```

## decodeHex

**Decoding hex to bytes**

```efx
const decode = SchemaGetter.decodeHex<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("010203"), {}))
Option.map(result, Array.from) // => Option.some([1, 2, 3])
```

## decodeHexString

**Decoding hex to string**

```efx
const decode = SchemaGetter.decodeHexString<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("68656c6c6f"), {}))
result // => Option.some("hello")
```

## encodeUriComponent

**Encoding a URI component**

```efx
const encode = SchemaGetter.encodeUriComponent<string>()
const result = runSync(SchemaGetter.run(encode, Option.some("hello world"), {}))
result // => Option.some("hello%20world")
```

## decodeUriComponent

**Decoding a URI component**

```efx
const decode = SchemaGetter.decodeUriComponent<string>()
const result = await runPromise(SchemaGetter.run(decode, Option.some("hello%20world"), {}))
result // => Option.some("hello world")
```

## dateTimeUtcFromInput

**Parsing DateTime**

```efx
const parseDate = SchemaGetter.dateTimeUtcFromInput<string>()
const result = await runPromise(
  SchemaGetter.run(parseDate, Option.some("2024-01-01T00:00:00Z"), {})
)
Option.map(result, DateTime.toEpochMillis) // => Option.some(1704067200000)
```

## decodeFormData

**Decoding FormData**

```efx
const decode = SchemaGetter.decodeFormData()
const formData = new FormData()
formData.append("user[name]", "Alice")
const result = runSync(SchemaGetter.run(decode, Option.some(formData), {}))
result // => Option.some({ user: { name: "Alice" } })
```

## encodeFormData

**Encoding to FormData**

```efx
const encode = SchemaGetter.encodeFormData()
const result = runSync(SchemaGetter.run(encode, Option.some({ name: "Alice" }), {}))
Option.map(result, (formData) => formData.get("name")) // => Option.some("Alice")
```

## decodeURLSearchParams

**Decoding URLSearchParams**

```efx
const decode = SchemaGetter.decodeURLSearchParams()
const params = new URLSearchParams("user[name]=Alice")
const result = runSync(SchemaGetter.run(decode, Option.some(params), {}))
result // => Option.some({ user: { name: "Alice" } })
```

## encodeURLSearchParams

**Encoding to URLSearchParams**

```efx
const encode = SchemaGetter.encodeURLSearchParams()
const result = runSync(SchemaGetter.run(encode, Option.some({ name: "Alice" }), {}))
Option.map(result, (params) => params.toString()) // => Option.some("name=Alice")
```

## makeTreeRecord

**Building a tree from bracket paths**

```efx
import { SchemaGetter } from "effect"

SchemaGetter.makeTreeRecord([
  ["user[name]", "Alice"],
  ["user[tags][]", "admin"],
  ["user[tags][]", "editor"]
]) // => { user: { name: "Alice", tags: ["admin", "editor"] } }
```

## collectBracketPathEntries

**Flattening an object to bracket paths**

```efx
import { Predicate, SchemaGetter } from "effect"

const collectStrings = SchemaGetter.collectBracketPathEntries(Predicate.isString)
const entries = collectStrings({ user: { name: "Alice", tags: ["admin", "editor"] } })

entries // => [["user[name]", "Alice"], ["user[tags]", "admin"], ["user[tags]", "editor"]]
```
