# effect/Schema

The examples in the JSDoc of `packages/effect/src/Schema.ts`, in EffectScript (ADR-0050).

> **EffectScript edition.** The code blocks marked `efx` are Effect's own examples, converted by
> the EffectScript reverse compiler; each one compiles back to the original TypeScript. Blocks
> left as `ts` are kept as written (v3 code, or code that doesn't parse or round-trip). The prose
> is Effect's and names the TypeScript forms. In EffectScript, imports from `effect` are
> implicit and `Effect.x(…)` is written `x(…)`; `Effect.gen(function*() { … })` is
> `effect { … }`, `Effect.fn("f")(function*(…) { … })` is `effect f(…) { … }`, `yield*` is
> `await`, `return yield* Effect.fail(e)` is `throw e`, `Effect.log(…)` is `console.log(…)` inside
> `effect` code, and where re-sugared, `x.pipe(f, g)` is `x |> f |> g`.

## declareConstructor

**Schema for a parametric `Box<A>` type**

```efx
interface Box<A> {
  readonly value: A
}

const isBox = (u: unknown): u is Box<unknown> =>
  typeof u === "object" && u !== null && "value" in u

const Box = <A extends Schema.Constraint>(item: A) =>
  Schema.declareConstructor<Box<A["Type"]>, Box<A["Encoded"]>>()(
    [item],
    ([itemCodec]) =>
      (u, ast, options) => {
        if (!isBox(u)) {
          return fail(new SchemaIssue.InvalidType(ast, u, options))
        }
        return map(
          SchemaParser.decodeUnknownEffect(itemCodec)(u.value, options),
          (value) => ({ value })
        )
      }
  )

const schema = Box(Schema.Number)
runSync(Schema.decodeUnknownEffect(schema)({ value: 1 })) // => { value: 1 }
```

## declare

**Defining a schema for a custom `UserId` branded type**

```efx
import { Schema } from "effect"

type UserId = string & { readonly _tag: "UserId" }

const isUserId = (u: unknown): u is UserId =>
  typeof u === "string" && u.startsWith("user_")

const UserId = Schema.declare<UserId>(isUserId, {
  title: "UserId",
  description: "A user identifier starting with 'user_'"
})
Schema.decodeUnknownSync(UserId)("user_123") // => "user_123"
```

## revealBottom

**Inspecting all type parameters of a schema**

```efx
import { Schema } from "effect"

const schema = Schema.String

// Widen to Bottom to access all 14 type parameters
const bottom = Schema.revealBottom(schema)

// `bottom` now exposes Type, Encoded, DecodingServices, EncodingServices,
// ast, Rebuild, ~type.make.in, Iso, ~type.parameters, etc.
type T = typeof bottom["Type"]     // string
type E = typeof bottom["Encoded"]  // string
```

## annotate

**Adding a title and description**

```efx
import { Schema } from "effect"

const Age = Schema.Natural.pipe(
  Schema.annotate({
    title: "Age",
    description: "A non-negative integer representing age in years"
  })
)
Schema.resolveAnnotations(Age)?.title // => "Age"
```

## annotateEncoded

**Adding a title to the encoded representation**

```efx
import { Schema } from "effect"

const schema = Schema.NumberFromString.pipe(
  Schema.annotateEncoded({
    title: "my title"
  })
)

Schema.toEncoded(schema).ast.annotations?.title // => "my title"
```

## annotateKey

**Customizing the missing-key message for a required field**

```efx
import { Schema } from "effect"

const schema = Schema.Struct({
  username: Schema.String.pipe(
    Schema.annotateKey({
      description: "The username used to log in",
      messageMissingKey: "Username is required"
    })
  )
})
schema.fields.username.ast.context?.annotations?.messageMissingKey // => "Username is required"
```

## Schema.Type

**Extracting the decoded type**

```efx
import { Schema } from "effect"

const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
type Person = Schema.Schema.Type<typeof Person>
// { readonly name: string; readonly age: number }
```

## Schema

**Accepting any schema decoding to `string`**

```efx
import { Schema } from "effect"

const accept = (_schema: Schema.Schema<string>): void => {}

accept(Schema.String)
accept(Schema.NonEmptyString)
```

## Codec.Encoded

**Extracting the encoded type**

```efx
import { Schema } from "effect"

const schema = Schema.NumberFromString
type Enc = Schema.Codec.Encoded<typeof schema>
// string
```

## Codec.DecodingServices

**Checking decoding service requirements**

```efx
import { Schema } from "effect"

const schema = Schema.String
type RD = Schema.Codec.DecodingServices<typeof schema>
// never
```

## Codec.EncodingServices

**Checking encoding service requirements**

```efx
import { Schema } from "effect"

const schema = Schema.String
type RE = Schema.Codec.EncodingServices<typeof schema>
// never
```

## Codec

**Accepting a codec that decodes to `number` from `string`**

```efx
import { Schema } from "effect"

const serialize = <T>(codec: Schema.Codec<T, string>, value: T): string =>
  Schema.encodeSync(codec)(value)

serialize(Schema.NumberFromString, 42) // => "42"
```

## revealCodec

**Recovering encoded type from a schema variable**

```efx
import { Schema } from "effect"

const schema: Schema.Schema<number> = Schema.NumberFromString

// Without revealCodec, Encoded is unknown
const codec = Schema.revealCodec(schema)
type Enc = typeof codec["Encoded"] // string
```

## SchemaError

**Inspecting a SchemaError**

```efx
import { Result, Schema } from "effect"

const result = Schema.decodeUnknownResult(Schema.Number)("not a number")
const message = Result.isFailure(result) ? result.failure.message : ""
message // => "Expected number"
```

## isSchemaError

**Narrowing Schema errors**

```efx
import { Result, Schema } from "effect"

const result = Result.try(() => Schema.decodeUnknownSync(Schema.Number)("oops"))
const error: unknown = Result.isFailure(result) ? result.failure : undefined
Schema.isSchemaError(error) // => true
```

## toStandardSchemaV1

**Creating a standard schema from a regular schema**

```efx
import { Schema } from "effect"

// Define custom hook functions for error formatting
const leafHook = (issue: any) => {
  switch (issue._tag) {
    case "InvalidType":
      return "Expected different type"
    case "InvalidValue":
      return "Invalid value provided"
    case "MissingKey":
      return "Required property missing"
    case "UnexpectedKey":
      return "Unexpected property found"
    case "Forbidden":
      return "Operation not allowed"
    case "OneOf":
      return "Multiple valid options available"
    default:
      return "Validation error"
  }
}

// Create a standard schema from a regular schema
const PersonSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  age: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 150 }))
})

const standardSchema = Schema.toStandardSchemaV1(PersonSchema, {
  leafHook
})

// The standard schema can be used with any Standard Schema v1 compatible library
const validResult = standardSchema["~standard"].validate({
  name: "Alice",
  age: 30
})
const invalidResult = standardSchema["~standard"].validate({
  name: "",
  age: 200
})

if (validResult instanceof Promise || invalidResult instanceof Promise) {
  throw new Error("Expected synchronous validation")
}
if ("value" in validResult) {
  validResult.value // => { name: "Alice", age: 30 }
}
invalidResult.issues?.map((issue) => issue.path) // => [["name"], ["age"]]
```

## is

**Defining a basic type guard**

```efx
import { Schema } from "effect"

const isString = Schema.is(Schema.String)

isString("hello") // => true
isString(42) // => false

// Type narrowing in action
const value: unknown = "hello"
if (isString(value)) {
  // value is now typed as string
  value.toUpperCase() // => "HELLO"
}
```

## asserts

**Asserting and narrowing an input**

```efx
import { Schema, SchemaIssue } from "effect"

const input: unknown = "hello"

// This will pass silently (no return value) and narrow input to string
Schema.asserts(Schema.String, input)
input.toUpperCase() // => "HELLO"

// This will throw an error
try {
  const invalid: unknown = 123
  Schema.asserts(Schema.String, invalid)
} catch (error) {
  if (error instanceof Error) {
    SchemaIssue.isIssue(error.cause) // => true
  }
}
```

## decodeUnknownSync

**Decoding with a transformation schema**

```efx
import { Schema } from "effect"

const NumberFromString = Schema.NumberFromString

Schema.decodeUnknownSync(NumberFromString)("42") // => 42
```

## encodeUnknownEffect

**Encoding a value to a string**

```efx
const NumberFromString = Schema.NumberFromString

await runPromise(Schema.encodeUnknownEffect(NumberFromString)(42)) // => "42"
```

## optionalKey

**Creating a struct with optional key**

```efx
import { Schema } from "effect"

const schema = Schema.Struct({
  name: Schema.String,
  age: Schema.optionalKey(Schema.Number)
})

// Type: { readonly name: string; readonly age?: number }
type Person = typeof schema["Type"]
```

## optional

**Defining an optional field accepting undefined**

```efx
import { Schema } from "effect"

const schema = Schema.Struct({
  name: Schema.String,
  age: Schema.optional(Schema.Number)
})

// { readonly name: string; readonly age?: number | undefined }
type Person = typeof schema.Type
```

## flip

**Flipping a number-from-string schema**

```efx
import { Schema } from "effect"

// NumberFromString: decodes string → number
const flipped = Schema.flip(Schema.NumberFromString)
Schema.decodeSync(flipped)(42) // => "42"
```

## Literal

**Defining a string literal**

```efx
import { Schema } from "effect"

const schema = Schema.Literal("hello")
// Type: Schema.Literal<"hello">
Schema.decodeSync(schema)("hello") // => "hello"
```

## TemplateLiteral

**Defining a URL path pattern**

```efx
import { Schema } from "effect"

const schema = Schema.TemplateLiteral(["/user/", Schema.Number])
Schema.is(schema)("/user/123") // => true
```

## TemplateLiteralParser

**Parsing path parameters**

```efx
import { Schema } from "effect"

const schema = Schema.TemplateLiteralParser(["/user/", Schema.NumberFromString])
Schema.decodeSync(schema)("/user/42") // => ["/user/", 42]
```

## Enum

**Defining a direction enum**

```efx
import { Schema } from "effect"

enum Direction {
  Up = "Up",
  Down = "Down"
}

const schema = Schema.Enum(Direction)
Schema.decodeSync(schema)(Direction.Up) // => "Up"
```

## StringForLiteralAutocomplete

**Suggesting known HTTP methods**

```efx
import { Schema } from "effect"

const Method = Schema.Union([
  Schema.StringForLiteralAutocomplete,
  Schema.Literals(["GET", "POST"])
])

// Type: "GET" | "POST" | (string & {})
Method.make("PATCH") // => "PATCH"
Method.members[1].literals // => ["GET", "POST"]
```

## UniqueSymbol

**Defining a specific symbol**

```efx
import { Schema } from "effect"

const mySymbol = Symbol.for("mySymbol")
const schema = Schema.UniqueSymbol(mySymbol)
Schema.decodeSync(schema)(mySymbol) === mySymbol // => true
```

## Struct.fields

**Reusing fields across structs**

```efx
import { Schema } from "effect"

const Timestamped = Schema.Struct({
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})

const User = Schema.Struct({
  ...Timestamped.fields,
  name: Schema.String,
  email: Schema.String
})
Object.keys(User.fields) // => ["createdAt", "updatedAt", "name", "email"]
```

## Struct

**Defining a basic struct**

```efx
import { Schema } from "effect"

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.optionalKey(Schema.String)
})

// { readonly name: string; readonly age: number; readonly email?: string }
type Person = typeof Person.Type

Schema.decodeUnknownSync(Person)({ name: "Alice", age: 30 }) // => { name: "Alice", age: 30 }
```

## fieldsAssign

**Adding fields to a union of structs**

```efx
import { Schema, Tuple } from "effect"

// Add a new field to all members of a union of structs
const schema = Schema.Union([
  Schema.Struct({ a: Schema.String }),
  Schema.Struct({ b: Schema.Number })
]).mapMembers(Tuple.map(Schema.fieldsAssign({ c: Schema.Number })))
Schema.decodeSync(schema)({ a: "a", c: 1 }) // => { a: "a", c: 1 }
```

## encodeKeys

**Renaming `name` to `full_name` in the encoded form**

```efx
import { Schema } from "effect"

const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
const Encoded = Person.pipe(Schema.encodeKeys({ name: "full_name" }))

// Decodes { full_name: "Alice", age: 30 } → { name: "Alice", age: 30 }
Schema.decodeUnknownSync(Encoded)({ full_name: "Alice", age: 30 }) // => { name: "Alice", age: 30 }
```

## extendTo

**Adding a computed `fullName` field**

```efx
import { Option, Schema } from "effect"

const Person = Schema.Struct({ first: Schema.String, last: Schema.String })
const Extended = Person.pipe(
  Schema.extendTo(
    { fullName: Schema.String },
    { fullName: (p) => Option.some(`${p.first} ${p.last}`) }
  )
)

const alice = Schema.decodeUnknownSync(Extended)({ first: "Alice", last: "Smith" })
alice.fullName // => "Alice Smith"
```

## Record

**Defining a string-keyed record of numbers**

```efx
import { Schema } from "effect"

const schema = Schema.Record(Schema.String, Schema.Number)

// { readonly [x: string]: number }
type R = typeof schema.Type

Schema.decodeUnknownSync(schema)({ a: 1, b: 2 }) // => { a: 1, b: 2 }
```

## StructWithRest.ValidateRecords

**Checking record compatibility**

```efx
import { Schema } from "effect"

const user = Schema.Struct({ id: Schema.String })
const stringExtras = [Schema.Record(Schema.String, Schema.String)] as const

type UserCheck = Schema.StructWithRest.ValidateRecords<typeof user, typeof stringExtras>

const userCheck: UserCheck = true
void userCheck

const counter = Schema.Struct({ count: Schema.NumberFromString })

type CounterCheck = Schema.StructWithRest.ValidateRecords<typeof counter, typeof stringExtras>
//    ^? { "incompatible index signatures": "count" }

const counterCheck = null as unknown as CounterCheck
void counterCheck
```

## StructWithRest

**Defining structs with string-indexed extra keys**

```efx
import { Schema } from "effect"

const schema = Schema.StructWithRest(
  Schema.Struct({ id: Schema.Number }),
  [Schema.Record(Schema.String, Schema.Number)]
)

// { readonly id: number, readonly [x: string]: number }
type T = typeof schema.Type
```

## Tuple

**Defining a pair of string and number**

```efx
import { Schema } from "effect"

const schema = Schema.Tuple([Schema.String, Schema.Number])

Schema.decodeUnknownSync(schema)(["hello", 42]) // => ["hello", 42]
```

## TupleWithRest

**Defining tuples with rest elements**

```efx
import { Schema } from "effect"

// [string, number, ...boolean[]]
const schema = Schema.TupleWithRest(
  Schema.Tuple([Schema.String, Schema.Number]),
  [Schema.Boolean]
)

Schema.decodeUnknownSync(schema)(["hello", 1, true, false]) // => ["hello", 1, true, false]
```

## Array

**Defining an array of strings**

```efx
import { Schema } from "effect"

const schema = Schema.Array(Schema.String)

Schema.decodeUnknownSync(schema)(["a", "b", "c"]) // => ["a", "b", "c"]
```

## NonEmptyArray

**Defining a non-empty array of numbers**

```efx
import { Schema } from "effect"

const schema = Schema.NonEmptyArray(Schema.Number)

Schema.decodeUnknownSync(schema)([1, 2, 3]) // => [1, 2, 3]
```

## mutable

**Defining mutable arrays**

```efx
import { Schema } from "effect"

const schema = Schema.mutable(Schema.Array(Schema.Number))

// number[]   (mutable)
type T = typeof schema.Type
const value: T = [1, 2]
value.push(3)
value // => [1, 2, 3]
```

## Union

**Defining a string or number union**

```efx
import { Schema } from "effect"

const schema = Schema.Union([Schema.String, Schema.Number])

Schema.decodeUnknownSync(schema)("hello") // => "hello"
Schema.decodeUnknownSync(schema)(42) // => 42
```

## Literals

**Defining status codes**

```efx
import { Schema } from "effect"

const schema = Schema.Literals(["active", "inactive", "pending"])
Schema.decodeSync(schema)("active") // => "active"
```

## suspend

**Defining recursive tree schemas**

```efx
import { Schema } from "effect"

interface Tree {
  readonly value: number
  readonly children: ReadonlyArray<Tree>
}

const Tree = Schema.Struct({
  value: Schema.Number,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => Tree))
})
Schema.decodeSync(Tree)({ value: 1, children: [] }) // => { value: 1, children: [] }
```

## check

**Adding checks to a schema**

```efx
import { Schema } from "effect"

const AgeSchema = Schema.Finite.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(120))
)
Schema.is(AgeSchema)(42) // => true
Schema.is(AgeSchema)(121) // => false
```

## middlewareDecoding

**Logging decode failures**

```efx
const events: Array<string> = []
const Logged = Schema.String.pipe(
  Schema.middlewareDecoding((effect) =>
    tapError(effect, () => sync(() => events.push("decode failed")))
  )
)
runSync(result(Schema.decodeUnknownEffect(Logged)(42)))
events // => ["decode failed"]
```

## middlewareEncoding

**Logging encode failures**

```efx
const events: Array<string> = []
const Logged = Schema.String.pipe(
  Schema.middlewareEncoding((effect) =>
    tapError(effect, () => sync(() => events.push("encode failed")))
  )
)
runSync(result(Schema.encodeUnknownEffect(Logged)(42)))
events // => ["encode failed"]
```

## catchDecoding

**Returning a default on decode failure**

```efx
const schema = Schema.Number.pipe(
  Schema.catchDecoding((_issue) => succeed(Option.some(0)))
)
runSync(Schema.decodeUnknownEffect(schema)("invalid")) // => 0
```

## decodeTo

**Transforming strings to numbers with a schema transformation**

```efx
import { Schema, SchemaGetter } from "effect"

const NumberFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    {
      decode: SchemaGetter.transform((s) => Number(s)),
      encode: SchemaGetter.transform((n) => String(n))
    }
  )
)

Schema.decodeUnknownSync(NumberFromString)("123") // => 123
```

## decode

**Trimming string values during encoding/decoding**

```efx
import { Schema, SchemaGetter } from "effect"

const Trimmed = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.transform((s) => s.trim()),
    encode: SchemaGetter.transform((s) => s.trim())
  })
)

Schema.decodeUnknownSync(Trimmed)("  hello  ") // => "hello"
```

## encodeTo

**Encoding a number back to a string**

```efx
import { Schema, SchemaGetter } from "effect"

const NumberFromString = Schema.Number.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((s: string) => Number(s)),
    encode: SchemaGetter.transform((n: number) => String(n))
  })
)
Schema.decodeSync(NumberFromString)("42") // => 42
```

## encode

**Upper-casing encoded strings**

```efx
import { Schema, SchemaGetter } from "effect"

const UpperFromLower = Schema.String.pipe(
  Schema.encode({
    decode: SchemaGetter.transform((s: string) => s.toLowerCase()),
    encode: SchemaGetter.transform((s: string) => s.toUpperCase())
  })
)
Schema.encodeSync(UpperFromLower)("hello") // => "HELLO"
```

## withConstructorDefault

**Defining an optional field with a static default**

```efx
const MySchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(succeed("anonymous"))
  )
})

MySchema.make({}).name // => "anonymous"
```

## withDecodingDefaultKey

**Providing a default for a missing struct key**

```efx
const MySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.withDecodingDefaultKey(succeed("anonymous")))
})

Schema.decodeUnknownSync(MySchema)({}).name // => "anonymous"
```

## withDecodingDefault

**Providing a default for an optional field value**

```efx
const MySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.optional, Schema.withDecodingDefault(succeed("anonymous")))
})

Schema.decodeUnknownSync(MySchema)({ name: undefined }).name // => "anonymous"
```

## tag

**Defining a discriminated union tag**

```efx
import { Schema } from "effect"

const A = Schema.Struct({ _tag: Schema.tag("A"), value: Schema.Number })

// _tag is optional in make, auto-filled to "A"
const a = A.make({ value: 42 })
a // => { _tag: "A", value: 42 }
```

## tagDefaultOmit

**Omitting tags during encoding**

```efx
import { Schema } from "effect"

const A = Schema.Struct({
  _tag: Schema.tagDefaultOmit("A"),
  value: Schema.Number
})

// Encode strips the _tag field
Schema.encodeUnknownSync(A)({ _tag: "A", value: 1 }) // => { value: 1 }
```

## TaggedStruct

**Defining a tagged struct shorthand**

```efx
import { Schema } from "effect"

// Defines a struct with a fixed `_tag` field
const tagged = Schema.TaggedStruct("A", {
  a: Schema.String
})

// This is the same as writing:
const equivalent = Schema.Struct({
  _tag: Schema.tag("A"),
  a: Schema.String
})
void tagged
void equivalent
```

**Accessing the literal value of the tag**

```efx
import { Schema } from "effect"

const tagged = Schema.TaggedStruct("A", {
  a: Schema.String
})

tagged.fields._tag.schema.literal // => "A"
```

## toTaggedUnion

**Adding tagged-union utilities to an existing union**

```efx
import { Schema } from "effect"

const A = Schema.TaggedStruct("A", { value: Schema.Number })
const B = Schema.TaggedStruct("B", { name: Schema.String })

const MyUnion = Schema.Union([A, B]).pipe(Schema.toTaggedUnion("_tag"))

// Pattern-match on the union
const result = MyUnion.match({ _tag: "A", value: 1 }, {
  A: (a) => `number: ${a.value}`,
  B: (b) => `name: ${b.name}`
})
result // => "number: 1"
```

## TaggedUnion

**Pattern matching a discriminated union**

```efx
import { Schema } from "effect"

const Shape = Schema.TaggedUnion({
  Circle: { radius: Schema.Number },
  Rectangle: { width: Schema.Number, height: Schema.Number }
})

// Pattern-match on a decoded value
const area = Shape.match({ _tag: "Circle", radius: 5 }, {
  Circle: (c) => Math.PI * c.radius ** 2,
  Rectangle: (r) => r.width * r.height
})
Math.round(area * 100) / 100 // => 78.54
```

## Opaque

**Defining opaque structs**

```efx
import { Schema } from "effect"

class Person extends Schema.Opaque<Person>()(
  Schema.Struct({
    name: Schema.String
  })
) {}

// Decoded value is Person, not { name: string }
const person = Schema.decodeUnknownSync(Person)({ name: "Alice" })
person.name // => "Alice"
```

## instanceOf

**Defining a schema for a built-in class**

```efx
import { Schema } from "effect"

const DateSchema = Schema.instanceOf(Date)

const decoded = Schema.decodeUnknownSync(DateSchema)(new Date("2024-01-01"))
decoded.toISOString() // => "2024-01-01T00:00:00.000Z"
```

## makeFilter

**Reporting failure at a nested path**

```efx
import { Result, Schema } from "effect"

const schema = Schema.Struct({ password: Schema.String, confirmPassword: Schema.String }).check(
  Schema.makeFilter((o) =>
    o.password === o.confirmPassword
      ? undefined
      : { path: ["password"], issue: "password and confirmPassword must match" }
  )
)

const result = Schema.decodeUnknownResult(schema)({ password: "123456", confirmPassword: "1234567" })
if (Result.isFailure(result) && result.failure.issue._tag === "Filter" && result.failure.issue.issue._tag === "Pointer") {
  result.failure.issue.issue.path // => ["password"]
}
```

**Reporting multiple failures at once**

```efx
import { Result, Schema } from "effect"

const schema = Schema.Struct({ a: Schema.Finite, b: Schema.Finite, c: Schema.Finite }).check(
  Schema.makeFilter((o) => {
    const issues: Array<Schema.FilterIssue> = []
    if (o.a > 0) {
      if (o.b <= 0) issues.push({ path: ["b"], issue: "b must be greater than 0" })
      if (o.c <= 0) issues.push({ path: ["c"], issue: "c must be greater than 0" })
    }
    return issues
  })
)

const result = Schema.decodeUnknownResult(schema)({ a: 1, b: 0, c: 0 })
if (Result.isFailure(result) && result.failure.issue._tag === "Filter" && result.failure.issue.issue._tag === "Composite") {
  result.failure.issue.issue.issues.map((issue) => issue._tag === "Pointer" ? issue.path : []) // => [["b"], ["c"]]
}
```

## isMinLength

**Checking minimum length**

```efx
import { Schema } from "effect"

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1))
const NonEmptyArraySchema = Schema.Array(Schema.Number).check(Schema.isMinLength(1))
Schema.is(NonEmptyStringSchema)("a") // => true
Schema.is(NonEmptyArraySchema)([1]) // => true
```

## Date

**Defining a Date schema**

```efx
import { Schema } from "effect"

const date = Schema.decodeUnknownSync(Schema.Date)(new Date("2024-01-01"))
date.toISOString() // => "2024-01-01T00:00:00.000Z"
```

## fromJsonString

**Formatting encoded JSON**

```efx
import { Schema } from "effect"

const schema = Schema.Struct({ a: Schema.Number })
const schemaFromJsonString = Schema.fromJsonString(schema, { space: 2 })

Schema.encodeSync(schemaFromJsonString)({ a: 1 }) // => "{\n  \"a\": 1\n}"
```

## fromFormData

**Decoding a flat structure**

```efx
import { Schema } from "effect"

const schema = Schema.fromFormData(
  Schema.Struct({
    a: Schema.String
  })
)

const formData = new FormData()
formData.append("a", "1")
formData.append("b", "2")

Schema.decodeUnknownSync(schema)(formData) // => { a: "1" }
```

**Decoding nested fields**

```efx
import { Schema } from "effect"

const schema = Schema.fromFormData(
  Schema.Struct({
    a: Schema.String,
    b: Schema.Struct({
      c: Schema.String,
      d: Schema.String
    })
  })
)

const formData = new FormData()
formData.append("a", "1")
formData.append("b[c]", "2")
formData.append("b[d]", "3")

Schema.decodeUnknownSync(schema)(formData) // => { a: "1", b: { c: "2", d: "3" } }
```

**Parsing non-string values**

```efx
import { Schema } from "effect"

const schema = Schema.fromFormData(
  Schema.toCodecStringTree(
    Schema.Struct({
      a: Schema.Int
    })
  )
)

const formData = new FormData()
formData.append("a", "1")

Schema.decodeUnknownSync(schema)(formData) // => { a: 1 }
```

## fromURLSearchParams

**Decoding a flat structure**

```efx
import { Schema } from "effect"

const schema = Schema.fromURLSearchParams(
  Schema.Struct({
    a: Schema.String
  })
)

const urlSearchParams = new URLSearchParams("a=1&b=2")

Schema.decodeUnknownSync(schema)(urlSearchParams) // => { a: "1" }
```

**Decoding nested fields**

```efx
import { Schema } from "effect"

const schema = Schema.fromURLSearchParams(
  Schema.Struct({
    a: Schema.String,
    b: Schema.Struct({
      c: Schema.String,
      d: Schema.String
    })
  })
)

const urlSearchParams = new URLSearchParams("a=1&b[c]=2&b[d]=3")

Schema.decodeUnknownSync(schema)(urlSearchParams) // => { a: "1", b: { c: "2", d: "3" } }
```

**Parsing non-string values**

```efx
import { Schema } from "effect"

const schema = Schema.fromURLSearchParams(
  Schema.toCodecStringTree(
    Schema.Struct({
      a: Schema.Int
    })
  )
)

const urlSearchParams = new URLSearchParams("a=1&b=2")

Schema.decodeUnknownSync(schema)(urlSearchParams) // => { a: 1 }
```

## StringFromUriComponent

**Decoding URI component strings**

```efx
import { Schema } from "effect"

const PaginationSchema = Schema.Struct({
  maxItemPerPage: Schema.Number,
  page: Schema.Number
})

const UrlSchema = Schema.StringFromUriComponent.pipe(
  Schema.decodeTo(Schema.fromJsonString(PaginationSchema))
)

Schema.encodeSync(UrlSchema)({ maxItemPerPage: 10, page: 1 }) // => "%7B%22maxItemPerPage%22%3A10%2C%22page%22%3A1%7D"
```

## IpMulticastAddressFromString

**Decoding a validated multicast address**

```efx
import { assert } from "@effect/vitest"
import { Schema } from "effect"
import { NetAddress } from "effect/net"

const address = Schema.decodeUnknownSync(Schema.IpMulticastAddressFromString)("239.255.0.1")
assert.isTrue(NetAddress.isMulticast(address))
```

## Duration

**Defining a Duration schema**

```efx
import { Duration, Schema } from "effect"

Schema.decodeUnknownSync(Schema.Duration)(Duration.seconds(5)) // => Duration.seconds(5)
```

## Graph

**Encoding a directed graph as JSON**

```efx
import { Graph, Schema } from "effect"

const codec = Schema.toCodecJson(Schema.Graph("directed", Schema.String, Schema.Number))
const graph = Graph.directed<string, number>((mutable) => {
  const source = Graph.addNode(mutable, "A")
  const target = Graph.addNode(mutable, "B")
  Graph.addEdge(mutable, source, target, 1)
})

const encoded = Schema.encodeSync(codec)(graph)

encoded.type // => "directed"
encoded.nodes // => [{ index: 0, data: "A" }, { index: 1, data: "B" }]
encoded.edges // => [{ index: 0, source: 0, target: 1, data: 1 }]
```

## JsonFromUrlParamsField

**Decoding a JSON parameter field**

```efx
import { Schema } from "effect"
import { UrlParams } from "effect/http"

const extractFoo = Schema.JsonFromUrlParamsField("foo").pipe(
  Schema.decodeTo(Schema.Struct({
    some: Schema.String,
    number: Schema.Number
  }))
)

const decoded = Schema.decodeSync(extractFoo)(UrlParams.fromInput({
  foo: `{"some":"bar","number":42}`,
  baz: "qux"
}))
const result = [decoded.some, decoded.number] // => ["bar", 42]
```

## RecordFromUrlParams

**Decoding URL parameters to a record**

```efx
import { Schema } from "effect"
import { UrlParams } from "effect/http"

const toStruct = Schema.RecordFromUrlParams.pipe(
  Schema.decodeTo(Schema.Struct({
    some: Schema.String,
    number: Schema.FiniteFromString
  }))
)

const decoded = Schema.decodeSync(toStruct)(UrlParams.fromInput({
  some: "value",
  number: 42
}))
const result = [decoded.some, decoded.number] // => ["value", 42]
```

## Class

**Defining a basic class**

```efx
schema Person {
  name: string
  age: number
}

const alice = new Person({ name: "Alice", age: 30 })
alice.name // => "Alice"
String(alice) // => "Person({\"name\":\"Alice\",\"age\":30})"
```

**Extending a class**

```efx
schema Animal {
  name: string
}

class Dog extends Animal.extend<Dog>("Dog")({
  breed: Schema.String
}) {}

const dog = new Dog({ name: "Rex", breed: "Labrador" })
dog.name // => "Rex"
dog.breed // => "Labrador"
```

## TaggedClass

**Defining a tagged class**

```efx
schema Circle {
  _tag: "Circle"
  radius: number
}

const c = new Circle({ radius: 5 })
c._tag // => "Circle"
c.radius // => 5
```

## Error

**Schema-backed error**

```efx
class NotFound extends Schema.Error<NotFound>("NotFound")({
  id: Schema.Number
}) {}

const program = effect {
  await new NotFound({ id: 1 })
}
const error = await runPromise(flip(program))
error.id // => 1
```

## TaggedError

**Defining a tagged error class**

```efx
error NotFound {
  id: number
}

const program = effect {
  await new NotFound({ id: 42 })
}
const error = await runPromise(flip(program))
error._tag // => "NotFound"
error.id // => 42
```

## toEquivalence

**Comparing structs**

```efx
import { Schema } from "effect"

const eq = Schema.toEquivalence(Schema.Struct({ id: Schema.Number, name: Schema.String }))

eq({ id: 1, name: "Alice" }, { id: 1, name: "Alice" }) // => true
eq({ id: 1, name: "Alice" }, { id: 2, name: "Alice" }) // => false
```

## ToJsonSchemaOptions.includeAnnotationKey

**Including custom annotations**

```efx
import { Schema } from "effect"

const schema = Schema.String.annotate({
  description: "A name",
  markdownDescription: "The **name** field"
})

const doc = Schema.toJsonSchemaDocument(schema, {
  includeAnnotationKey: (key) =>
    key === "markdownDescription" || key.startsWith("x-")
})

doc.schema // => { type: "string", description: "A name", markdownDescription: "The **name** field" }
```

## toJsonSchemaDocument

**Decoding JSON with the matching codec**

```efx
import { Schema } from "effect"

const schema = Schema.Struct({
  name: Schema.optional(Schema.String)
})

const document = Schema.toJsonSchemaDocument(schema)
const jsonCodec = Schema.toCodecJson(schema)

Schema.decodeUnknownResult(schema)({ name: null })._tag // => "Failure"
Schema.decodeUnknownSync(jsonCodec)({ name: null }) // => { name: undefined }
Schema.decodeUnknownSync(jsonCodec)({}) // => {}
Schema.encodeSync(jsonCodec)({ name: undefined }) // => { name: null }
```

## Json

**Validating a JSON value**

```efx
import { Option, Schema } from "effect"

Schema.decodeUnknownOption(Schema.Json)({ key: [1, true, null] }) // => Option.some({ key: [1, true, null] })
```

## JsonObject

**Validating a JSON object**

```efx
import { Option, Schema } from "effect"

Schema.decodeUnknownOption(Schema.JsonObject)({ key: [1, true, null] }) // => Option.some({ key: [1, true, null] })
Schema.decodeUnknownOption(Schema.JsonObject)([1, 2, 3]) // => Option.none()
```

## Annotations.Annotations

**Defining your own annotations**

```efx
import { Schema } from "effect"

// Extend the Annotations interface with a custom `version` annotation
declare module "effect/Schema" {
  namespace Annotations {
    interface Annotations {
      readonly version?:
        | readonly [major: number, minor: number, patch: number]
        | undefined
    }
  }
}

// The `version` annotation is now recognized by the TypeScript compiler
const schema = Schema.String.annotate({ version: [1, 2, 0] })

// const version: readonly [major: number, minor: number, patch: number] | undefined
const version = Schema.resolveAnnotations(schema)?.["version"]

if (version) {
  // Access individual parts of the version
  version[1] // => 2
}
```
